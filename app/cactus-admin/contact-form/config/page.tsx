'use client'

import { useEffect, useState } from 'react'
import type { ContactFormConfig } from '@/modules/contact-form/lib/types'

export default function ContactFormConfigPage() {
  const [config, setConfig] = useState<ContactFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/m/contact-form/admin/config')
      .then((r) => r.json())
      .then((data) => { setConfig(data); setLoading(false) })
      .catch(() => { setError('Failed to load config.'); setLoading(false) })
  }, [])

  function update<K extends keyof ContactFormConfig>(key: K, value: ContactFormConfig[K]) {
    setConfig((c) => c ? { ...c, [key]: value } : c)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/m/contact-form/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-header"><h1 className="page-title">Contact Settings</h1></div>

  if (!config) return (
    <div>
      <div className="page-header"><h1 className="page-title">Contact Settings</h1></div>
      {error && <div className="alert alert-danger">{error}</div>}
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Contact Settings</h1>
      </div>

      {saved && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>Settings saved.</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Form Fields</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.showPhone}
                onChange={(e) => update('showPhone', e.target.checked)}
              />
              Show phone field
            </label>
            {config.showPhone && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
                <input
                  type="checkbox"
                  checked={config.requirePhone}
                  onChange={(e) => update('requirePhone', e.target.checked)}
                />
                Require phone
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.showCompany}
                onChange={(e) => update('showCompany', e.target.checked)}
              />
              Show company field
            </label>
            {config.showCompany && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
                <input
                  type="checkbox"
                  checked={config.requireCompany}
                  onChange={(e) => update('requireCompany', e.target.checked)}
                />
                Require company
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.showSubject}
                onChange={(e) => update('showSubject', e.target.checked)}
              />
              Show subject field
            </label>
            {config.showSubject && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
                <input
                  type="checkbox"
                  checked={config.requireSubject}
                  onChange={(e) => update('requireSubject', e.target.checked)}
                />
                Require subject
              </label>
            )}

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Name validation
              </label>
              <select
                value={config.nameValidationMode}
                onChange={(e) => update('nameValidationMode', e.target.value as 'first_only' | 'both')}
                className="input"
                style={{ width: 'auto' }}
              >
                <option value="first_only">First name only</option>
                <option value="both">First and last name required</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Notifications</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Notification email
              </label>
              <input
                type="email"
                className="input"
                value={config.notificationEmail ?? ''}
                onChange={(e) => update('notificationEmail', e.target.value || null)}
                placeholder="Defaults to site admin email"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                CC emails (one per line)
              </label>
              <textarea
                className="input"
                rows={3}
                value={config.ccEmails.join('\n')}
                onChange={(e) => update('ccEmails', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                placeholder="cc@example.com"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Auto-reply</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={config.autoReplyEnabled}
              onChange={(e) => update('autoReplyEnabled', e.target.checked)}
            />
            Send auto-reply to submitter
          </label>
          {config.autoReplyEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Auto-reply message (markdown, use {'{{name}}'} and {'{{email}}'})
              </label>
              <textarea
                className="input"
                rows={6}
                value={config.autoReplyBody ?? ''}
                onChange={(e) => update('autoReplyBody', e.target.value || null)}
                placeholder="Hi {{name}}, thanks for getting in touch..."
              />
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Spam Protection</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.turnstileEnabled}
                onChange={(e) => update('turnstileEnabled', e.target.checked)}
              />
              Enable Cloudflare Turnstile
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>(requires TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY env vars)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.rateLimitEnabled}
                onChange={(e) => update('rateLimitEnabled', e.target.checked)}
              />
              Enable rate limiting
            </label>
            {config.rateLimitEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginLeft: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Max attempts
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input"
                    value={config.rateLimitMaxAttempts}
                    onChange={(e) => update('rateLimitMaxAttempts', parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Window (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className="input"
                    value={config.rateLimitWindowMin}
                    onChange={(e) => update('rateLimitWindowMin', parseInt(e.target.value, 10))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>GDPR</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={config.gdprConsentEnabled}
              onChange={(e) => update('gdprConsentEnabled', e.target.checked)}
            />
            Show GDPR consent checkbox
          </label>
          {config.gdprConsentEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Consent label text
              </label>
              <input
                type="text"
                className="input"
                value={config.gdprConsentLabel ?? ''}
                onChange={(e) => update('gdprConsentLabel', e.target.value || null)}
                placeholder="I agree to the processing of my personal data."
              />
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Data Retention</h2>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Delete submissions after (days, 0 = never)
            </label>
            <input
              type="number"
              min={0}
              max={3650}
              className="input"
              style={{ width: '10rem' }}
              value={config.retentionDays}
              onChange={(e) => update('retentionDays', parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Success Message</h2>
          <textarea
            className="input"
            rows={3}
            value={config.successMessage}
            onChange={(e) => update('successMessage', e.target.value)}
          />
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
