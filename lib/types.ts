export type ContactFormConfig = {
  showPhone: boolean
  showCompany: boolean
  showSubject: boolean
  requirePhone: boolean
  requireCompany: boolean
  requireSubject: boolean
  nameValidationMode: 'first_only' | 'both'
  notificationEmail: string | null
  emailNotifyMode: 'full' | 'notify' | 'off'
  ccEmails: string[]
  autoReplyEnabled: boolean
  autoReplyBody: string | null
  turnstileEnabled: boolean
  rateLimitEnabled: boolean
  rateLimitMaxAttempts: number
  rateLimitWindowMin: number
  gdprConsentEnabled: boolean
  gdprConsentLabel: string | null
  retentionDays: number
  successMessage: string
}

export type ContactSubmission = {
  id: string
  createdAt: Date
  updatedAt: Date
  name: string
  email: string
  phone: string | null
  company: string | null
  subject: string | null
  message: string
  ipAddress: string | null
  userAgent: string | null
  gdprConsent: boolean
  status: 'unread' | 'read' | 'archived'
  sourceType: 'page' | 'layout' | null
  sourceId: string | null
  sourceBlockId: string | null
  sourceLabel: string | null
}

export type ContactSubmissionReply = {
  id: string
  createdAt: Date
  submissionId: string
  sentById: string
  sentByDisplayName: string | null
  sentByEmail: string
  body: string
  signatureSnapshot: string | null
}

export type ContactUserProfile = {
  id: string
  userId: string
  signature: string | null
  createdAt: Date
  updatedAt: Date
}

export type SubmissionWithReplies = ContactSubmission & {
  replies: ContactSubmissionReply[]
}

// Contract for the "contact-form.thread-messages" extension point: modules
// contribute additional thread entries (e.g. mailbox-caught replies) that
// core merges chronologically with its own replies into one timeline.
export type ThreadMessageContribution = {
  id: string
  createdAt: Date
  senderLabel: string
  body: string
  badge?: string
}

export type PaginatedSubmissions = {
  submissions: ContactSubmission[]
  total: number
}
