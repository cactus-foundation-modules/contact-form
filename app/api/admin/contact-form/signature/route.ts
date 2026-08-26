import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { getUserProfile, upsertUserProfile } from '@/modules/contact-form/lib/db'
import { cleanSignatureHtml, renderSignature } from '@/modules/contact-form/lib/signature'
import { SIGNATURE_KINDS } from '@/modules/contact-form/lib/types'

const Body = z.object({
  kind: z.enum(['markdown', 'html', 'puck']),
  // All three are sent on every save, not only the active one: switching kind in
  // the editor must not throw away the other two, and a partial patch would.
  signature: z.string().max(5000).nullable(),
  signatureHtml: z.string().max(50000).nullable(),
  signaturePuck: z.unknown().nullable(),
  fullName: z.string().max(200).nullable(),
  jobTitle: z.string().max(200).nullable(),
  phoneDisplay: z.string().max(60).nullable(),
  phoneE164: z.string().max(30).nullable(),
})

function trimmedOrNull(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  return raw || null
}

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const profile = await getUserProfile(user.id)
  // The rendered form comes back with the raw one so the composer's preview and
  // the sent email are the same bytes - the composer cannot render a block-built
  // signature itself, and re-implementing it there would be how the two drift.
  const rendered = await renderSignature(profile, {
    displayName: user.displayName ?? null,
    email: user.email,
  })

  return NextResponse.json({
    kinds: SIGNATURE_KINDS,
    kind: profile?.signatureKind ?? 'markdown',
    signature: profile?.signature ?? null,
    signatureHtml: profile?.signatureHtml ?? null,
    signaturePuck: profile?.signaturePuck ?? null,
    fullName: profile?.fullName ?? null,
    jobTitle: profile?.jobTitle ?? null,
    phoneDisplay: profile?.phoneDisplay ?? null,
    phoneE164: profile?.phoneE164 ?? null,
    // Defaults for the merge tags, so the editor can show what {{FULL_NAME}} and
    // {{EMAIL}} will actually resolve to before anything has been filled in.
    accountDisplayName: user.displayName ?? null,
    accountEmail: user.email,
    renderedHtml: rendered?.html ?? null,
  })
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')
  const data = parsed.data

  await upsertUserProfile(user.id, {
    signatureKind: data.kind,
    signature:     trimmedOrNull(data.signature),
    // Sanitised on the way in rather than on the way out: what is stored is then
    // what was checked, and every later reader (send, preview, snapshot) gets the
    // same markup without having to remember to clean it again.
    signatureHtml: cleanSignatureHtml(data.signatureHtml ?? null),
    signaturePuck: data.signaturePuck ?? null,
    fullName:      trimmedOrNull(data.fullName),
    jobTitle:      trimmedOrNull(data.jobTitle),
    phoneDisplay:  trimmedOrNull(data.phoneDisplay),
    phoneE164:     trimmedOrNull(data.phoneE164),
  })

  const profile = await getUserProfile(user.id)
  const rendered = await renderSignature(profile, {
    displayName: user.displayName ?? null,
    email: user.email,
  })

  return NextResponse.json({ success: true, renderedHtml: rendered?.html ?? null })
}
