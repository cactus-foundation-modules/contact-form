import { describe, expect, it, vi, beforeEach } from 'vitest'

// The contact form's enquiries, in the shape core asks for when it wants to put
// several channels in one list.
//
// Nothing here is about the hub that eventually consumes them: the same shape
// earns a site running a contact form and a chat widget one merged list with no
// third module installed at all.

const getSubmission = vi.hoisted(() => vi.fn())
const listSubmissionSummaries = vi.hoisted(() => vi.fn())
const submissionSummariesForEmails = vi.hoisted(() => vi.fn())
const updateSubmission = vi.hoisted(() => vi.fn())
const replyToSubmission = vi.hoisted(() => vi.fn())
const syncMessagesNotification = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())

vi.mock('./db', () => ({
  getSubmission,
  listSubmissionSummaries,
  submissionSummariesForEmails,
  updateSubmission,
}))
vi.mock('./reply', () => ({ replyToSubmission }))
vi.mock('./notify', () => ({ syncMessagesNotification }))
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique } } }))

const { contactFormConversationProvider: provider } = await import('./conversation-provider')

const enquiry = {
  id: 'sub1',
  createdAt: new Date('2026-08-20T09:00:00Z'),
  updatedAt: new Date('2026-08-20T09:00:00Z'),
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '01234 567890',
  company: null,
  subject: 'Six desks',
  message: 'Could you quote for six desks, please?',
  ipAddress: null,
  userAgent: null,
  gdprConsent: true,
  status: 'unread' as const,
  sourceType: null,
  sourceId: null,
  sourceBlockId: null,
  sourceLabel: null,
  lastActivityAt: new Date('2026-08-20T09:00:00Z'),
  replyCount: 0,
}

beforeEach(() => {
  getSubmission.mockReset()
  listSubmissionSummaries.mockReset().mockResolvedValue([enquiry])
  submissionSummariesForEmails.mockReset().mockResolvedValue([enquiry])
  updateSubmission.mockReset().mockResolvedValue(undefined)
  replyToSubmission.mockReset().mockResolvedValue({ ok: true, replyId: 'r1' })
  syncMessagesNotification.mockReset().mockResolvedValue(undefined)
  findUnique.mockReset().mockResolvedValue({ displayName: 'Marcus', email: 'marcus@site.test' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('listing', () => {
  it('describes an enquiry the way a merged list needs it', async () => {
    const page = await provider.list({ limit: 25 })
    expect(page.items[0]).toEqual({
      id: 'sub1',
      channel: 'form',
      subject: 'Six desks',
      preview: 'Could you quote for six desks, please?',
      participant: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '01234 567890' },
      lastMessageAt: enquiry.lastActivityAt,
      unread: true,
      status: 'open',
      href: 'm/contact-form/inbox/sub1',
    })
  })

  it('links relative to the admin, because the admin address is per site', async () => {
    const page = await provider.list({ limit: 25 })
    expect(page.items[0]!.href.startsWith('/')).toBe(false)
    expect(page.items[0]!.href).not.toContain('://')
  })

  it('offers a cursor only when the page was full', async () => {
    expect((await provider.list({ limit: 25 })).nextCursor).toBeUndefined()
    expect((await provider.list({ limit: 1 })).nextCursor).toBe(enquiry.lastActivityAt.toISOString())
  })

  it('reads the cursor back as where to carry on from', async () => {
    await provider.list({ limit: 25, cursor: '2026-08-01T00:00:00.000Z' })
    expect(listSubmissionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ before: new Date('2026-08-01T00:00:00.000Z') }),
    )
  })

  it('ignores a cursor that means nothing rather than asking for rows before NaN', async () => {
    await provider.list({ limit: 25, cursor: 'yesterday-ish' })
    expect(listSubmissionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ before: undefined }),
    )
  })

  it('says an archived enquiry is closed', async () => {
    listSubmissionSummaries.mockResolvedValue([{ ...enquiry, status: 'archived' }])
    const page = await provider.list({ limit: 25 })
    expect(page.items[0]).toMatchObject({ status: 'closed', unread: false })
  })
})

describe('one conversation', () => {
  it('is the enquiry then the replies, oldest first', async () => {
    getSubmission.mockResolvedValue({
      ...enquiry,
      replies: [
        {
          id: 'r1',
          createdAt: new Date('2026-08-21T10:00:00Z'),
          submissionId: 'sub1',
          sentById: 'u1',
          sentByDisplayName: 'Marcus',
          sentByEmail: 'marcus@site.test',
          body: 'Happy to. **Six desks** it is.',
          signatureSnapshot: null,
          signatureSnapshotKind: null,
          signatureSnapshotHtml: '<p>Marcus</p>',
        },
      ],
    })

    const thread = await provider.thread('sub1')
    expect(thread!.messages.map((m) => m.direction)).toEqual(['in', 'out'])
    expect(thread!.messages[1]!.text).toContain('Six desks')
    expect(thread!.messages[1]!.html).toBe('<p>Marcus</p>')
    // The conversation's own clock is the newest reply, not the enquiry.
    expect(thread!.summary.lastMessageAt).toEqual(new Date('2026-08-21T10:00:00Z'))
  })

  it('is null for something that is not here', async () => {
    getSubmission.mockResolvedValue(null)
    expect(await provider.thread('nope')).toBeNull()
  })
})

describe('replying', () => {
  it('goes through the module’s own reply path, signature and all', async () => {
    await provider.send!('sub1', { text: 'On its way.', authorUserId: 'u1' })
    expect(replyToSubmission).toHaveBeenCalledWith({
      submissionId: 'sub1',
      body: 'On its way.',
      userId: 'u1',
      authorDisplayName: 'Marcus',
      authorEmail: 'marcus@site.test',
    })
  })

  it('passes the refusal on in the words it was given', async () => {
    replyToSubmission.mockResolvedValue({ ok: false, reason: 'That enquiry is not here any more.' })
    await expect(provider.send!('sub1', { text: 'hello', authorUserId: 'u1' })).rejects.toThrow(
      'That enquiry is not here any more.',
    )
  })
})

describe('marking read', () => {
  it('marks an unread enquiry read and keeps the count honest', async () => {
    getSubmission.mockResolvedValue({ ...enquiry, replies: [] })
    await provider.markRead!('sub1')
    expect(updateSubmission).toHaveBeenCalledWith('sub1', { status: 'read' })
  })

  it('leaves one that was already read alone', async () => {
    getSubmission.mockResolvedValue({ ...enquiry, status: 'read', replies: [] })
    await provider.markRead!('sub1')
    expect(updateSubmission).not.toHaveBeenCalled()
  })
})

describe('one person’s history', () => {
  it('asks by every address they are known by', async () => {
    await provider.byIdentity!({ emails: ['ada@example.com', 'ada@work.test'], phones: [] })
    expect(submissionSummariesForEmails).toHaveBeenCalledWith(['ada@example.com', 'ada@work.test'])
  })
})
