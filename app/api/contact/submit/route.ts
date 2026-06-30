import { NextRequest, NextResponse } from 'next/server'
import { createSubmission, getSubmission } from '@/modules/contact-form/lib/db'
import { validateSubmission, sanitiseField } from '@/modules/contact-form/lib/validate'
import { sendSubmissionNotification, sendAutoReply } from '@/modules/contact-form/lib/email'
import { checkContactRateLimit } from '@/modules/contact-form/lib/rate-limit'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { isTurnstileConfigured } from '@/lib/config/env'
import { prisma } from '@/lib/db/prisma'
import { blockPropsToConfig, type ContactFormBlockProps } from '@/modules/contact-form/components/puck/ContactFormBlock'
import type { ContactFormConfig } from '@/modules/contact-form/lib/types'

// Searches Puck builder data for a block by type and id.
function findPuckBlock(data: unknown, type: string, id: string): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { content?: unknown[]; zones?: Record<string, unknown[]> }
  const items: unknown[] = [
    ...(Array.isArray(d.content) ? d.content : []),
    ...Object.values(d.zones ?? {}).flat(),
  ]
  for (const item of items) {
    if (item && typeof item === 'object') {
      const block = item as { type?: string; id?: string; props?: Record<string, unknown> }
      if (block.type === type && block.id === id) return block.props ?? {}
    }
  }
  return null
}

async function resolveConfig(
  path: string,
  blockId: string
): Promise<{ config: ContactFormConfig; sourceType: 'page' | 'layout'; sourceId: string; sourceLabel: string } | null> {
  // Try InfoPage first: strip leading slash to get slug
  const slug = path.replace(/^\//, '') || 'home'
  const page = await prisma.infoPage.findFirst({
    where: { OR: [{ slug }, { slug: path }] },
    select: { id: true, title: true, builderData: true },
  })

  if (page?.builderData) {
    let data: unknown
    try {
      data = typeof page.builderData === 'string' ? JSON.parse(page.builderData) : page.builderData
    } catch { /* fall through */ }
    const props = data ? findPuckBlock(data, 'ContactForm', blockId) : null
    if (props) {
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
  if (config.turnstileEnabled && isTurnstileConfigured()) {
    const ok = await verifyTurnstile(raw.turnstileToken)
    if (!ok) {
      return NextResponse.json(
        { errors: { _form: 'Please complete the security check and try again.' } },
        { status: 400 }
      )
    }
  }

  // Step 4: IP-based rate limiting (scoped to this block)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null

  if (config.rateLimitEnabled && ip) {
    const allowed = await checkContactRateLimit(ip, config, blockId)
    if (!allowed) {
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
    ipAddress:    ip,
    userAgent,
    gdprConsent:  sanitised.gdprConsent,
    sourceType,
    sourceId,
    sourceBlockId: blockId,
    sourceLabel,
  })

  // Step 7: Fetch site config for email fallback
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true },
  })
  const siteAdminEmail = siteConfig?.emailFromAddress ?? ''

  const submission = await getSubmission(submissionId)
  if (submission) {
    sendSubmissionNotification(submission, config, siteAdminEmail).catch((err) =>
      console.error('[contact-form] Notification email failed:', err)
    )

    if (config.autoReplyEnabled && config.autoReplyBody) {
      sendAutoReply(submission, config, siteConfig?.emailFromAddress ?? '').catch((err) =>
        console.error('[contact-form] Auto-reply email failed:', err)
      )
    }
  }

  return NextResponse.json({ success: true })
}
