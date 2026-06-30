'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import type { ContactSubmission } from '@/modules/contact-form/lib/types'

type Props = {
  submissions: ContactSubmission[]
  total: number
  page: number
  totalPages: number
  status: string
  canDelete: boolean
}

const TABS = [
  { label: 'All',      value: 'all'      },
  { label: 'Unread',   value: 'unread'   },
  { label: 'Read',     value: 'read'     },
  { label: 'Archived', value: 'archived' },
]

function relativeDate(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(date).toLocaleDateString('en-GB')
}

export default function SubmissionList({ submissions, total, page, totalPages, status, canDelete }: Props) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const base = `/${adminPath}`
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  function toggleAll() {
    if (selected.size === submissions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(submissions.map((s) => s.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkAction(action: 'read' | 'archived' | 'unread' | 'delete') {
    if (!selected.size) return
    if (action === 'delete' && !confirm(`Delete ${selected.size} submission(s)?`)) return
    setBusy(true)
    const body = action === 'delete'
      ? { ids: [...selected], delete: true }
      : { ids: [...selected], status: action }
    await fetch('/api/m/contact-form/admin/submissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSelected(new Set())
    setBusy(false)
    router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`${base}/m/contact-form/inbox?status=${tab.value}`}
            className={`btn btn-sm ${status === tab.value ? 'btn-primary' : 'btn-secondary'}`}
          >
            {tab.label}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: '2rem' }}>
          {total} total
        </span>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--color-surface-alt)', borderRadius: '0.375rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{selected.size} selected</span>
          <button className="btn btn-secondary btn-sm" onClick={() => bulkAction('read')} disabled={busy}>Mark read</button>
          <button className="btn btn-secondary btn-sm" onClick={() => bulkAction('unread')} disabled={busy}>Mark unread</button>
          <button className="btn btn-secondary btn-sm" onClick={() => bulkAction('archived')} disabled={busy}>Archive</button>
          {canDelete && (
            <button className="btn btn-danger btn-sm" onClick={() => bulkAction('delete')} disabled={busy}>Delete</button>
          )}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
          No submissions found.
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '2rem' }}>
                  <input
                    type="checkbox"
                    checked={selected.size === submissions.length && submissions.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th>From</th>
                <th>Subject / Message</th>
                <th>Page</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr
                  key={s.id}
                  style={{ fontWeight: s.status === 'unread' ? 600 : 400 }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                    />
                  </td>
                  <td>
                    <Link href={`${base}/m/contact-form/inbox/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div>{s.name}</div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>{s.email}</div>
                    </Link>
                  </td>
                  <td>
                    <Link href={`${base}/m/contact-form/inbox/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div>{s.subject ?? s.message.slice(0, 60)}{!s.subject && s.message.length > 60 ? '…' : ''}</div>
                    </Link>
                  </td>
                  <td style={{ fontSize: '0.8125rem' }}>
                    {s.sourceLabel ?? <span style={{ color: 'var(--color-text-muted)' }}>Unknown</span>}
                  </td>
                  <td>
                    <span className={`badge ${s.status === 'unread' ? 'badge-info' : s.status === 'archived' ? 'badge-muted' : ''}`}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {relativeDate(s.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          {page > 1 && (
            <Link href={`${base}/m/contact-form/inbox?status=${status}&page=${page - 1}`} className="btn btn-secondary btn-sm">
              Previous
            </Link>
          )}
          <span style={{ lineHeight: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`${base}/m/contact-form/inbox?status=${status}&page=${page + 1}`} className="btn btn-secondary btn-sm">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
