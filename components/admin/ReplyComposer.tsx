'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import MarkdownEditor from '@/modules/contact-form/components/admin/MarkdownEditor'

type Props = {
  submissionId: string
  submissionEmail: string
}

export default function ReplyComposer({ submissionId, submissionEmail }: Props) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [body, setBody] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
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

      <form onSubmit={send}>
        <div style={{ marginBottom: '0.75rem' }}>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            rows={6}
            placeholder="Write your reply here... (markdown supported)"
            previewContent={previewContent}
          />
        </div>

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
