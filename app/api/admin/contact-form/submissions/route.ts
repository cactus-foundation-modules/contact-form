import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSubmissions, updateSubmission, deleteSubmission } from '@/modules/contact-form/lib/db'
import { syncMessagesNotification } from '@/modules/contact-form/lib/notify'

const BulkPatch = z.object({
  ids:    z.array(z.string()).min(1),
  status: z.enum(['read', 'archived', 'unread']).optional(),
  delete: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.view')) return errorResponse('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const status  = searchParams.get('status') ?? undefined
  // Both clamped and NaN-proofed. parseInt('abc') is NaN, and (NaN - 1) *
  // perPage reached the query as OFFSET NaN - a 500 where page one is the only
  // sensible answer. perPage is capped as well, so a hand-typed perPage=999999
  // cannot ask the database for the whole inbox in one go.
  const rawPage    = parseInt(searchParams.get('page') ?? '1', 10)
  const rawPerPage = parseInt(searchParams.get('perPage') ?? '25', 10)
  const page    = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage)
  const perPage = Math.min(100, Math.max(1, Number.isNaN(rawPerPage) ? 25 : rawPerPage))

  const result = await getSubmissions({ status, page, perPage })
  return NextResponse.json(result)
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = BulkPatch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { ids, status, delete: doDelete } = parsed.data

  if (doDelete) {
    if (!await hasPermission(user, 'contact.delete')) return errorResponse('Forbidden', 403)
    await Promise.all(ids.map((id) => deleteSubmission(id)))
  } else if (status) {
    if (!await hasPermission(user, 'contact.view')) return errorResponse('Forbidden', 403)
    await Promise.all(ids.map((id) => updateSubmission(id, { status })))
  } else {
    return errorResponse('Specify status or delete:true')
  }

  // Bulk status/delete changes the unread count - keep the rolling notification honest.
  syncMessagesNotification().catch((err) =>
    console.error('[contact-form] Failed to sync messages notification:', err)
  )

  return NextResponse.json({ success: true })
}
