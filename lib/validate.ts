import type { ContactFormConfig } from './types'

// Reject quotes and angle brackets in addition to whitespace and '@'. None are
// valid in an ordinary (unquoted) address, and allowing '"' let a submitted
// address break out of the mailto: href attribute in the owner notification.
const EMAIL_RE = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/

export type ValidationErrors = Record<string, string>

export function validateSubmission(
  data: {
    name?: string | null
    email?: string | null
    phone?: string | null
    company?: string | null
    subject?: string | null
    message?: string | null
    gdprConsent?: boolean
  },
  config: Pick<
    ContactFormConfig,
    | 'nameValidationMode'
    | 'showPhone' | 'requirePhone'
    | 'showCompany' | 'requireCompany'
    | 'showSubject' | 'requireSubject'
    | 'gdprConsentEnabled'
  >
): ValidationErrors {
  const errors: ValidationErrors = {}

  const name = (data.name ?? '').trim()
  if (!name) {
    errors.name = 'Please enter your name.'
  } else if (config.nameValidationMode === 'both') {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      errors.name = 'Please enter your first and last name.'
    }
  }

  const email = (data.email ?? '').trim()
  if (!email) {
    errors.email = 'Please enter your email address.'
  } else if (!EMAIL_RE.test(email)) {
    errors.email = 'Please enter a valid email address.'
  }

  if (config.showPhone && config.requirePhone) {
    const phone = (data.phone ?? '').trim()
    if (!phone) errors.phone = 'Please enter a phone number.'
  }

  if (config.showCompany && config.requireCompany) {
    const company = (data.company ?? '').trim()
    if (!company) errors.company = 'Please enter your company name.'
  }

  if (config.showSubject && config.requireSubject) {
    const subject = (data.subject ?? '').trim()
    if (!subject) errors.subject = 'Please enter a subject.'
  }

  const message = (data.message ?? '').trim()
  if (!message) {
    errors.message = 'Please enter a message.'
  } else if (message.length < 10) {
    errors.message = 'Please enter a message (minimum 10 characters).'
  }

  if (config.gdprConsentEnabled && !data.gdprConsent) {
    errors.gdprConsent = 'Please confirm your consent to continue.'
  }

  return errors
}

export function sanitiseField(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim()
}
