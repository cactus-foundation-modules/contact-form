import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSubmission, updateSubmission } from '@/modules/contact-form/lib/db'
import { markdownToHtml } from '@/lib/sanitize'
import ReplyComposer from '@/modules/contact-form/components/admin/ReplyComposer'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Submission — Contact Inbox' }

type Props = { params: Promise<{ id: string }> }

export default async function SubmissionDetailPage({ params }: Props) {
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

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/cactus-admin/contact-form/inbox" className="btn btn-secondary btn-sm">
            ← Inbox
          </Link>
          <h1 className="page-title" style={{ margin: 0 }}>
            {submission.subject ?? `Message from ${submission.name}`}
          </h1>
        </div>
        {canDelete && (
          <form method="POST" action={`/api/admin/contact-form/submissions/${id}`}>
            <input type="hidden" name="_method" value="DELETE" />
            <button
              type="submit"
              className="btn btn-danger btn-sm"
              onClick={(e) => {
                if (!confirm('Delete this submission and all its replies?')) e.preventDefault()
              }}
            >
              Delete
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 2rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>From</div>
            <div style={{ fontWeight: 500 }}>{submission.name}</div>
            <a href={`mailto:${submission.email}`} style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>{submission.email}</a>
          </div>
          {submission.phone && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Phone</div>
              <div>{submission.phone}</div>
            </div>
          )}
          {submission.company && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Company</div>
              <div>{submission.company}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Received</div>
            <div style={{ fontSize: '0.875rem' }}>{submission.createdAt.toLocaleString('en-GB')}</div>
          </div>
          {submission.gdprConsent && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>GDPR</div>
              <div style={{ fontSize: '0.875rem' }}>Consent given</div>
            </div>
          )}
        </div>

        <hr style={{ margin: '1rem 0', borderColor: 'var(--color-border)' }} />

        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(submission.message) }}
        />
      </div>

      {submission.replies.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Replies</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {submission.replies.map((reply) => (
              <div key={reply.id} className="card" style={{ borderLeft: '3px solid var(--color-accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    {reply.sentByDisplayName ?? reply.sentByEmail}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    {reply.createdAt.toLocaleString('en-GB')}
                  </span>
                </div>
                <div
                  className="prose"
                  style={{ fontSize: '0.9375rem' }}
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(
                      reply.signatureSnapshot
                        ? `${reply.body}\n\n---\n\n${reply.signatureSnapshot}`
                        : reply.body
                    ),
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {canReply && (
        <ReplyComposer submissionId={id} submissionEmail={submission.email} />
      )}
    </div>
  )
}
