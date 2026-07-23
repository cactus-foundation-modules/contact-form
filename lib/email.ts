import { sendEmail } from '@/lib/email/index'
import { markdownToHtml, markdownToPlainText } from '@/lib/sanitize'
import type { ContactFormConfig, ContactSubmission } from './types'

// Escape every HTML-significant character so a submitted field can never inject
// markup into the owner notification email. Must run at the point of
// interpolation - stripping tags upstream is not enough, because a lone '<' with
// no closing '>' survives tag-stripping and is then closed by a later
// interpolation (e.g. the \n -> <br> conversion), reopening the injection.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendSubmissionNotification(
  submission: ContactSubmission,
  config: ContactFormConfig,
  siteAdminEmail: string,
  inboxUrl?: string | null
): Promise<void> {
  if (config.emailNotifyMode === 'off') return

  const to = config.notificationEmail ?? siteAdminEmail
  if (!to) return

  if (config.emailNotifyMode === 'notify') {
    const emailSubject = `New contact form message from ${submission.name}`
    const viewLine = inboxUrl ? `View and reply: ${inboxUrl}` : 'Log in to your site to view and reply.'
    const text = `You've received a new contact form message.\n\n${viewLine}`
    const html = `<div style="font-family:sans-serif;max-width:600px"><p>You've received a new contact form message.</p><p>${inboxUrl ? `<a href="${inboxUrl}">View and reply</a>` : 'Log in to your site to view and reply.'}</p></div>`

    await sendEmail({
      to,
      cc: config.ccEmails.length ? config.ccEmails : undefined,
      subject: emailSubject,
      html,
      text,
    })
    return
  }

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

  // Escape first, then convert newlines to <br> - never the other way round, or
  // the <br> we add becomes the closing bracket for a dangling submitted '<'.
  const emailEsc = escapeHtml(submission.email)
  const messageHtml = escapeHtml(submission.message).replace(/\n/g, '<br>')
  const htmlFields = [
    `<p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>`,
    `<p><strong>Email:</strong> <a href="mailto:${emailEsc}">${emailEsc}</a></p>`,
    submission.phone ? `<p><strong>Phone:</strong> ${escapeHtml(submission.phone)}</p>` : null,
    submission.company ? `<p><strong>Company:</strong> ${escapeHtml(submission.company)}</p>` : null,
    submission.subject ? `<p><strong>Subject:</strong> ${escapeHtml(submission.subject)}</p>` : null,
    `<p><strong>Message:</strong></p><blockquote><p>${messageHtml}</p></blockquote>`,
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
    html: markdownToHtml(body, { breaks: true }),
    text: markdownToPlainText(body, { breaks: true }),
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
    ? `${replyBody}\n\n${signature}`
    : replyBody

  const emailSubject = submission.subject ? `Re: ${submission.subject}` : 'Re: Your contact form message'

  await sendEmail({
    to: submission.email,
    replyTo: opts.fromEmail,
    subject: emailSubject,
    html: markdownToHtml(combined, { breaks: true }),
    text: markdownToPlainText(combined, { breaks: true }),
  })
}
