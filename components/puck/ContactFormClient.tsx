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

export default function ContactFormClient({ config, blockId, formTitle, introText, submitLabel, padding }: Props) {
  const [fields, setFields] = useState({
    name: '', email: '', phone: '', company: '', subject: '', message: '', gdprConsent: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const style = { padding: PADDING_MAP[padding ?? 'none'] ?? '0' }

  if (submitted) {
    const msg = config.successMessage || 'Thank you for getting in touch!'
    return (
      <div style={style}>
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
    <div style={style}>
      {formTitle && <h2 style={{ marginBottom: introText ? '0.5rem' : '1.25rem' }}>{formTitle}</h2>}
      {introText && <p style={{ marginBottom: '1.25rem', color: 'var(--color-text-muted)' }}>{introText}</p>}

      {errors._form && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: '1rem' }}>{errors._form}</div>
      )}

      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
            Name <span aria-hidden>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="name"
            required
          />
          {errors.name && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.name}</p>}
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
            Email <span aria-hidden>*</span>
          </label>
          <input
            type="email"
            className="input"
            value={fields.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            required
          />
          {errors.email && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.email}</p>}
        </div>

        {config.showPhone && (
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
              Phone {config.requirePhone && <span aria-hidden>*</span>}
            </label>
            <input
              type="tel"
              className="input"
              value={fields.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
              required={config.requirePhone}
            />
            {errors.phone && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.phone}</p>}
          </div>
        )}

        {config.showCompany && (
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
              Company {config.requireCompany && <span aria-hidden>*</span>}
            </label>
            <input
              type="text"
              className="input"
              value={fields.company}
              onChange={(e) => set('company', e.target.value)}
              autoComplete="organization"
              required={config.requireCompany}
            />
            {errors.company && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.company}</p>}
          </div>
        )}

        {config.showSubject && (
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
              Subject {config.requireSubject && <span aria-hidden>*</span>}
            </label>
            <input
              type="text"
              className="input"
              value={fields.subject}
              onChange={(e) => set('subject', e.target.value)}
              required={config.requireSubject}
            />
            {errors.subject && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.subject}</p>}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>
            Message <span aria-hidden>*</span>
          </label>
          <textarea
            className="input"
            rows={5}
            value={fields.message}
            onChange={(e) => set('message', e.target.value)}
            required
          />
          {errors.message && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.message}</p>}
        </div>

        {config.gdprConsentEnabled && (
          <div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={fields.gdprConsent}
                onChange={(e) => set('gdprConsent', e.target.checked)}
                required
                style={{ marginTop: '0.2rem', flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.9375rem' }}>
                {config.gdprConsentLabel ?? 'I agree to the processing of my personal data.'}
              </span>
            </label>
            {errors.gdprConsent && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.gdprConsent}</p>}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Sending...' : (submitLabel || 'Send Message')}
          </button>
        </div>
      </form>
    </div>
  )
}
