import type { EmailTemplateDef } from '@/lib/email/registry'

// The two owner notifications this module sends, declared for core's single
// email editor (Settings > Emails). Core owns the wording, the on/off switch,
// the wrapper design and the sending.
//
// Two things here are deliberately NOT registered:
//
//   The auto-reply. Its body is already an owner-written setting on the contact
//   form's own tab, in Markdown, with its own merge tags. Registering it would
//   mean two places to edit one message.
//
//   An owner's actual reply to a message. That is not a template at all - the
//   body is the whole point of it, and an editable "template" around someone's
//   own typed reply is a good way to mangle it.
//
// `fields` is the escaped field list lib/email.ts assembles, hence rawTags.

export const contactFormEmailTemplates: EmailTemplateDef[] = [
  {
    key: 'contact-form.new-message-brief',
    label: 'New message, brief (admin alert)',
    subject: 'New contact form message from {{name}}',
    bodyHtml:
      "<p>You've received a new contact form message.</p>{{#if hasInboxUrl}}<p><a href=\"{{inboxUrl}}\">View and reply</a></p>{{/if}}{{#if noInboxUrl}}<p>Log in to your site to view and reply.</p>{{/if}}",
    mergeTags: ['name', 'inboxUrl', 'siteName'],
    transactional: false,
  },
  {
    key: 'contact-form.new-message-full',
    label: 'New message, in full (admin alert)',
    subject: 'New contact form submission{{subjectSuffix}}',
    bodyHtml: '{{fields}}',
    mergeTags: ['fields', 'subjectSuffix', 'name', 'email', 'siteName'],
    requiredTags: ['fields'],
    rawTags: ['fields'],
    transactional: false,
  },
]
