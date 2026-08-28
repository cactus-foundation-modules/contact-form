import { markdownToPlainText } from '@/lib/sanitize'
import type {
  ConversationListOptions,
  ConversationListPage,
  ConversationMessage,
  ConversationProvider,
  ConversationSummary,
  ConversationThread,
} from '@/lib/conversations/types'
import {
  getSubmission,
  listSubmissionSummaries,
  submissionSummariesForEmails,
  updateSubmission,
  type SubmissionSummaryRow,
} from './db'
import { replyToSubmission } from './reply'
import { syncMessagesNotification } from './notify'
import { prisma } from '@/lib/db/prisma'

// Contact form enquiries, published as conversations.
//
// Core's Inbox page can merge every channel a site runs into one list, and it
// can only do that with data - a React panel is opaque to it. So the same
// enquiries the inbox tab shows are offered here in the shape core asks for,
// which is what earns a site with a contact form and a chat widget a single
// merged list without either module knowing the other exists.
//
// Nothing in this file knows or cares who is reading it. It is the module's own
// data, in a shape core defined, and the deep link points back at this module's
// own screen.
//
// SERVER ONLY. The manifest entry sets serverOnly so this never reaches a
// browser bundle: it reads the database directly and sends email.

const PREVIEW_CHARS = 160

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1)}…` : flat
}

function toSummary(row: SubmissionSummaryRow): ConversationSummary {
  return {
    id: row.id,
    channel: 'form',
    subject: row.subject ?? 'Contact form enquiry',
    preview: preview(row.message),
    participant: {
      name: row.name || null,
      email: row.email || null,
      phone: row.phone,
    },
    lastMessageAt: row.lastActivityAt,
    unread: row.status === 'unread',
    status: row.status === 'archived' ? 'closed' : 'open',
    // Admin-root relative, no leading slash: the admin path is per site and
    // only the page rendering the link knows what it is.
    href: `m/contact-form/inbox/${row.id}`,
  }
}

async function list(opts: ConversationListOptions): Promise<ConversationListPage> {
  // The cursor is the last row's activity timestamp. A timestamp rather than an
  // offset because an enquiry arriving mid-listing would otherwise shift every
  // page after it and make one repeat.
  const before = opts.cursor ? new Date(opts.cursor) : undefined
  const rows = await listSubmissionSummaries({
    since: opts.since,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit: opts.limit,
  })
  const items = rows.map(toSummary)
  const last = rows[rows.length - 1]
  return {
    items,
    nextCursor: rows.length >= opts.limit && last ? last.lastActivityAt.toISOString() : undefined,
  }
}

async function thread(id: string): Promise<ConversationThread | null> {
  const submission = await getSubmission(id)
  if (!submission) return null

  const replyCount = submission.replies.length
  const lastActivityAt = submission.replies.length
    ? submission.replies[submission.replies.length - 1]!.createdAt
    : submission.createdAt

  const summary = toSummary({ ...submission, lastActivityAt, replyCount })

  const messages: ConversationMessage[] = [
    {
      id: submission.id,
      direction: 'in',
      authorName: submission.name || null,
      text: submission.message,
      html: null,
      sentAt: submission.createdAt,
      attachments: [],
    },
    ...submission.replies.map((reply) => ({
      id: reply.id,
      direction: 'out' as const,
      authorName: reply.sentByDisplayName || reply.sentByEmail || null,
      // The body is markdown as it was typed; the signature was rendered at the
      // moment it went out and is stored as the markup that was actually sent.
      text: markdownToPlainText(reply.body, { breaks: true }),
      html: reply.signatureSnapshotHtml,
      sentAt: reply.createdAt,
      attachments: [],
    })),
  ]

  return { summary, messages }
}

async function send(
  id: string,
  body: { text: string; html?: string; authorUserId: string },
): Promise<void> {
  // Straight through the module's own reply path, so the site's signature, its
  // email design and its unread count all behave exactly as they do when
  // somebody answers from the contact form's own screen.
  const author = await prisma.user.findUnique({
    where: { id: body.authorUserId },
    select: { displayName: true, email: true },
  })
  if (!author) throw new Error('That account could not be found, so the reply was not sent.')

  const result = await replyToSubmission({
    submissionId: id,
    body: body.text,
    userId: body.authorUserId,
    authorDisplayName: author.displayName ?? null,
    authorEmail: author.email,
  })
  if (!result.ok) throw new Error(result.reason)
}

async function markRead(id: string): Promise<void> {
  const submission = await getSubmission(id)
  if (!submission || submission.status !== 'unread') return
  await updateSubmission(id, { status: 'read' })
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )
}

async function byIdentity(identity: { emails: string[] }): Promise<ConversationSummary[]> {
  const rows = await submissionSummariesForEmails(identity.emails)
  return rows.map(toSummary)
}

export const contactFormConversationProvider: ConversationProvider = {
  label: 'Contact form',
  channel: 'form',
  capabilities: { reply: true, markRead: true, byIdentity: true },
  list,
  thread,
  send,
  markRead,
  byIdentity,
}
