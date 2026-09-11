'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { ReplySuggestions } from '@/components/admin/ReplySuggestions'
import MarkdownEditor from '@/modules/contact-form/components/admin/MarkdownEditor'

type Props = {
  submissionId: string
  submissionEmail: string
  /** Whether anything on this site can draft a reply. Decided on the server -
   *  see lib/conversations/reply-suggestions.ts - so a site with no such module
   *  never draws the button rather than drawing one that answers 409. */
  canSuggest?: boolean
  /** Whether the last word on this enquiry was ours, so the button says what it
   *  is actually going to do: a thread ending with our own reply wants chasing,
   *  and offering "Suggest reply" on one reads as an offer to reply to
   *  yourself. */
  chasing?: boolean
}

export default function ReplyComposer({ submissionId, submissionEmail, canSuggest = false, chasing = false }: Props) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [body, setBody] = useState('')
  // The signature as it will actually be sent, rendered server-side. Held as
  // HTML rather than as its source because it may not have a markdown source at
  // all any more - it could be pasted markup or a stack of email blocks.
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What was in the box before a suggestion was tried in it. Stashed on the
  // FIRST preview and not on any after it, so flicking between three drafts
  // still puts back what somebody actually wrote rather than the draft they
  // looked at before this one.
  const beforePreview = useRef<string | null>(null)

  const previewSuggestion = useCallback((text: string | null) => {
    if (text === null) {
      if (beforePreview.current !== null) setBody(beforePreview.current)
      beforePreview.current = null
      return
    }
    if (beforePreview.current === null) beforePreview.current = body
    setBody(text)
  }, [body])

  const acceptSuggestion = useCallback((text: string) => {
    beforePreview.current = null
    setBody(text)
  }, [])

  useEffect(() => {
    fetch('/api/m/contact-form/admin/signature')
      .then((r) => r.json())
      .then((data: { renderedHtml: string | null }) => setSignatureHtml(data.renderedHtml))
      .catch(() => {})
  }, [])

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
    <div className="card" id="reply-composer">
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
          />
        </div>

        {canSuggest && (
          <div style={{ marginBottom: '0.75rem' }}>
            <ReplySuggestions
              endpoint={`/api/m/contact-form/admin/submissions/${submissionId}/suggest-reply`}
              disabled={sending}
              onPreview={previewSuggestion}
              onAccept={acceptSuggestion}
              label={chasing ? 'Suggest a follow-up' : 'Suggest reply'}
            />
          </div>
        )}

        {signatureHtml && (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem' }}>
              Your signature goes below a dividing line at the foot of this reply:
            </p>
            {/* Deliberately on white with the light scheme pinned: this is
                standing in for an inbox, and an email signature carries its own
                fixed colours rather than the admin's tokens. */}
            <div
              style={{ padding: '0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', background: '#ffffff', colorScheme: 'light', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: signatureHtml }}
            />
          </div>
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
