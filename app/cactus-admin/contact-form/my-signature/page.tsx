'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MarkdownEditor from '@/modules/contact-form/components/admin/MarkdownEditor'

export default function MySignaturePage() {
  const router = useRouter()
  const [signature, setSignature] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
    const res = await fetch('/api/m/contact-form/admin/signature', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: signature || null }),
    })
    if (res.ok) {
      router.back()
      return
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
