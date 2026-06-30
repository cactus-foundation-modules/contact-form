import { NextRequest, NextResponse } from 'next/server'
import { getContactFormConfig, createSubmission, getSubmission } from '@/modules/contact-form/lib/db'
import { validateSubmission, sanitiseField } from '@/modules/contact-form/lib/validate'
import { sendSubmissionNotification, sendAutoReply } from '@/modules/contact-form/lib/email'
import { checkContactRateLimit } from '@/modules/contact-form/lib/rate-limit'
import { verifyTurnstile } from '@/lib/auth/turnstile'
import { prisma } from '@/lib/db/prisma'

export async function POST(request: NextRequest) {
  // Step 1: Parse and sanitise input
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
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

  // Step 2: Load config
  const config = await getContactFormConfig()
  if (!config) {
    return NextResponse.json({ error: 'The contact form is not currently available.' }, { status: 503 })
  }

  // Step 3: Turnstile verification
  if (config.turnstileEnabled) {
    const ok = await verifyTurnstile(raw.turnstileToken)
    if (!ok) {
      return NextResponse.json(
        { errors: { _form: 'Please complete the security check and try again.' } },
        { status: 400 }
      )
    }
  }

  // Step 4: IP-based rate limiting
  if (config.rateLimitEnabled) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (ip !== 'unknown') {
      const allowed = await checkContactRateLimit(ip, config)
      if (!allowed) {
        return NextResponse.json(
          { errors: { _form: 'You have sent too many messages recently. Please try again later.' } },
          { status: 429 }
        )
      }
    }
  }

  // Step 5: Server-side validation
  const errors = validateSubmission(sanitised, config)
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 })
  }

  // Step 6: Store submission
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  const userAgent = request.headers.get('user-agent') ?? null

  const submissionId = await createSubmission({
    name:        sanitised.name,
    email:       sanitised.email,
    phone:       config.showPhone ? sanitised.phone : null,
    company:     config.showCompany ? sanitised.company : null,
    subject:     config.showSubject ? sanitised.subject : null,
    message:     sanitised.message,
    ipAddress:   ip,
    userAgent,
    gdprConsent: sanitised.gdprConsent,
  })

  // Step 7: Fetch site config for email fallback
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true },
  })
  const siteAdminEmail = siteConfig?.emailFromAddress ?? ''

  const submission = await getSubmission(submissionId)
  if (submission) {
    // Step 8: Notification email (fire and forget)
    sendSubmissionNotification(submission, config, siteAdminEmail).catch((err) =>
      console.error('[contact-form] Notification email failed:', err)
    )

    // Step 9: Auto-reply (fire and forget)
    if (config.autoReplyEnabled && config.autoReplyBody) {
      sendAutoReply(submission, config, siteConfig?.emailFromAddress ?? '').catch((err) =>
        console.error('[contact-form] Auto-reply email failed:', err)
      )
    }
  }

  return NextResponse.json({ success: true })
}
