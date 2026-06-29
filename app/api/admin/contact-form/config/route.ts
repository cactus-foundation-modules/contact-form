import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getContactFormConfig, saveContactFormConfig } from '@/modules/contact-form/lib/db'

const Patch = z.object({
  showPhone:            z.boolean().optional(),
  showCompany:          z.boolean().optional(),
  showSubject:          z.boolean().optional(),
  requirePhone:         z.boolean().optional(),
  requireCompany:       z.boolean().optional(),
  requireSubject:       z.boolean().optional(),
  nameValidationMode:   z.enum(['first_only', 'both']).optional(),
  notificationEmail:    z.string().email().nullable().optional(),
  ccEmails:             z.array(z.string().email()).optional(),
  autoReplyEnabled:     z.boolean().optional(),
  autoReplyBody:        z.string().nullable().optional(),
  turnstileEnabled:     z.boolean().optional(),
  rateLimitEnabled:     z.boolean().optional(),
  rateLimitMaxAttempts: z.number().int().min(1).max(100).optional(),
  rateLimitWindowMin:   z.number().int().min(1).max(1440).optional(),
  gdprConsentEnabled:   z.boolean().optional(),
  gdprConsentLabel:     z.string().nullable().optional(),
  retentionDays:        z.number().int().min(0).max(3650).optional(),
  successMessage:       z.string().min(1).optional(),
})

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.configure')) return errorResponse('Forbidden', 403)

  const config = await getContactFormConfig()
  if (!config) return NextResponse.json(null)
  return NextResponse.json(config)
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.configure')) return errorResponse('Forbidden', 403)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await getContactFormConfig()
  if (!existing) return errorResponse('Contact form not configured', 404)

  await saveContactFormConfig({ ...existing, ...parsed.data })
  return NextResponse.json({ success: true })
}
