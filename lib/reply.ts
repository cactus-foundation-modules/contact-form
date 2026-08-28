import { prisma } from '@/lib/db/prisma'
import { createReply, getSubmission, getUserProfile, updateSubmission } from './db'
import { sendReply, getContactEmailContext } from './email'
import { renderSignature, signatureSnapshot } from './signature'
import { syncMessagesNotification } from './notify'

// Answering an enquiry, in one place.
//
// This used to live entirely inside the reply route, which was fine while the
// screen was the only way to answer one. It is a function now because a reply
// can arrive from more than one direction - the inbox screen, and anything else
// this module publishes a reply callback to - and two code paths that both send
// an email and both write a row are two chances for them to disagree about the
// signature, the order of operations, or whether the enquiry ends up marked
// read.
//
// The order is deliberate and is the whole safety story: SEND FIRST, then
// record. A failed send leaves nothing behind, so the person tries again. The
// other way round leaves a reply in the thread that the customer never
// received, which is worse than an error message by a wide margin.

export type ReplyOutcome =
  | { ok: true; replyId: string }
  | { ok: false; reason: string }

export async function replyToSubmission(input: {
  submissionId: string
  /** Markdown, as typed. */
  body: string
  /** Whose signature goes on it, and who the reply is recorded against. */
  userId: string
  authorDisplayName: string | null
  authorEmail: string
}): Promise<ReplyOutcome> {
  const submission = await getSubmission(input.submissionId)
  if (!submission) return { ok: false, reason: 'That enquiry is not here any more.' }

  // Whichever kind the sender authored their signature in, what leaves here is
  // one pair of html/text.
  const profile = await getUserProfile(input.userId)
  // One read of the site's palette, wrapper and name, shared by the signature
  // render and the wrapper the reply goes out in.
  const emailContext = await getContactEmailContext()
  const signature = await renderSignature(
    profile,
    { displayName: input.authorDisplayName, email: input.authorEmail },
    emailContext,
  )

  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true },
  })

  try {
    await sendReply({
      submission,
      replyBody: input.body,
      signature,
      fromEmail: siteConfig?.emailFromAddress ?? '',
      emailContext,
    })
  } catch (err) {
    console.error('[contact-form] Reply email failed:', err)
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'The reply could not be sent.',
    }
  }

  const replyId = await createReply({
    submissionId: input.submissionId,
    sentById: input.userId,
    body: input.body,
    ...signatureSnapshot(profile, signature),
  })

  await updateSubmission(input.submissionId, { status: 'read' })
  // Replying clears the unread flag - keep the rolling notification honest.
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )

  return { ok: true, replyId }
}
