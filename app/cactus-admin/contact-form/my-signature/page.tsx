'use client'

import { useEffect, useState } from 'react'
import { markdownToHtml } from '@/lib/sanitize'

export default function MySignaturePage() {
  const [signature, setSignature] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    fetch('/api/admin/contact-form/signature')
      .then((r) => r.json())
      .then((data: { signature: string | null }) => {
        setSignature(data.signature ?? '')
        setLoading(false)
      })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    const res = await fetch('/api/admin/contact-form/signature', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: signature || null }),
    })
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (loading) return <div className="page-header"><h1 className="page-title">My Signature</h1></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Signature</h1>
      </div>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        Your signature is appended below a horizontal rule at the bottom of every reply you send.
        Markdown is supported.
      </p>

      {saved && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>Signature saved.</div>}

      <div className="card">
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

        {preview ? (
          <div
            className="prose"
            style={{ minHeight: '8rem', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: '0.375rem' }}
            dangerouslySetInnerHTML={{ __html: signature ? markdownToHtml(signature) : '<em style="color:var(--color-text-muted)">No signature set.</em>' }}
          />
        ) : (
          <textarea
            className="input"
            rows={8}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Kind regards,&#10;Your Name&#10;&#10;Your Organisation"
          />
        )}
      </div>

      <form onSubmit={save} style={{ marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Signature'}
        </button>
      </form>
    </div>
  )
}
