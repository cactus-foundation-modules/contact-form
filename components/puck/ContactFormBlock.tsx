import ContactFormClient, { getFormPadding } from './ContactFormClient'
import type { ContactFormConfig, ContactFormPublicConfig } from '@/modules/contact-form/lib/types'

// Cached fetch so resolveFields doesn't refetch on every panel keystroke
let _authConfigCache: { data: { emailConfigured: boolean; turnstileConfigured: boolean }; expires: number } | null = null
async function fetchAuthConfig(): Promise<{ emailConfigured: boolean; turnstileConfigured: boolean }> {
  const now = Date.now()
  if (_authConfigCache && now < _authConfigCache.expires) return _authConfigCache.data
  const res = await fetch('/api/auth/config')
  const data = await res.json() as { emailConfigured: boolean; turnstileConfigured: boolean }
  _authConfigCache = { data, expires: now + 60_000 }
  return data
}

function EmailNotConfiguredNotice() {
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 6 }}>
      <strong style={{ fontSize: '0.8125rem', color: 'var(--color-warning)', display: 'block', marginBottom: '0.25rem' }}>Email not configured</strong>
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-warning)' }}>
        Email delivery (Brevo or SMTP) is not set up - configure it in Settings &rarr; Integrations before using this form.
      </span>
    </div>
  )
}

function TurnstileUnavailableField() {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        Cloudflare Turnstile
      </label>
      <select
        disabled
        defaultValue="no"
        style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}
      >
        <option value="no">Disabled</option>
      </select>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>
        Turnstile is not configured - add your site key in Settings &rarr; Integrations.
      </p>
    </div>
  )
}

export type ContactFormBlockProps = {
  // Layout
  formTitle?: string
  introText?: string
  submitLabel?: string
  padding?: string
  // Field visibility
  showPhone?: string
  showCompany?: string
  showSubject?: string
  requirePhone?: string
  requireCompany?: string
  requireSubject?: string
  nameValidationMode?: string
  // Notifications
  notificationEmail?: string
  emailNotifyMode?: string
  ccEmails?: string
  autoReplyEnabled?: string
  autoReplyBody?: string
  // Spam protection
  turnstileEnabled?: string
  rateLimitEnabled?: string
  rateLimitMaxAttempts?: number
  rateLimitWindowMin?: number
  // GDPR
  gdprConsentEnabled?: string
  gdprConsentLabel?: string
  // Retention
  retentionDays?: number
  // Success
  successMessage?: string
}

export function blockPropsToConfig(props: ContactFormBlockProps): ContactFormConfig {
  return {
    showPhone:            props.showPhone !== 'no',
    showCompany:          props.showCompany === 'yes',
    showSubject:          props.showSubject !== 'no',
    requirePhone:         props.requirePhone === 'yes',
    requireCompany:       props.requireCompany === 'yes',
    requireSubject:       props.requireSubject === 'yes',
    nameValidationMode:   (props.nameValidationMode ?? 'first_only') as 'first_only' | 'both',
    notificationEmail:    props.notificationEmail?.trim() || null,
    emailNotifyMode:      (props.emailNotifyMode ?? 'full') as 'full' | 'notify' | 'off',
    ccEmails:             props.ccEmails
                            ? props.ccEmails.split('\n').map(s => s.trim()).filter(Boolean)
                            : [],
    autoReplyEnabled:     props.autoReplyEnabled === 'yes',
    autoReplyBody:        props.autoReplyBody?.trim() || null,
    turnstileEnabled:     props.turnstileEnabled !== 'no',
    rateLimitEnabled:     props.rateLimitEnabled !== 'no',
    rateLimitMaxAttempts: props.rateLimitMaxAttempts ?? 3,
    rateLimitWindowMin:   props.rateLimitWindowMin ?? 10,
    gdprConsentEnabled:   props.gdprConsentEnabled === 'yes',
    gdprConsentLabel:     props.gdprConsentLabel?.trim() || null,
    retentionDays:        props.retentionDays ?? 0,
    successMessage:       props.successMessage?.trim() || 'Thank you for your message. We\'ll be in touch soon.',
  }
}

// RSC version: async server component — derives config from block props and renders the real form.
// Registered in puckRscConfig so page visitors see the actual form.
//
// Only the display subset of the config crosses to the client component: props
// handed to a 'use client' component land verbatim in the served page payload,
// which put notificationEmail (the owner's address, the very thing the email
// anti-spam scheme hides) into view-source. The submit route rebuilds the full
// config server-side from the stored block props, so the client needs nothing more.
export async function ContactFormBlockRsc(props: ContactFormBlockProps & { id?: string }) {
  const full = blockPropsToConfig(props)
  const config: ContactFormPublicConfig = {
    showPhone:          full.showPhone,
    showCompany:        full.showCompany,
    showSubject:        full.showSubject,
    requirePhone:       full.requirePhone,
    requireCompany:     full.requireCompany,
    requireSubject:     full.requireSubject,
    gdprConsentEnabled: full.gdprConsentEnabled,
    gdprConsentLabel:   full.gdprConsentLabel,
    successMessage:     full.successMessage,
  }
  const blockId = props.id ?? ''
  return (
    <ContactFormClient
      config={config}
      blockId={blockId}
      formTitle={props.formTitle}
      introText={props.introText}
      submitLabel={props.submitLabel}
      padding={props.padding}
    />
  )
}

