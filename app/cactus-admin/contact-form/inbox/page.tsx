import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSubmissions } from '@/modules/contact-form/lib/db'
import SubmissionList from '@/modules/contact-form/components/admin/SubmissionList'

export const metadata = { title: 'Contact Inbox — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function ContactInboxPage({ searchParams }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!await hasPermission(user, 'contact.view')) {
    return <div className="alert alert-danger">You do not have permission to view contact submissions.</div>
  }

  const sp = await searchParams
  const status  = sp.status ?? 'all'
  const page    = parseInt(sp.page ?? '1', 10)
  const perPage = 25

  const { submissions, total } = await getSubmissions({ status, page, perPage })
  const totalPages = Math.ceil(total / perPage)

  const canDelete  = await hasPermission(user, 'contact.delete')
  const canExport  = await hasPermission(user, 'contact.export')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Contact Inbox</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {canExport && (
            <a
              href={`/api/m/contact-form/admin/export${status !== 'all' ? `?status=${status}` : ''}`}
              className="btn btn-secondary btn-sm"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      <SubmissionList
        submissions={submissions}
        total={total}
        page={page}
        totalPages={totalPages}
        status={status}
        canDelete={canDelete}
      />
    </div>
  )
}
