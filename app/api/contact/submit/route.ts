import { NextRequest, NextResponse } from 'next/server'
import { createSubmission, getSubmission } from '@/modules/contact-form/lib/db'
import { syncMessagesNotification } from '@/modules/contact-form/lib/notify'
import { validateSubmission, sanitiseField } from '@/modules/contact-form/lib/validate'
import { sendSubmissionNotification, sendAutoReply } from '@/modules/contact-form/lib/email'
import { checkContactRateLimit, checkContactEmailRateLimit } from '@/modules/contact-form/lib/rate-limit'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { clientIpFromHeaders } from '@/lib/auth/rate-limit'
import { isTurnstileConfigured, getSiteUrlOrNull } from '@/lib/config/env'
import { prisma } from '@/lib/db/prisma'
import { blockPropsToConfig, type ContactFormBlockProps } from '@/modules/contact-form/components/puck/ContactFormBlock'
import type { ContactFormConfig } from '@/modules/contact-form/lib/types'

// Recursively searches a list of blocks by type and id, descending into slot arrays in props.
function searchBlocks(blocks: unknown[], type: string, id: string): Record<string, unknown> | null {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; id?: string; props?: Record<string, unknown> }
    if (block.type === type && block.props?.id === id) return block.props ?? {}
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) {
          const found = searchBlocks(value, type, id)
          if (found) return found
        }
      }
    }
  }
  return null
}

// Searches Puck builder data for a block by type and id, including nested slots.
function findPuckBlock(data: unknown, type: string, id: string): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { content?: unknown[]; zones?: Record<string, unknown[]> }
  const roots: unknown[] = [
    ...(Array.isArray(d.content) ? d.content : []),
    ...Object.values(d.zones ?? {}).flat(),
  ]
  return searchBlocks(roots, type, id)
}

