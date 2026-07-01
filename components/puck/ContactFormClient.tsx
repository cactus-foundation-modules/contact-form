'use client'

import { useState } from 'react'
import type { ContactFormConfig } from '@/modules/contact-form/lib/types'

type Props = {
  config: ContactFormConfig
  blockId: string
  formTitle?: string
  introText?: string
  submitLabel?: string
  padding?: string
}

const PADDING_MAP: Record<string, string> = {
  none: '0', sm: '0.5rem', md: '1rem', lg: '2rem', xl: '4rem',
}
// Horizontal-only gutter matching the core builder blocks. 'default' (and unset)
// pulls the site-wide gutter set in Styles → Spacing (--block-padding).
export function getFormPadding(p?: string): string {
  if (!p || p === 'default') return '0 var(--block-padding, 1.5rem)'
  const v = PADDING_MAP[p]
  return v && v !== '0' ? `0 ${v}` : '0'
}

// Public-facing field styling driven by the site's Styles → Form Fields tokens
// (via the --field-* / --field-label-* variables buildTokenStyles emits), with
// neutral fallbacks. Deliberately NOT the admin `.field` classes, which would
// out-specificity the site theme and lock the form to the admin look.
const FORM_CSS = `
.cactus-contact-form .cf-field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
.cactus-contact-form label {
  font-family: var(--field-label-family, inherit);
  font-weight: var(--field-label-weight, 500);
  font-size: var(--field-label-size, 0.875rem);
  line-height: var(--field-label-line-height, normal);
  letter-spacing: var(--field-label-letter-spacing, normal);
  text-transform: var(--field-label-transform, none);
  font-style: var(--field-label-style, normal);
  color: var(--field-label-color, inherit);
}
.cactus-contact-form input,
.cactus-contact-form textarea,
.cactus-contact-form select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  font-family: var(--field-family, inherit);
  font-weight: var(--field-weight, normal);
  font-size: var(--field-size, 1rem);
  line-height: var(--field-line-height, 1.4);
  letter-spacing: var(--field-letter-spacing, normal);
  text-transform: var(--field-transform, none);
  font-style: var(--field-style, normal);
  color: var(--field-text, inherit);
  background: var(--field-bg, var(--color-surface, #fff));
  border: 1px solid var(--field-border, var(--color-border, #d1d5db));
  border-radius: var(--field-radius, 6px);
}
.cactus-contact-form textarea { resize: vertical; min-height: 6rem; }
.cactus-contact-form input:focus,
.cactus-contact-form textarea:focus,
.cactus-contact-form select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.cactus-contact-form input[type="checkbox"] { width: auto; padding: 0; border: 0; background: none; accent-color: var(--color-primary); }
.cactus-contact-form .cf-error { margin: 0; font-size: 0.8125rem; color: var(--color-danger, #dc2626); }
`

