import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { isReplySuggestionError } from '@/lib/conversations/reply-suggestion-error'
import { suggestReplies } from '@/lib/conversations/reply-suggestions'
import { getSubmission } from '@/modules/contact-form/lib/db'
import { threadMessagesFor, transcriptFor } from '@/modules/contact-form/lib/thread'

// "Give me something to start from" for one enquiry.
//
// This module holds the conversation and nothing else: it reads its own rows,
// hands them over as plain words and hands back whatever comes out. WHICH
// module writes the drafts - and whether any module on this site can - is
// core's business, resolved from `core.reply-suggestions`. Nothing here names
// one, and a site with none installed gets a 409 saying so in English.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  // The grant that lets somebody answer, not the one that lets them read: a
  // draft is only useful to whoever could send it.
  if (!await hasPermission(user, 'contact.reply')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const submission = await getSubmission(id)
  if (!submission) return errorResponse('That enquiry is not here any more.', 404)

  const messages = await threadMessagesFor(submission, user)

  try {
    const { suggestions } = await suggestReplies({
      messages: transcriptFor(submission, messages),
      subject: submission.subject ?? submission.formTitle,
      authorName: user.displayName ?? null,
    })
    return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (isReplySuggestionError(cause)) return errorResponse(cause.message, cause.status)
    console.error('[contact-form] could not suggest a reply', cause)
    return errorResponse('Could not get any suggestions just now. Try again in a moment.', 502)
  }
}
