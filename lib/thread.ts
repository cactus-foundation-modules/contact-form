import { prisma } from '@/lib/db/prisma'
import { hasPermission } from '@/lib/permissions/check'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { markdownToHtml } from '@/lib/sanitize'
import type { SessionUser } from '@/lib/auth/session'
import type { ReplySuggestionMessage } from '@/lib/conversations/types'
import type { SubmissionWithReplies, ThreadMessageContribution } from '@/modules/contact-form/lib/types'

// One enquiry, as a conversation.
//
// The detail page used to build this inline, and now two things want it: the
// page, which draws it, and the reply box's "suggest me something", which reads
// it. Both have to see the SAME conversation - a suggestion written without the
// customer's last reply in front of it is a suggestion about the wrong thing -
// so the merge lives here rather than being written twice.

const THREAD_MESSAGES_POINT = 'contact-form.thread-messages'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

/**
 * Extra thread entries other modules contribute, permission-filtered.
 *
 * Same gate the page has always applied: a contributor declares what somebody
 * must hold to see its messages, and somebody without it sees the conversation
 * without them - here as well as on the page, so the two cannot disagree about
 * what the conversation says.
 */
async function contributedMessages(submissionId: string, user: SessionUser): Promise<ThreadMessageContribution[]> {
  // Dynamic on purpose: the generated registry imports this module's own admin
  // components, which reach back into this module's lib. See
  // scripts/check-import-cycles.mjs for what a static import risks.
  const { moduleExtensionPointComponents } = await import('@/lib/modules/extension-points')
  const components = moduleExtensionPointComponents[THREAD_MESSAGES_POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  const wanted: string[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== THREAD_MESSAGES_POINT) continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      wanted.push(entry.id)
    }
  }

  const collected = await Promise.all(wanted.map((id) => {
    const getMessages = components[id] as ((submissionId: string) => Promise<ThreadMessageContribution[]>) | undefined
    return getMessages ? getMessages(submissionId) : Promise.resolve([])
  }))
  return collected.flat()
}

/** The whole conversation under the enquiry, oldest first: this module's own
 *  sent replies and everything other modules have caught, in one list. */
export async function threadMessagesFor(
  submission: SubmissionWithReplies,
  user: SessionUser,
): Promise<ThreadMessageContribution[]> {
  const contributions = await contributedMessages(submission.id, user)
  return [
    ...submission.replies.map((reply): ThreadMessageContribution => ({
      id: reply.id,
      createdAt: reply.createdAt,
      senderLabel: reply.sentByDisplayName ?? reply.sentByEmail,
      body: reply.body,
      // The signature exactly as it was sent. Replies from before signature
      // kinds existed have only the markdown source, so those are rendered the
      // way they always were.
      bodyHtml: reply.signatureSnapshotHtml
        ?? (reply.signatureSnapshot ? markdownToHtml(reply.signatureSnapshot, { breaks: true }) : undefined),
      direction: 'out',
    })),
    ...contributions,
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/**
 * The same conversation again, as plain words for something that has to READ it
 * rather than draw it.
 *
 * The enquiry itself goes first - it is the message everything else on the page
 * is an answer to, and it is never in the list above. The signature under each
 * reply is deliberately left out: it is the same block of markup on every one,
 * and repeating it half a dozen times says nothing at all.
 */
export function transcriptFor(
  submission: SubmissionWithReplies,
  messages: ThreadMessageContribution[],
): ReplySuggestionMessage[] {
  return [
    {
      role: 'them' as const,
      authorName: submission.name || null,
      sentAt: submission.createdAt,
      text: submission.message,
    },
    ...messages.map((message) => ({
      role: (message.direction ?? 'in') === 'out' ? ('us' as const) : ('them' as const),
      authorName: message.senderLabel || null,
      sentAt: message.createdAt,
      text: message.body,
    })),
  ].filter((message) => message.text.trim().length > 0)
}
