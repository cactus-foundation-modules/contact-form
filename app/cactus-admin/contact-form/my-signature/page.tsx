'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { Data } from '@puckeditor/core'
import MarkdownEditor from '@/modules/contact-form/components/admin/MarkdownEditor'
import type { SignatureKind } from '@/modules/contact-form/lib/types'

// Puck and its stylesheet are a large import for a screen most people open to
// type four lines of text into, so the builder only arrives if they ask for it.
const SignaturePuckEditor = dynamic(
  () => import('@/modules/contact-form/components/admin/SignaturePuckEditor'),
  { ssr: false, loading: () => <div style={{ height: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>Loading the builder…</div> },
)

type SignatureResponse = {
  kind: SignatureKind
  signature: string | null
  signatureHtml: string | null
  signaturePuck: unknown
  fullName: string | null
  jobTitle: string | null
  phoneDisplay: string | null
  phoneE164: string | null
  accountDisplayName: string | null
  accountEmail: string
  renderedHtml: string | null
}

const KIND_OPTIONS: Array<{ value: SignatureKind; label: string; hint: string }> = [
  { value: 'markdown', label: 'Rich text', hint: 'Type it. Bold, links, lists - nothing to think about.' },
  { value: 'html', label: 'HTML', hint: 'Paste the signature your organisation already uses.' },
  { value: 'puck', label: 'Page builder', hint: 'Build it out of blocks, the way you build a page.' },
]

const MERGE_TAGS: Array<{ tag: string; label: string }> = [
  { tag: '{{FULL_NAME}}', label: 'Your name' },
  { tag: '{{JOB_TITLE}}', label: 'Your job title' },
  { tag: '{{EMAIL}}', label: 'Your email address' },
  { tag: '{{PHONE_DISPLAY}}', label: 'Your phone number, as written' },
  { tag: '{{PHONE_E164}}', label: 'Your phone number, for tapping' },
]

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500,
  color: 'var(--color-text)', marginBottom: '0.375rem',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: 6,
  border: '1px solid var(--color-border)', fontSize: '0.875rem', fontFamily: 'inherit',
  background: 'var(--color-bg)', color: 'var(--color-text)',
}

export default function MySignaturePage() {
  const router = useRouter()

  const [kind, setKind] = useState<SignatureKind>('markdown')
  const [markdown, setMarkdown] = useState('')
  const [html, setHtml] = useState('')
  const [puck, setPuck] = useState<unknown>(null)
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [phoneE164, setPhoneE164] = useState('')
  const [account, setAccount] = useState<{ displayName: string | null; email: string }>({ displayName: null, email: '' })

  const [preview, setPreview] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/m/contact-form/admin/signature')
      .then((r) => r.json())
      .then((data: SignatureResponse) => {
        setKind(data.kind ?? 'markdown')
        setMarkdown(data.signature ?? '')
        setHtml(data.signatureHtml ?? '')
        setPuck(data.signaturePuck ?? null)
        setFullName(data.fullName ?? '')
        setJobTitle(data.jobTitle ?? '')
        setPhoneDisplay(data.phoneDisplay ?? '')
        setPhoneE164(data.phoneE164 ?? '')
        setAccount({ displayName: data.accountDisplayName ?? null, email: data.accountEmail ?? '' })
        setPreview(data.renderedHtml)
        setLoading(false)
      })
      .catch(() => { setError('Could not load your signature.'); setLoading(false) })
  }, [])

  const handlePuckChange = useCallback((data: Data) => setPuck(data), [])

  function payload() {
    return {
      kind,
      signature: markdown || null,
      signatureHtml: html || null,
      signaturePuck: puck ?? null,
      fullName: fullName || null,
      jobTitle: jobTitle || null,
      phoneDisplay: phoneDisplay || null,
      phoneE164: phoneE164 || null,
    }
  }

  async function save(andLeave: boolean) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/m/contact-form/admin/signature', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Could not save your signature.')
        setSaving(false)
        return
      }
      // The saved HTML comes back cleaned, so the box shows what is actually
      // stored rather than what was typed - an author who pasted something that
      // got stripped should see that straight away, not discover it in an inbox.
      const data = await res.json() as { renderedHtml: string | null }
      setPreview(data.renderedHtml)
      if (andLeave) { router.back(); return }
      // Re-read, so a sanitised paste is reflected in the editor too.
      const fresh = await fetch('/api/m/contact-form/admin/signature').then((r) => r.json()) as SignatureResponse
      setHtml(fresh.signatureHtml ?? '')
      setPreviewOpen(true)
      setSaving(false)
    } catch {
      setError('Could not save your signature.')
      setSaving(false)
    }
  }

  async function refreshPreview() {
    setPreviewBusy(true)
    // Rendered on the server on purpose: the block-built kind resolves site
    // colours and fonts there, and a preview drawn any other way is a preview
    // that can disagree with the email.
    await save(false)
    setPreviewBusy(false)
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1 className="page-title">My Signature</h1>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Signature</h1>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', maxWidth: '46rem' }}>
        Your signature goes below a dividing line at the foot of every reply you send from the inbox.
        Pick how you would like to write it - all three are kept, so switching between them loses nothing.
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>How you write it</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              style={{
                flex: '1 1 12rem', textAlign: 'left', cursor: 'pointer',
                padding: '0.75rem', borderRadius: 6,
                border: `1px solid ${kind === option.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: kind === option.value ? 'var(--color-bg-subtle)' : 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            >
              <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{option.label}</span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Your details</h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Used to fill in the merge tags below, so one signature design works for everybody who replies.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
          <div>
            <label style={labelStyle} htmlFor="sig-full-name">Name</label>
            <input
              id="sig-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={account.displayName ?? 'Your name'}
              maxLength={200}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sig-job-title">Job title</label>
            <input
              id="sig-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Sales Manager"
              maxLength={200}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sig-phone-display">Phone, as written</label>
            <input
              id="sig-phone-display"
              value={phoneDisplay}
              onChange={(e) => setPhoneDisplay(e.target.value)}
              placeholder="020 7946 0123"
              maxLength={60}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sig-phone-e164">Phone, for tapping</label>
            <input
              id="sig-phone-e164"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              placeholder="+442079460123"
              maxLength={30}
              style={inputStyle}
            />
          </div>
        </div>
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          Your email address, {account.email || 'the one on your account'}, fills in on its own.
        </p>
      </div>

      {kind === 'markdown' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            rows={8}
            placeholder={'Kind regards,\nYour Name\n\nYour Organisation'}
          />
        </div>
      )}

      {kind === 'html' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <label style={labelStyle} htmlFor="sig-html">Signature HTML</label>
          <textarea
            id="sig-html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={16}
            spellCheck={false}
            maxLength={50000}
            placeholder="<table>…</table>"
            style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem', resize: 'vertical' }}
          />
          <p style={{ margin: '0.75rem 0 0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Tables, inline styles, images and links all come through as written. Scripts and
            anything that runs on its own - <code>onerror</code> and the like - are removed when you
            save, because this markup ends up in a customer&rsquo;s inbox rather than in here.
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Merge tags:{' '}
            {MERGE_TAGS.map((t, i) => (
              <span key={t.tag}>
                {i > 0 ? ', ' : ''}<code>{t.tag}</code> ({t.label})
              </span>
            ))}
          </p>
        </div>
      )}

      {kind === 'puck' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            The same blocks the email designs use. Text blocks accept the merge tags above.
          </p>
          <SignaturePuckEditor value={puck} onChange={handlePuckChange} />
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Preview</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshPreview} disabled={previewBusy || saving}>
            {previewBusy ? 'Saving…' : 'Save and preview'}
          </button>
        </div>
        {previewOpen || preview ? (
          preview ? (
            <div
              style={{ marginTop: '1rem', padding: '1rem', borderRadius: 6, border: '1px solid var(--color-border)', background: '#ffffff', colorScheme: 'light', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          ) : (
            <p style={{ margin: '1rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Nothing to show yet - this signature is empty, so replies go out without one.
            </p>
          )
        ) : (
          <p style={{ margin: '1rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Save to see how it will look.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
          {saving ? 'Saving…' : 'Save Signature'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  )
}
