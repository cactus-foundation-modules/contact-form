import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { prisma } from '@/lib/db/prisma'
import { getSubmission, createReply, getUserProfile, updateSubmission } from '@/modules/contact-form/lib/db'
import { syncMessagesNotification } from '@/modules/contact-form/lib/notify'
import { sendReply, getContactEmailContext } from '@/modules/contact-form/lib/email'
import { renderSignature, signatureSnapshot } from '@/modules/contact-form/lib/signature'

const Body = z.object({
  body: z.string().min(1, 'Reply body is required.').max(50000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.reply')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const submission = await getSubmission(id)
  if (!submission) return errorResponse('Submission not found', 404)

  // Fetch and render the sender's signature. Whichever kind they authored it
  // in, what leaves here is one pair of html/text.
  const profile = await getUserProfile(user.id)
  // One read of the site's palette, wrapper and name, shared by the signature
  // render and the wrapper the reply goes out in.
  const emailContext = await getContactEmailContext()
  const signature = await renderSignature(
    profile,
    { displayName: user.displayName ?? null, email: user.email },
    emailContext,
  )

  // Send the reply email first - only persist the reply once it's actually
  // sent, so a failed send doesn't leave a phantom reply in the thread that
  // the submitter never received.
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true },
  })

  try {
    await sendReply({
      submission,
      replyBody:  parsed.data.body,
      signature,
      fromEmail:  siteConfig?.emailFromAddress ?? '',
      emailContext,
    })
  } catch (err) {
    console.error('[contact-form] Reply email failed:', err)
    return errorResponse(err instanceof Error ? err.message : 'Failed to send reply email', 502)
  }

  // Store reply
  const replyId = await createReply({
    submissionId: id,
    sentById:     user.id,
    body:         parsed.data.body,
    ...signatureSnapshot(profile, signature),
  })

  // Mark submission as read
  await updateSubmission(id, { status: 'read' })
  // Replying clears the unread flag - keep the rolling notification honest.
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )

  return NextResponse.json({ id: replyId }, { status: 201 })
}
