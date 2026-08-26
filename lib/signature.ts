import { markdownToHtml, markdownToPlainText, sanitizeEmailHtml, emailHtmlToPlainText } from '@/lib/sanitize'
import { interpolate } from '@/lib/email/blocks'
import { renderEmailSignatureHtml, type EmailSignatureData } from '@/lib/email/signature'
import { getEmailPalette, type EmailPalette } from '@/lib/email/wrapper'
import { getSiteEmailContext, type SiteEmailContext } from '@/lib/email/render'
import type { ContactUserProfile, SignatureKind } from './types'

// Turns whichever kind of signature a person has authored into the pair every
// email needs: the HTML the inbox shows, and the plain text a text-only client
// falls back to.
//
// Kept in one place because three callers need identical output - the send, the
// composer's preview, and the copy stored against a sent reply. A preview that
// renders by a different route is a preview that lies.

export type RenderedSignature = { html: string; text: string }

export type SignatureAuthor = {
  displayName: string | null
  email: string
}

/** The per-person merge values an HTML or block-built signature can carry.
 *  Uppercase because that is the convention a pasted corporate signature
 *  arrives with; core's own site tags ({{siteName}}, {{year}}) still work
 *  alongside them. A field left blank renders as nothing rather than as literal
 *  braces, which is what `interpolate` does with any tag it cannot fill. */
export function signatureMergeVars(
  profile: Pick<ContactUserProfile, 'fullName' | 'jobTitle' | 'phoneDisplay' | 'phoneE164'> | null,
  author: SignatureAuthor,
): Record<string, string> {
  return {
    // The profile's own name wins, then the account's display name: somebody
    // who signs off as "Chris" need not rename their login to do it.
    FULL_NAME: profile?.fullName?.trim() || author.displayName?.trim() || '',
    JOB_TITLE: profile?.jobTitle?.trim() || '',
    EMAIL: author.email,
    PHONE_DISPLAY: profile?.phoneDisplay?.trim() || '',
    PHONE_E164: profile?.phoneE164?.trim() || '',
  }
}

function isEmptyPuck(data: unknown): boolean {
  const content = (data as EmailSignatureData | null)?.content
  return !Array.isArray(content) || content.length === 0
}

/** True when this profile would actually put something at the foot of a reply. */
export function hasSignature(profile: ContactUserProfile | null): boolean {
  if (!profile) return false
  switch (profile.signatureKind) {
    case 'html': return Boolean(profile.signatureHtml?.trim())
    case 'puck': return !isEmptyPuck(profile.signaturePuck)
    default: return Boolean(profile.signature?.trim())
  }
}

/** The site values the block-built kind needs. The send path already has these
 *  in hand (the wrapper needs the same two), so it passes them in rather than
 *  making one reply read the site config twice. */
export type SignatureRenderContext = { palette: EmailPalette; site: SiteEmailContext }

/** Renders a profile's signature, or null when there is nothing to render.
 *
 * Touches the database (site palette, site name) only for the block-built kind,
 * and only when the caller has not already got them - the markdown and HTML
 * kinds are pure string work, and making every reply pay for two extra reads to
 * append four lines of text would be a poor trade. */
export async function renderSignature(
  profile: ContactUserProfile | null,
  author: SignatureAuthor,
  ctx?: SignatureRenderContext,
): Promise<RenderedSignature | null> {
  if (!hasSignature(profile) || !profile) return null
  const vars = signatureMergeVars(profile, author)

  if (profile.signatureKind === 'html') {
    // Sanitised on save, so the stored markup is already safe; the merge values
    // are escaped here because they are typed into a form and this is the point
    // where they enter markup.
    const html = interpolate(profile.signatureHtml ?? '', vars, true)
    return { html, text: emailHtmlToPlainText(html) }
  }

  if (profile.signatureKind === 'puck') {
    const resolved: SignatureRenderContext = ctx ?? await (async () => {
      const [palette, site] = await Promise.all([getEmailPalette(), getSiteEmailContext()])
      return { palette, site }
    })()
    const { palette, site } = resolved
    const html = renderEmailSignatureHtml({
      data: profile.signaturePuck as EmailSignatureData,
      vars: { siteName: site.siteName, siteUrl: site.siteUrl, logoUrl: site.logoUrl, year: site.year, ...vars },
      colours: palette.colours,
      fonts: palette.fonts,
    })
    if (!html) return null
    return { html, text: emailHtmlToPlainText(html) }
  }

  const markdown = profile.signature ?? ''
  return {
    html: markdownToHtml(markdown, { breaks: true }),
    text: markdownToPlainText(markdown, { breaks: true }),
  }
}

/** The stored form of a signature at the moment a reply went out. The markdown
 * source is kept for the markdown kind so an old thread still reads as it was
 * written; every kind keeps the rendered HTML, because the profile it came from
 * is editable and the email that left is not. */
export function signatureSnapshot(
  profile: ContactUserProfile | null,
  rendered: RenderedSignature | null,
): { signatureSnapshot: string | null; signatureSnapshotKind: SignatureKind | null; signatureSnapshotHtml: string | null } {
  if (!rendered || !profile) {
    return { signatureSnapshot: null, signatureSnapshotKind: null, signatureSnapshotHtml: null }
  }
  return {
    signatureSnapshot: profile.signatureKind === 'markdown' ? profile.signature : null,
    signatureSnapshotKind: profile.signatureKind,
    signatureSnapshotHtml: rendered.html,
  }
}

/** Sanitises pasted signature markup on the way in. Exported so the save route
 * and any future importer clean it the same way. */
export function cleanSignatureHtml(html: string | null): string | null {
  const raw = (html ?? '').trim()
  if (!raw) return null
  const clean = sanitizeEmailHtml(raw).trim()
  return clean || null
}
