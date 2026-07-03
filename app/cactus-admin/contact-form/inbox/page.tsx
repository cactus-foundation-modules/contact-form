import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { getSubmissions } from '@/modules/contact-form/lib/db'
import SubmissionList from '@/modules/contact-form/components/admin/SubmissionList'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { headers } from 'next/headers'

export const metadata = { title: 'Contact Inbox — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

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
  const canReply   = await hasPermission(user, 'contact.reply')

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  // Other modules (e.g. Reply Catcher) can contribute an action button here via
  // the "contact-form.inbox-actions" extension point — permission-filtered live
  // from Module.manifest, same pattern as sidebar navEntries.
  const activeModules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  const inboxActionIds: string[] = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'contact-form.inbox-actions') continue
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        inboxActionIds.push(entry.id)
      }
    }
  }
  const inboxActionComponents = moduleExtensionPointComponents['contact-form.inbox-actions'] ?? {}

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Contact Inbox</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {inboxActionIds.map((id) => {
            const ActionButton = inboxActionComponents[id]
            return ActionButton ? <ActionButton key={id} adminPath={adminPath} /> : null
          })}
          {canReply && (
            <a
              href={`/${adminPath}/m/contact-form/my-signature`}
              className="btn btn-secondary btn-sm"
            >
              Edit My Signature
            </a>
          )}
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
        canReply={canReply}
      />
    </div>
  )
}