export default function ContactFormClient({ config, blockId, formTitle, introText, submitLabel, padding }: Props) {
  const [fields, setFields] = useState({
    name: '', email: '', phone: '', company: '', subject: '', message: '', gdprConsent: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const style = { padding: getFormPadding(padding) }

  if (submitted) {
    const msg = config.successMessage || 'Thank you for getting in touch!'
    return (
      <div className="cactus-contact-form" style={style}>
        <div role="alert" className="alert alert-success">{msg}</div>
      </div>
    )
  }

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const n = { ...e }; delete n[key]; return n })
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!config) return
    setSubmitting(true)
    setErrors({})

    const fd = new FormData()
    fd.append('path',    window.location.pathname)
    fd.append('blockId', blockId)
    fd.append('name',    fields.name)
    fd.append('email',   fields.email)
    if (config.showPhone)   fd.append('phone',   fields.phone)
    if (config.showCompany) fd.append('company', fields.company)
    if (config.showSubject) fd.append('subject', fields.subject)
    fd.append('message', fields.message)
    if (config.gdprConsentEnabled) fd.append('gdprConsent', fields.gdprConsent ? 'true' : 'false')

    const res = await fetch('/api/m/contact-form/contact/submit', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({})) as { success?: boolean; errors?: Record<string, string> }

    if (res.ok && data.success) {
      setSubmitted(true)
    } else {
      setErrors(data.errors ?? { _form: 'Something went wrong. Please try again.' })
    }
    setSubmitting(false)
  }

  return (
    <div className="cactus-contact-form" style={style}>
      <style dangerouslySetInnerHTML={{ __html: FORM_CSS }} />
      {formTitle && <h2 style={{ marginBottom: introText ? '0.5rem' : '1.25rem' }}>{formTitle}</h2>}
      {introText && <p style={{ marginBottom: '1.25rem', color: 'var(--color-text-muted)' }}>{introText}</p>}

      {errors._form && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: '1rem' }}>{errors._form}</div>
      )}

      <form onSubmit={submit} noValidate>
        <div className="cf-field">
          <label>Name <span aria-hidden>*</span></label>
          <input
            type="text"
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="name"
            required
          />
          {errors.name && <p role="alert" className="cf-error">{errors.name}</p>}
        </div>

        <div className="cf-field">
          <label>Email <span aria-hidden>*</span></label>
          <input
            type="email"
            value={fields.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            required
          />
          {errors.email && <p role="alert" className="cf-error">{errors.email}</p>}
        </div>

        {config.showPhone && (
          <div className="cf-field">
            <label>Phone {config.requirePhone && <span aria-hidden>*</span>}</label>
            <input
              type="tel"
              value={fields.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
              required={config.requirePhone}
            />
            {errors.phone && <p role="alert" className="cf-error">{errors.phone}</p>}
          </div>
        )}

        {config.showCompany && (
          <div className="cf-field">
            <label>Company {config.requireCompany && <span aria-hidden>*</span>}</label>
            <input
              type="text"
              value={fields.company}
              onChange={(e) => set('company', e.target.value)}
              autoComplete="organization"
              required={config.requireCompany}
            />
            {errors.company && <p role="alert" className="cf-error">{errors.company}</p>}
          </div>
        )}

        {config.showSubject && (
          <div className="cf-field">
            <label>Subject {config.requireSubject && <span aria-hidden>*</span>}</label>
            <input
              type="text"
              value={fields.subject}
              onChange={(e) => set('subject', e.target.value)}
              required={config.requireSubject}
            />
            {errors.subject && <p role="alert" className="cf-error">{errors.subject}</p>}
          </div>
        )}

        <div className="cf-field">
          <label>Message <span aria-hidden>*</span></label>
          <textarea
            rows={5}
            value={fields.message}
            onChange={(e) => set('message', e.target.value)}
            required
          />
          {errors.message && <p role="alert" className="cf-error">{errors.message}</p>}
        </div>

        {config.gdprConsentEnabled && (
          <div className="cf-field">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fields.gdprConsent}
                onChange={(e) => set('gdprConsent', e.target.checked)}
                required
              />
              <span>
                {config.gdprConsentLabel ?? 'I agree to the processing of my personal data.'}
              </span>
            </label>
            {errors.gdprConsent && <p role="alert" className="cf-error">{errors.gdprConsent}</p>}
          </div>
        )}

        <div>
          {/* Themed like the site's Button blocks so it reflects Styles → Buttons
              (falls back to the primary colour) rather than the admin green button. */}
          <button
            type="submit"
            className="cactus-btn"
            disabled={submitting}
            style={{
              display: 'inline-block',
              fontFamily: 'var(--btn-family)',
              fontWeight: 'var(--btn-weight, 600)',
              fontSize: 'var(--btn-size, 0.9375rem)',
              lineHeight: 'var(--btn-line-height, normal)',
              letterSpacing: 'var(--btn-letter-spacing, normal)',
              textTransform: 'var(--btn-transform, none)' as React.CSSProperties['textTransform'],
              fontStyle: 'var(--btn-style, normal)',
              borderRadius: 'var(--btn-radius, 6px)',
              padding: 'var(--btn-padding, 0.625rem 1.5rem)',
              background: 'var(--btn-bg, var(--color-primary))',
              color: 'var(--btn-text-color, var(--color-bg))',
              border: 'var(--btn-border-width, 0) solid var(--btn-border, transparent)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Sending...' : (submitLabel || 'Send Message')}
          </button>
        </div>
      </form>
    </div>
  )
}
