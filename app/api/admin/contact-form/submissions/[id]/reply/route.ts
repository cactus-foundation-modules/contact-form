import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { replyToSubmission } from '@/modules/contact-form/lib/reply'

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

  // Everything the reply actually involves - the signature, the send, the row,
  // the unread count - is in lib/reply.ts, so this screen and any other way of
  // answering an enquiry cannot drift apart.
  const result = await replyToSubmission({
    submissionId: id,
    body: parsed.data.body,
    userId: user.id,
    authorDisplayName: user.displayName ?? null,
    authorEmail: user.email,
  })

  if (!result.ok) {
    return errorResponse(result.reason, result.reason.includes('not here') ? 404 : 502)
  }

  return NextResponse.json({ id: result.replyId }, { status: 201 })
}
