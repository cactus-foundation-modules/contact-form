'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { markdownToHtml } from '@/lib/sanitize'

type Props = {
  submissionId: string
  submissionEmail: string
}

export default function ReplyComposer({ submissionId, submissionEmail }: Props) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [body, setBody] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/m/contact-form/admin/signature')
      .then((r) => r.json())
      .then((data: { signature: string | null }) => setSignature(data.signature))
  }, [])

  const previewContent = signature
    ? `${body}\n\n---\n\n${signature}`
    : body

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/m/contact-form/admin/submissions/${submissionId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (res.ok) {
      setBody('')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to send reply.')
    }
    setSending(false)
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Reply to {submissionEmail}
      </h2>

      {error && <div className="alert alert-danger" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${!preview ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPreview(false)}
        >
          Write
        </button>
        <button
          type="button"
          className={`btn btn-sm ${preview ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPreview(true)}
        >
          Preview
        </button>
      </div>

      <form onSubmit={send}>
        {preview ? (
          <div
            className="prose"
            style={{ minHeight: '8rem', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: '0.375rem', marginBottom: '0.75rem' }}
            dangerouslySetInnerHTML={{
              __html: previewContent ? markdownToHtml(previewContent) : '<em style="color:var(--color-text-muted)">Nothing to preview.</em>',
            }}
          />
        ) : (
          <textarea
            className="input"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your reply here... (markdown supported)"
            style={{ marginBottom: '0.75rem' }}
            required
          />
        )}

        {signature && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Your signature will be appended below a horizontal rule.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>
            {sending ? 'Sending...' : 'Send Reply'}
          </button>
          <Link href={`/${adminPath}/m/contact-form/my-signature`} style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>
            Edit signature
          </Link>
        </div>
      </form>
    </div>
  )
}