async function resolveConfig(
  path: string,
  blockId: string
): Promise<{ config: ContactFormConfig; sourceType: 'page' | 'layout'; sourceId: string; sourceLabel: string } | null> {
  // For the root path, resolve the configured homepage by ID rather than by slug.
  let page: { id: string; title: string | null; builderData: unknown } | null = null

  if (path === '/' || path === '') {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { homepageId: true },
    })
    if (cfg?.homepageId) {
      page = await prisma.infoPage.findUnique({
        where: { id: cfg.homepageId },
        select: { id: true, title: true, builderData: true },
      })
    }
  }

  if (!page) {
    const slug = path.replace(/^\//, '') || 'home'
    page = await prisma.infoPage.findFirst({
      where: { OR: [{ slug }, { slug: path }] },
      select: { id: true, title: true, builderData: true },
    })
  }

  if (page?.builderData) {
    let data: unknown
    try {
      data = typeof page.builderData === 'string' ? JSON.parse(page.builderData) : page.builderData
    } catch { /* fall through */ }
    const props = data ? findPuckBlock(data, 'ContactForm', blockId) : null
    if (props) {
      const slug = path.replace(/^\//, '') || 'home'
      return {
        config: blockPropsToConfig(props as ContactFormBlockProps),
        sourceType: 'page',
        sourceId: page.id,
        sourceLabel: page.title ?? slug,
      }
    }
  }

  // Try all layouts
  const layouts = await prisma.layout.findMany({
    select: { id: true, name: true, builderData: true },
  })

  for (const layout of layouts) {
    if (!layout.builderData) continue
    let data: unknown
    try {
      data = typeof layout.builderData === 'string' ? JSON.parse(layout.builderData) : layout.builderData
    } catch { continue }
    const props = findPuckBlock(data, 'ContactForm', blockId)
    if (props) {
      return {
        config: blockPropsToConfig(props as ContactFormBlockProps),
        sourceType: 'layout',
        sourceId: layout.id,
        sourceLabel: layout.name,
      }
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  // Step 1: Parse form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const path    = formData.get('path')?.toString() ?? ''
  const blockId = formData.get('blockId')?.toString() ?? ''

  if (!path || !blockId) {
    return NextResponse.json({ error: 'Missing path or blockId.' }, { status: 400 })
  }

  const raw = {
    name:           formData.get('name')?.toString() ?? '',
    email:          formData.get('email')?.toString() ?? '',
    phone:          formData.get('phone')?.toString() ?? '',
    company:        formData.get('company')?.toString() ?? '',
    subject:        formData.get('subject')?.toString() ?? '',
    message:        formData.get('message')?.toString() ?? '',
    gdprConsent:    formData.get('gdprConsent') === 'on' || formData.get('gdprConsent') === 'true',
    turnstileToken: formData.get('cf-turnstile-response')?.toString() ?? '',
  }

  const sanitised = {
    name:        sanitiseField(raw.name),
    email:       sanitiseField(raw.email),
    phone:       raw.phone ? sanitiseField(raw.phone) : null,
    company:     raw.company ? sanitiseField(raw.company) : null,
    subject:     raw.subject ? sanitiseField(raw.subject) : null,
    message:     sanitiseField(raw.message),
    gdprConsent: raw.gdprConsent,
  }

  // Step 2: Re-derive config server-side from saved builderData
  const resolved = await resolveConfig(path, blockId)
  if (!resolved) {
    return NextResponse.json({ error: 'The contact form is not currently available.' }, { status: 503 })
  }
  const { config, sourceType, sourceId, sourceLabel } = resolved

  // Step 3: Turnstile verification
  let turnstileVerified = false
  if (config.turnstileEnabled && isTurnstileConfigured()) {
    const ok = await verifyTurnstile(raw.turnstileToken)
    if (!ok) {
      return NextResponse.json(
        { errors: { _form: 'Please complete the security check and try again.' } },
        { status: 400 }
      )
    }
    turnstileVerified = true
  }

  // Step 4: rate limiting.
  //
  // The IP comes from the last forwarded hop, never the first: a caller can
  // prepend anything it likes to x-forwarded-for, and reading the leftmost entry
  // let a spammer rotate a fake address per request and skip the limit entirely.
  // And a request whose IP can't be established is limited under a shared key
  // rather than waved through, which is what "skip if null" used to do.
  const ip = clientIpFromHeaders((name) => request.headers.get(name))

  if (config.rateLimitEnabled) {
    const [ipAllowed, emailAllowed] = await Promise.all([
      checkContactRateLimit(ip, config, blockId),
      // Also limited per recipient address, so the form can't be pointed at one
      // person and used to mail-bomb them from a rotating set of addresses.
      checkContactEmailRateLimit(sanitised.email, config),
    ])
    if (!ipAllowed || !emailAllowed) {
      return NextResponse.json(
        { errors: { _form: 'You have sent too many messages recently. Please try again later.' } },
        { status: 429 }
      )
    }
  }

  // Step 5: Server-side validation
  const errors = validateSubmission(sanitised, config)
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 })
  }

  // Step 6: Store submission
  const userAgent = request.headers.get('user-agent') ?? null

  const submissionId = await createSubmission({
    name:         sanitised.name,
    email:        sanitised.email,
    phone:        config.showPhone ? sanitised.phone : null,
    company:      config.showCompany ? sanitised.company : null,
    subject:      config.showSubject ? sanitised.subject : null,
    message:      sanitised.message,
    ipAddress:    ip === 'unknown' ? null : ip,
    userAgent,
    gdprConsent:  sanitised.gdprConsent,
    sourceType,
    sourceId,
    sourceBlockId: blockId,
    sourceLabel,
  })

  // Keep the rolling "N unread messages" admin notification in step with the inbox.
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )

  // Step 7: Fetch site config for email fallback
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true, adminPath: true },
  })
  const siteAdminEmail = siteConfig?.emailFromAddress ?? ''
  const siteUrl = getSiteUrlOrNull()
  const inboxUrl = siteUrl && siteConfig?.adminPath
    ? `${siteUrl}/${siteConfig.adminPath}/m/contact-form/inbox/${submissionId}`
    : null

  const submission = await getSubmission(submissionId)
  if (submission) {
    sendSubmissionNotification(submission, config, siteAdminEmail, inboxUrl).catch((err) =>
      console.error('[contact-form] Notification email failed:', err)
    )

    // The auto-reply is the one email this endpoint sends to an address nobody
    // has verified - typed by an anonymous stranger, delivered from the site's
    // own trusted domain. That makes it an open relay of sorts: point the form at
    // a victim, and the site does the spamming. So it only goes out when a
    // Turnstile check actually passed, not merely when the owner ticked the
    // auto-reply box. Turning Turnstile off now costs the auto-reply, not the
    // message itself - the admin notification below is unaffected.
    if (config.autoReplyEnabled && config.autoReplyBody && turnstileVerified) {
      sendAutoReply(submission, config, siteConfig?.emailFromAddress ?? '').catch((err) =>
        console.error('[contact-form] Auto-reply email failed:', err)
      )
    }
  }

  return NextResponse.json({ success: true })
}
