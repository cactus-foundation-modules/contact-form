import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/render'
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
    const rendered = await renderEmailTemplate('contact-form.new-message-brief', {
      name: submission.name,
      inboxUrl: inboxUrl ?? '',
      hasInboxUrl: inboxUrl ? 'true' : 'false',
      noInboxUrl: inboxUrl ? 'false' : 'true',
    })
    if (!rendered) return

    await sendEmail({
      to,
      cc: config.ccEmails.length ? config.ccEmails : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    return
  }

  const subjectSuffix = submission.subject ? `: ${submission.subject}` : ''

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

  const rendered = await renderEmailTemplate('contact-form.new-message-full', {
    // Already escaped above, field by field, and travelling as a rawTag - the
    // <p> and <blockquote> wrapping each value have to survive core's escaping.
    fields: htmlFields,
    subjectSuffix,
    name: submission.name,
    email: submission.email,
  })
  if (!rendered) return

  await sendEmail({
    to,
    cc: config.ccEmails.length ? config.ccEmails : undefined,
    replyTo: submission.email,
    subject: rendered.subject,
    html: rendered.html,
    // The plain-text alternative is still the flat field list built above: it
    // reads far better than a tag-stripped rendering of the HTML one.
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
