'use client'

import { useEffect, useState } from 'react'
import MarkdownEditor from '@/modules/contact-form/components/admin/MarkdownEditor'

export default function MySignaturePage() {
  const [signature, setSignature] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/m/contact-form/admin/signature')
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
    const res = await fetch('/api/m/contact-form/admin/signature', {
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
        <MarkdownEditor
          value={signature}
          onChange={setSignature}
          rows={8}
          placeholder={'Kind regards,\nYour Name\n\nYour Organisation'}
        />
      </div>

      <form onSubmit={save} style={{ marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Signature'}
        </button>
      </form>
    </div>
  )
}
