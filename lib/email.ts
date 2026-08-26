import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate, getSiteEmailContext, type SiteEmailContext } from '@/lib/email/render'
import { getEmailPalette, resolveEmailWrapper, wrapEmailHtml, type EmailPalette, type EmailWrapperLayout } from '@/lib/email/wrapper'
import { markdownToHtml, markdownToPlainText } from '@/lib/sanitize'
import type { ContactFormConfig, ContactSubmission } from './types'
import type { RenderedSignature } from './signature'

// ---------------------------------------------------------------------------
// The site's email design
// ---------------------------------------------------------------------------

// The owner notification goes out through renderEmailTemplate, which wraps it in
// the site's design on its way. The two emails a VISITOR receives - the auto
// reply and the reply somebody types in the inbox - did not: they are free text
// rather than a registered template, so they went out as bare markdown HTML with
// no logo, no colours and no footer, which is not what the rest of the site's
// email looks like.
//
// They use the site's default wrapper - the highest-priority published one, the
// same resolution core uses when a template names none. Deliberately not a
// setting: an owner who wants their reply email to look different from their
// order email can already say so by publishing a second wrapper and promoting
// it, and a per-form picker would only let one contact form disagree with
// another about what the whole site looks like.

export type ContactEmailContext = {
  palette: EmailPalette
  layout: EmailWrapperLayout | null
  site: SiteEmailContext
}

/** Fetched once per send and threaded through, because the signature renderer
 * needs the same palette and site values and neither read is free. */
export async function getContactEmailContext(): Promise<ContactEmailContext> {
  const [palette, layout, site] = await Promise.all([
    getEmailPalette(),
    resolveEmailWrapper(null),
    getSiteEmailContext(),
  ])
  return { palette, layout, site }
}

function wrapForVisitor(bodyHtml: string, subject: string, ctx: ContactEmailContext): string {
  return wrapEmailHtml({
    bodyHtml,
    subject,
    vars: {
      siteName: ctx.site.siteName,
      siteUrl: ctx.site.siteUrl,
      logoUrl: ctx.site.logoUrl,
      year: ctx.site.year,
    },
    palette: ctx.palette,
    // With no wrapper published this still returns a tidy centred card, which is
    // a better floor than the bare body these two used to send.
    layout: ctx.layout,
  })
}

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

  const subject = 'Thanks for getting in touch'
  const ctx = await getContactEmailContext()

  await sendEmail({
    to: submission.email,
    subject,
    html: wrapForVisitor(markdownToHtml(body, { breaks: true }), subject, ctx),
    // The plain-text alternative stays the message alone. A wrapper is a
    // picture frame; there is nothing in it a text-only reader wants.
    text: markdownToPlainText(body, { breaks: true }),
  })
}

/** The rule between a reply and its signature. Inline-styled rather than a bare
 * <hr>: Outlook draws its own three-dimensional default otherwise, which looks
 * like a mistake next to a designed signature. */
const SIGNATURE_RULE =
  '<hr style="border:0;border-top:1px solid #d8d6d1;margin:24px 0 16px;height:1px;" />'

export async function sendReply(opts: {
  submission: ContactSubmission
  replyBody: string
  /** Already rendered by lib/signature.ts - this function no longer knows or
   *  cares which kind it was authored in. Concatenating the two as markdown, as
   *  it once did, could only ever have worked for the markdown kind. */
  signature: RenderedSignature | null
  fromEmail: string
  /** Shared with the signature render, so one reply reads the site config once
   *  rather than twice. */
  emailContext: ContactEmailContext
}): Promise<void> {
  const { submission, replyBody, signature, emailContext } = opts

  const bodyHtml = markdownToHtml(replyBody, { breaks: true })
  const bodyText = markdownToPlainText(replyBody, { breaks: true })

  const emailSubject = submission.subject ? `Re: ${submission.subject}` : 'Re: Your contact form message'
  const inner = signature ? `${bodyHtml}${SIGNATURE_RULE}${signature.html}` : bodyHtml

  await sendEmail({
    to: submission.email,
    replyTo: opts.fromEmail,
    subject: emailSubject,
    html: wrapForVisitor(inner, emailSubject, emailContext),
    text: signature ? `${bodyText}\n\n---\n\n${signature.text}` : bodyText,
  })
}
