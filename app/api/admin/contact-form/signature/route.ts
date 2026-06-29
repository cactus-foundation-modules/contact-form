import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { getUserProfile, upsertUserProfile } from '@/modules/contact-form/lib/db'

const Body = z.object({
  signature: z.string().max(5000).nullable(),
})

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const profile = await getUserProfile(user.id)
  return NextResponse.json({ signature: profile?.signature ?? null })
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  await upsertUserProfile(user.id, parsed.data.signature)
  return NextResponse.json({ success: true })
}
