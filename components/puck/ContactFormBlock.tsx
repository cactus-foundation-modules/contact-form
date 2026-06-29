import ContactFormClient from './ContactFormClient'
import { getContactFormConfig } from '@/modules/contact-form/lib/db'

type ContactFormBlockProps = {
  formTitle?: string
  introText?: string
  submitLabel?: string
  successMessage?: string
  padding?: string
}

// RSC version: async — fetches live config and renders the real form.
// Registered in puckRscConfig so page visitors see the actual form.
export async function ContactFormBlockRsc(props: ContactFormBlockProps) {
  const config = await getContactFormConfig()
  return <ContactFormClient config={config} {...props} />
}

// Editor preview version: synchronous, no DB calls.
// Shown inside the Puck editor drag-and-drop canvas.
export function ContactFormBlock(props: ContactFormBlockProps) {
  const { formTitle, introText, padding } = props
  const PADDING_MAP: Record<string, string> = { none: '0', sm: '0.5rem', md: '1rem', lg: '2rem', xl: '4rem' }

  return (
    <div style={{ padding: PADDING_MAP[padding ?? 'none'] ?? '0' }}>
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
    formTitle:      { type: 'text' as const,     label: 'Form title' },
    introText:      { type: 'textarea' as const, label: 'Intro text' },
    submitLabel:    { type: 'text' as const,     label: 'Submit button label' },
    successMessage: { type: 'textarea' as const, label: 'Success message override' },
    padding: {
      type: 'select' as const,
      label: 'Padding',
      options: [
        { value: 'none', label: 'None' },
        { value: 'sm', label: 'Small (0.5rem)' },
        { value: 'md', label: 'Medium (1rem)' },
        { value: 'lg', label: 'Large (2rem)' },
        { value: 'xl', label: 'Extra large (4rem)' },
      ],
    },
  },
  defaultProps: {
    formTitle: 'Get in touch',
    introText: '',
    submitLabel: 'Send Message',
    successMessage: '',
    padding: 'none',
  },
  render: ContactFormBlock,
}

export const contactFormPuckRscComponent = {
  ...contactFormPuckComponent,
  render: ContactFormBlockRsc,
}
