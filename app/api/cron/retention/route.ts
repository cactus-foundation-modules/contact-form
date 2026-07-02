import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { runRetentionPolicy } from '@/modules/contact-form/lib/retention'

// Vercel appends `Authorization: Bearer $CRON_SECRET` to its own cron requests
// automatically when CRON_SECRET is set - no separate secret scheme needed.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const deleted = await runRetentionPolicy()
  return NextResponse.json({ ok: true, deleted })
}
