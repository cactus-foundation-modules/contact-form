import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { prisma } from '@/lib/db/prisma'
import { getSubmission, createReply, getUserProfile, updateSubmission } from '@/modules/contact-form/lib/db'
import { syncMessagesNotification } from '@/modules/contact-form/lib/notify'
import { sendReply } from '@/modules/contact-form/lib/email'

const Body = z.object({
  body: z.string().min(1, 'Reply body is required.').max(50000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.reply')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const submission = await getSubmission(id)
  if (!submission) return errorResponse('Submission not found', 404)

  // Fetch sender's signature
  const profile = await getUserProfile(user.id)
  const signature = profile?.signature ?? null

  // Store reply
  const replyId = await createReply({
    submissionId:      id,
    sentById:          user.id,
    body:              parsed.data.body,
    signatureSnapshot: signature,
  })

  // Mark submission as read
  await updateSubmission(id, { status: 'read' })
  // Replying clears the unread flag - keep the rolling notification honest.
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )

  // Send the reply email
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromAddress: true },
  })

  sendReply({
    submission,
    replyBody:  parsed.data.body,
    signature,
    fromEmail:  siteConfig?.emailFromAddress ?? '',
  }).catch((err) => console.error('[contact-form] Reply email failed:', err))

  return NextResponse.json({ id: replyId }, { status: 201 })
}