// Editor preview version: synchronous, no async work.
// Shown inside the Puck editor drag-and-drop canvas.
export function ContactFormBlock(props: ContactFormBlockProps) {
  const { formTitle, introText, padding } = props
  return (
    <div style={{ padding: getFormPadding(padding) }}>
      {formTitle && <h2 style={{ marginBottom: introText ? '0.5rem' : '1rem' }}>{formTitle}</h2>}
      {introText && <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>{introText}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: 0.6, pointerEvents: 'none' }}>
        <div style={{ height: '2.25rem', background: 'var(--color-border)', borderRadius: '0.375rem' }} />
        <div style={{ height: '2.25rem', background: 'var(--color-border)', borderRadius: '0.375rem' }} />
        <div style={{ height: '6rem', background: 'var(--color-border)', borderRadius: '0.375rem' }} />
        <div style={{ height: '2.25rem', width: '8rem', background: 'var(--color-accent)', borderRadius: '0.375rem' }} />
      </div>
    </div>
  )
}

export const contactFormPuckComponent = {
  label: 'Contact Form',
  fields: {
    // Layout
    formTitle:      { type: 'text' as const,     label: 'Form title' },
    introText:      { type: 'textarea' as const, label: 'Intro text' },
    submitLabel:    { type: 'text' as const,     label: 'Submit button label' },
    padding: {
      type: 'select' as const,
      label: 'Padding (left/right)',
      options: [
        { value: 'default', label: 'Default (site spacing)' },
        { value: 'none', label: 'None' },
        { value: 'sm',   label: 'Small (0.5rem)' },
        { value: 'md',   label: 'Medium (1rem)' },
        { value: 'lg',   label: 'Large (2rem)' },
        { value: 'xl',   label: 'Extra large (4rem)' },
      ],
    },
    // Field visibility
    showPhone: {
      type: 'select' as const, label: 'Show phone field',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
    requirePhone: {
      type: 'select' as const, label: 'Require phone',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    showCompany: {
      type: 'select' as const, label: 'Show company field',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    requireCompany: {
      type: 'select' as const, label: 'Require company',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    showSubject: {
      type: 'select' as const, label: 'Show subject field',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
    requireSubject: {
      type: 'select' as const, label: 'Require subject',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    nameValidationMode: {
      type: 'select' as const, label: 'Name validation',
      options: [
        { value: 'first_only', label: 'First name only' },
        { value: 'both',       label: 'First + last name required' },
      ],
    },
    // Notifications
    notificationEmail:  { type: 'text' as const,     label: 'Notification email (leave blank for site default)' },
    emailNotifyMode: {
      type: 'select' as const,
      label: 'When a message comes in',
      options: [
        { value: 'full',   label: 'Email me the full message' },
        { value: 'notify', label: 'Just let me know there\'s a new message' },
        { value: 'off',    label: 'Don\'t email me at all' },
      ],
    },
    ccEmails:           { type: 'textarea' as const, label: 'CC emails (one per line)' },
    autoReplyEnabled: {
      type: 'select' as const, label: 'Auto-reply to sender',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    autoReplyBody: { type: 'textarea' as const, label: 'Auto-reply body (Markdown)' },
    // Spam protection
    turnstileEnabled: {
      type: 'select' as const, label: 'Cloudflare Turnstile',
      options: [{ value: 'yes', label: 'Enabled' }, { value: 'no', label: 'Disabled' }],
    },
    rateLimitEnabled: {
      type: 'select' as const, label: 'Rate limiting',
      options: [{ value: 'yes', label: 'Enabled' }, { value: 'no', label: 'Disabled' }],
    },
    rateLimitMaxAttempts: { type: 'number' as const, label: 'Max attempts per window' },
    rateLimitWindowMin:   { type: 'number' as const, label: 'Rate limit window (minutes)' },
    // GDPR
    gdprConsentEnabled: {
      type: 'select' as const, label: 'GDPR consent checkbox',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
    },
    gdprConsentLabel: { type: 'text' as const, label: 'GDPR consent label' },
    // Retention
    retentionDays: { type: 'number' as const, label: 'Retention (days, 0 = never delete)' },
    // Success
    successMessage: { type: 'textarea' as const, label: 'Success message' },
  },
  defaultProps: {
    formTitle:            'Get in touch',
    introText:            '',
    submitLabel:          'Send Message',
    padding:              'default',
    showPhone:            'yes',
    requirePhone:         'no',
    showCompany:          'no',
    requireCompany:       'no',
    showSubject:          'yes',
    requireSubject:       'no',
    nameValidationMode:   'first_only',
    notificationEmail:    '',
    emailNotifyMode:      'full',
    ccEmails:             '',
    autoReplyEnabled:     'no',
    autoReplyBody:        '',
    turnstileEnabled:     'yes',
    rateLimitEnabled:     'yes',
    rateLimitMaxAttempts: 3,
    rateLimitWindowMin:   10,
    gdprConsentEnabled:   'no',
    gdprConsentLabel:     '',
    retentionDays:        0,
    successMessage:       '',
  },
  async resolveFields(_data: ContactFormBlockProps, { fields }: { fields: any }) {
    const config = await fetchAuthConfig()
    if (!config.emailConfigured) {
      return { _setupNotice: { type: 'custom' as const, render: EmailNotConfiguredNotice }, ...fields }
    }
    if (!config.turnstileConfigured) {
      return { ...fields, turnstileEnabled: { type: 'custom' as const, render: TurnstileUnavailableField } }
    }
    return fields
  },
  render: ContactFormBlock,
}

export const contactFormPuckRscComponent = {
  ...contactFormPuckComponent,
  render: ContactFormBlockRsc,
}
