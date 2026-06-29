import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSubmission, updateSubmission, deleteSubmission } from '@/modules/contact-form/lib/db'

const Patch = z.object({
  status: z.enum(['unread', 'read', 'archived']).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.view')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const submission = await getSubmission(id)
  if (!submission) return errorResponse('Not found', 404)

  // Mark as read if currently unread
  if (submission.status === 'unread') {
    await updateSubmission(id, { status: 'read' })
    submission.status = 'read'
  }

  return NextResponse.json(submission)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.view')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  await updateSubmission(id, parsed.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  await deleteSubmission(id)
  return NextResponse.json({ success: true })
}
