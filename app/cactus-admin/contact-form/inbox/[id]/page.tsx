import { formatInSiteTimezone, getSiteTimezone } from '@/lib/config/timezone'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getSubmission, updateSubmission } from '@/modules/contact-form/lib/db'
import type { ThreadMessageContribution } from '@/modules/contact-form/lib/types'
import { markdownToHtml } from '@/lib/sanitize'
import ReplyComposer from '@/modules/contact-form/components/admin/ReplyComposer'
import DeleteSubmissionButton from '@/modules/contact-form/components/admin/DeleteSubmissionButton'
import ArchiveToggleButton from '@/modules/contact-form/components/admin/ArchiveToggleButton'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Submission — Contact Inbox' }

type Props = { params: Promise<{ id: string }> }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function SubmissionDetailPage({ params }: Props) {
  // Server-rendered, so the machine's own clock is UTC. Every stamp on this
  // page is read in the site's zone instead.
  const timezone = await getSiteTimezone()
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!await hasPermission(user, 'contact.view')) {
    return <div className="alert alert-danger">You do not have permission to view contact submissions.</div>
  }

  const { id } = await params
  const submission = await getSubmission(id)
  if (!submission) notFound()

  // Mark as read on view
  if (submission.status === 'unread') {
    await updateSubmission(id, { status: 'read' })
  }

  const canReply  = await hasPermission(user, 'contact.reply')
  const canDelete = await hasPermission(user, 'contact.delete')

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  // Other modules (e.g. Reply Catcher) can contribute content here via the
  // "contact-form.submission-detail" extension point — permission-filtered live
  // from Module.manifest, same pattern as sidebar navEntries.
  const activeModules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })
  const detailExtraIds: string[] = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'contact-form.submission-detail') continue
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        detailExtraIds.push(entry.id)
      }
    }
  }
  const detailExtraComponents = moduleExtensionPointComponents['contact-form.submission-detail'] ?? {}

  // Other modules (e.g. Reply Catcher) can contribute extra thread messages
  // (e.g. replies caught from a real mailbox) via the "contact-form.thread-messages"
  // extension point. Contributions are merged chronologically with the
  // submission's own replies into a single timeline below.
  const threadExtraIds: string[] = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'contact-form.thread-messages') continue
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        threadExtraIds.push(entry.id)
      }
    }
  }
  const threadExtraFns = moduleExtensionPointComponents['contact-form.thread-messages'] ?? {}
  const threadContributions = (
    await Promise.all(
      threadExtraIds.map((extraId) => {
        const getMessages = threadExtraFns[extraId] as
          | ((submissionId: string) => Promise<ThreadMessageContribution[]>)
          | undefined
        return getMessages ? getMessages(id) : Promise.resolve([])
      })
    )
  ).flat()

  const threadMessages: ThreadMessageContribution[] = [
    ...submission.replies.map((reply) => ({
      id: reply.id,
      createdAt: reply.createdAt,
      senderLabel: reply.sentByDisplayName ?? reply.sentByEmail,
      body: reply.body,
      // The signature exactly as it was sent. Replies from before signature
      // kinds existed have only the markdown source, so those are rendered the
      // way they always were.
      bodyHtml: reply.signatureSnapshotHtml
        ?? (reply.signatureSnapshot ? markdownToHtml(reply.signatureSnapshot, { breaks: true }) : undefined),
    })),
    ...threadContributions,
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href={`/${adminPath}/inbox?tab=contact-form`} className="btn btn-secondary btn-sm">
            ← Inbox
          </Link>
          <h1 className="page-title" style={{ margin: 0 }}>
            {submission.subject ?? `Message from ${submission.name}`}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <ArchiveToggleButton submissionId={id} archived={submission.status === 'archived'} />
          {canDelete && <DeleteSubmissionButton submissionId={id} />}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 2rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>From</div>
            <div style={{ fontWeight: 500 }}>{submission.name}</div>
            <a href={`mailto:${submission.email}`} style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>{submission.email}</a>
          </div>
          {submission.phone && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Phone</div>
              <div>{submission.phone}</div>
            </div>
          )}
          {submission.company && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Company</div>
              <div>{submission.company}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Received</div>
            <div style={{ fontSize: '0.875rem' }}>{formatInSiteTimezone(submission.createdAt, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Page</div>
            <div style={{ fontSize: '0.875rem' }}>
              {submission.sourceLabel ?? <span style={{ color: 'var(--color-text-secondary)' }}>Unknown</span>}
            </div>
          </div>
          {submission.gdprConsent && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>GDPR</div>
              <div style={{ fontSize: '0.875rem' }}>Consent given</div>
            </div>
          )}
        </div>

        <hr style={{ margin: '1rem 0', borderColor: 'var(--color-border)' }} />

        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(submission.message, { breaks: true }) }}
        />
      </div>

      {threadMessages.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Replies</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {threadMessages.map((msg) => (
              <div
                key={msg.id}
                className="card"
                style={{
                  borderLeft: `3px solid ${msg.badge ? 'var(--color-border-strong)' : 'var(--color-accent)'}`,
                  background: msg.badge ? 'var(--color-bg-subtle)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    {msg.senderLabel}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    {formatInSiteTimezone(msg.createdAt, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className="prose"
                  style={{ fontSize: '0.9375rem' }}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.body, { breaks: true }) }}
                />
                {msg.bodyHtml && (
                  /* On white with the light scheme pinned: a sent signature
                     carries its own fixed colours, which an email needs and the
                     admin's dark mode would fight. */
                  <div
                    style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}
                  >
                    <div
                      style={{ padding: '0.75rem', borderRadius: 6, background: '#ffffff', colorScheme: 'light', overflowX: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {detailExtraIds.map((extraId) => {
        const DetailExtra = detailExtraComponents[extraId]
        return DetailExtra ? <DetailExtra key={extraId} submissionId={id} /> : null
      })}

      {canReply && (
        <ReplyComposer submissionId={id} submissionEmail={submission.email} />
      )}
    </div>
  )
}
