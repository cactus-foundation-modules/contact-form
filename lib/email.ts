import { sendEmail } from '@/lib/email/index'
import { markdownToHtml, markdownToPlainText } from '@/lib/sanitize'
import type { ContactFormConfig, ContactSubmission } from './types'

export async function sendSubmissionNotification(
  submission: ContactSubmission,
  config: ContactFormConfig,
  siteAdminEmail: string
): Promise<void> {
  const to = config.notificationEmail ?? siteAdminEmail
  if (!to) return

  const subjectSuffix = submission.subject ? `: ${submission.subject}` : ''
  const emailSubject = `New contact form submission${subjectSuffix}`

  const fields = [
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    submission.phone ? `Phone: ${submission.phone}` : null,
    submission.company ? `Company: ${submission.company}` : null,
    submission.subject ? `Subject: ${submission.subject}` : null,
    `Message:\n${submission.message}`,
    submission.gdprConsent ? 'GDPR consent: Yes' : null,
    `Received: ${submission.createdAt.toISOString()}`,
  ].filter(Boolean).join('\n\n')

  const htmlFields = [
    `<p><strong>Name:</strong> ${submission.name}</p>`,
    `<p><strong>Email:</strong> <a href="mailto:${submission.email}">${submission.email}</a></p>`,
    submission.phone ? `<p><strong>Phone:</strong> ${submission.phone}</p>` : null,
    submission.company ? `<p><strong>Company:</strong> ${submission.company}</p>` : null,
    submission.subject ? `<p><strong>Subject:</strong> ${submission.subject}</p>` : null,
    `<p><strong>Message:</strong></p><blockquote><p>${submission.message.replace(/\n/g, '<br>')}</p></blockquote>`,
    submission.gdprConsent ? `<p><strong>GDPR consent:</strong> Yes</p>` : null,
    `<p><em>Received: ${submission.createdAt.toISOString()}</em></p>`,
  ].filter(Boolean).join('')

  await sendEmail({
    to,
    cc: config.ccEmails.length ? config.ccEmails : undefined,
    replyTo: submission.email,
    subject: emailSubject,
    html: `<div style="font-family:sans-serif;max-width:600px">${htmlFields}</div>`,
    text: fields,
  })
}

export async function sendAutoReply(
  submission: ContactSubmission,
  config: ContactFormConfig,
  fromEmail: string
): Promise<void> {
  if (!config.autoReplyEnabled || !config.autoReplyBody || !fromEmail) return

  const body = config.autoReplyBody
    .replace(/\{\{name\}\}/g, submission.name)
    .replace(/\{\{email\}\}/g, submission.email)

  await sendEmail({
    to: submission.email,
    subject: 'Thanks for getting in touch',
    html: markdownToHtml(body),
    text: markdownToPlainText(body),
  })
}

export async function sendReply(opts: {
  submission: ContactSubmission
  replyBody: string
  signature: string | null
  fromEmail: string
}): Promise<void> {
  const { submission, replyBody, signature } = opts

  const combined = signature
    ? `${replyBody}\n\n---\n\n${signature}`
    : replyBody

  const emailSubject = submission.subject ? `Re: ${submission.subject}` : 'Re: Your contact form message'

  await sendEmail({
    to: submission.email,
    replyTo: opts.fromEmail,
    subject: emailSubject,
    html: markdownToHtml(combined),
    text: markdownToPlainText(combined),
  })
}
