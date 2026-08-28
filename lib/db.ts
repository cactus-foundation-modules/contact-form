import { prisma } from '@/lib/db/prisma'
import type {
  ContactSubmission,
  ContactSubmissionReply,
  ContactUserProfile,
  SignatureKind,
  SubmissionWithReplies,
  PaginatedSubmissions,
} from './types'
import { isSignatureKind } from './types'

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

type CreateSubmissionData = {
  name: string
  email: string
  phone?: string | null
  company?: string | null
  subject?: string | null
  message: string
  ipAddress?: string | null
  userAgent?: string | null
  gdprConsent: boolean
  sourceType?: 'page' | 'layout' | null
  sourceId?: string | null
  sourceBlockId?: string | null
  sourceLabel?: string | null
}

export async function createSubmission(data: CreateSubmissionData): Promise<string> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "cf_contact_submissions"
      ("id", "name", "email", "phone", "company", "subject", "message",
       "ip_address", "user_agent", "gdpr_consent", "status",
       "source_type", "source_id", "source_block_id", "source_label")
    VALUES
      (gen_random_uuid()::text, ${data.name}, ${data.email}, ${data.phone ?? null},
       ${data.company ?? null}, ${data.subject ?? null}, ${data.message},
       ${data.ipAddress ?? null}, ${data.userAgent ?? null}, ${data.gdprConsent}::boolean, 'unread',
       ${data.sourceType ?? null}, ${data.sourceId ?? null},
       ${data.sourceBlockId ?? null}, ${data.sourceLabel ?? null})
    RETURNING "id"
  `
  return rows[0].id
}

function mapRow(r: Record<string, unknown>): ContactSubmission {
  return {
    id: r.id as string,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
    name: r.name as string,
    email: r.email as string,
    phone: (r.phone as string | null) ?? null,
    company: (r.company as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    message: r.message as string,
    ipAddress: (r.ip_address as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    gdprConsent: r.gdpr_consent as boolean,
    status: r.status as ContactSubmission['status'],
    sourceType: (r.source_type as 'page' | 'layout' | null) ?? null,
    sourceId: (r.source_id as string | null) ?? null,
    sourceBlockId: (r.source_block_id as string | null) ?? null,
    sourceLabel: (r.source_label as string | null) ?? null,
  }
}

export async function getSubmissions(opts: {
  status?: string
  page?: number
  perPage?: number
}): Promise<PaginatedSubmissions> {
  const page = opts.page ?? 1
  const perPage = opts.perPage ?? 25
  const offset = (page - 1) * perPage
  const statusFilter = opts.status && opts.status !== 'all' ? opts.status : null

  const [rows, countRows] = await Promise.all([
    statusFilter
      ? prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM "cf_contact_submissions"
          WHERE "status" = ${statusFilter}
          ORDER BY "created_at" DESC
          LIMIT ${perPage} OFFSET ${offset}
        `
      : prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM "cf_contact_submissions"
          WHERE "status" != 'archived'
          ORDER BY "created_at" DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
    statusFilter
      ? prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) FROM "cf_contact_submissions" WHERE "status" = ${statusFilter}`
      : prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) FROM "cf_contact_submissions" WHERE "status" != 'archived'`,
  ])

  return {
    submissions: rows.map(mapRow),
    total: Number(countRows[0].count),
  }
}

export async function countUnreadSubmissions(): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) FROM "cf_contact_submissions" WHERE "status" = 'unread'
  `
  return Number(rows[0].count)
}

export async function getSubmission(id: string): Promise<SubmissionWithReplies | null> {
  const [submissionRows, replyRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "cf_contact_submissions" WHERE "id" = ${id} LIMIT 1
    `,
    prisma.$queryRaw<Array<{
      id: string; created_at: Date; submission_id: string; sent_by_id: string;
      body: string; signature_snapshot: string | null;
      signature_snapshot_kind: string | null; signature_snapshot_html: string | null;
      display_name: string | null; user_email: string;
    }>>`
      SELECT r.*, u."displayName" as display_name, u."email" as user_email
      FROM "cf_contact_submission_replies" r
      JOIN "User" u ON r.sent_by_id = u.id
      WHERE r.submission_id = ${id}
      ORDER BY r.created_at ASC
    `,
  ])

  const submissionRow = submissionRows[0]
  if (!submissionRow) return null

  const replies: ContactSubmissionReply[] = replyRows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    submissionId: r.submission_id,
    sentById: r.sent_by_id,
    sentByDisplayName: r.display_name,
    sentByEmail: r.user_email,
    body: r.body,
    signatureSnapshot: r.signature_snapshot,
    signatureSnapshotKind: isSignatureKind(r.signature_snapshot_kind) ? r.signature_snapshot_kind : null,
    signatureSnapshotHtml: r.signature_snapshot_html,
  }))

  return { ...mapRow(submissionRow), replies }
}

export async function updateSubmission(id: string, fields: { status?: string }): Promise<void> {
  if (fields.status) {
    await prisma.$executeRaw`
      UPDATE "cf_contact_submissions"
      SET "status" = ${fields.status}, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `
  }
}

export async function deleteSubmission(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "cf_contact_submissions" WHERE "id" = ${id}`
}

export async function getSubmissionsForExport(status?: string): Promise<ContactSubmission[]> {
  const rows = status && status !== 'all'
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "cf_contact_submissions"
        WHERE "status" = ${status}
        ORDER BY "created_at" ASC
      `
    : await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "cf_contact_submissions"
        ORDER BY "created_at" ASC
      `
  return rows.map(mapRow)
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

type CreateReplyData = {
  submissionId: string
  sentById: string
  body: string
  /** The markdown source, when there was one. Kept for the markdown kind so an
   *  old reply still renders the way it always did. */
  signatureSnapshot: string | null
  signatureSnapshotKind: SignatureKind | null
  /** What went out. Stored rather than re-rendered, because the profile it came
   *  from is editable and the sent email is not. */
  signatureSnapshotHtml: string | null
}

export async function createReply(data: CreateReplyData): Promise<string> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "cf_contact_submission_replies"
      ("id", "submission_id", "sent_by_id", "body", "signature_snapshot",
       "signature_snapshot_kind", "signature_snapshot_html")
    VALUES
      (gen_random_uuid()::text, ${data.submissionId}, ${data.sentById},
       ${data.body}, ${data.signatureSnapshot},
       ${data.signatureSnapshotKind}, ${data.signatureSnapshotHtml})
    RETURNING "id"
  `
  return rows[0].id
}

// ---------------------------------------------------------------------------
// User profiles (signature storage)
// ---------------------------------------------------------------------------

export async function getUserProfile(userId: string): Promise<ContactUserProfile | null> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; user_id: string;
    signature_kind: string | null;
    signature: string | null; signature_html: string | null; signature_puck: unknown;
    full_name: string | null; job_title: string | null;
    phone_display: string | null; phone_e164: string | null;
    created_at: Date; updated_at: Date;
  }>>`SELECT * FROM "cf_user_profiles" WHERE "user_id" = ${userId} LIMIT 1`

  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    userId: r.user_id,
    signatureKind: isSignatureKind(r.signature_kind) ? r.signature_kind : 'markdown',
    signature: r.signature,
    signatureHtml: r.signature_html,
    signaturePuck: r.signature_puck ?? null,
    fullName: r.full_name,
    jobTitle: r.job_title,
    phoneDisplay: r.phone_display,
    phoneE164: r.phone_e164,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export type UserProfilePatch = {
  signatureKind: SignatureKind
  signature: string | null
  signatureHtml: string | null
  signaturePuck: unknown
  fullName: string | null
  jobTitle: string | null
  phoneDisplay: string | null
  phoneE164: string | null
}

export async function upsertUserProfile(userId: string, patch: UserProfilePatch): Promise<void> {
  // Prisma hands a plain JS value straight to a jsonb parameter as text unless
  // it is told otherwise, so the builder data is stringified here and cast in
  // the statement. Null stays null rather than becoming the string 'null'.
  const puck = patch.signaturePuck == null ? null : JSON.stringify(patch.signaturePuck)
  await prisma.$executeRaw`
    INSERT INTO "cf_user_profiles"
      ("id", "user_id", "signature_kind", "signature", "signature_html", "signature_puck",
       "full_name", "job_title", "phone_display", "phone_e164")
    VALUES
      (gen_random_uuid()::text, ${userId}, ${patch.signatureKind}, ${patch.signature},
       ${patch.signatureHtml}, ${puck}::jsonb,
       ${patch.fullName}, ${patch.jobTitle}, ${patch.phoneDisplay}, ${patch.phoneE164})
    ON CONFLICT ("user_id") DO UPDATE
    SET "signature_kind" = ${patch.signatureKind},
        "signature"      = ${patch.signature},
        "signature_html" = ${patch.signatureHtml},
        "signature_puck" = ${puck}::jsonb,
        "full_name"      = ${patch.fullName},
        "job_title"      = ${patch.jobTitle},
        "phone_display"  = ${patch.phoneDisplay},
        "phone_e164"     = ${patch.phoneE164},
        "updated_at"     = CURRENT_TIMESTAMP
  `
}

// ---------------------------------------------------------------------------
// Retention pruning (per block, based on each form's own retentionDays setting)
// ---------------------------------------------------------------------------

export async function pruneExpiredSubmissionsByBlock(blockId: string, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    WITH deleted AS (
      DELETE FROM "cf_contact_submissions"
      WHERE "source_block_id" = ${blockId}
      AND "created_at" < ${cutoff}
      RETURNING id
    )
    SELECT COUNT(*) FROM deleted
  `
  const count = Number(result[0].count)
  if (count > 0) console.log(`[contact-form] Pruned ${count} expired submission(s) for block ${blockId}`)
  return count
}

// ---------------------------------------------------------------------------
// Conversation listing
//
// The same enquiries the inbox screen shows, in the shape anything that merges
// several channels into one list needs: newest activity first, where "activity"
// counts a reply as well as the enquiry itself. The screen orders by when the
// enquiry arrived, which is right for a list of enquiries and wrong for a list
// of conversations - a thread somebody answered this morning belongs at the top.
// ---------------------------------------------------------------------------

export type SubmissionSummaryRow = ContactSubmission & {
  /** The enquiry, or its newest reply, whichever is later. */
  lastActivityAt: Date
  replyCount: number
}

function mapSummary(r: Record<string, unknown>): SubmissionSummaryRow {
  return {
    ...mapRow(r),
    lastActivityAt: (r.last_activity_at as Date) ?? (r.created_at as Date),
    replyCount: Number(r.reply_count ?? 0),
  }
}

const SUMMARY_SELECT = `
  SELECT s.*,
         GREATEST(s."created_at", COALESCE(r."last_reply_at", s."created_at")) AS last_activity_at,
         COALESCE(r."reply_count", 0) AS reply_count
    FROM "cf_contact_submissions" s
    LEFT JOIN LATERAL (
      SELECT MAX(rp."created_at") AS last_reply_at, COUNT(*) AS reply_count
        FROM "cf_contact_submission_replies" rp
       WHERE rp."submission_id" = s."id"
    ) r ON true`

/** Enquiries by newest activity, optionally only those touched since a date.
 *  `before` pages backwards through them - a timestamp cursor rather than an
 *  offset, so a new enquiry arriving mid-page cannot make one repeat. */
export async function listSubmissionSummaries(opts: {
  since?: Date
  before?: Date
  limit: number
}): Promise<SubmissionSummaryRow[]> {
  const limit = Math.max(1, Math.min(200, opts.limit))
  const since = opts.since ?? null
  const before = opts.before ?? null
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `${SUMMARY_SELECT}
      WHERE ($1::timestamp IS NULL OR GREATEST(s."created_at", COALESCE(r."last_reply_at", s."created_at")) > $1::timestamp)
        AND ($2::timestamp IS NULL OR GREATEST(s."created_at", COALESCE(r."last_reply_at", s."created_at")) < $2::timestamp)
      ORDER BY last_activity_at DESC, s."id" DESC
      LIMIT $3`,
    since,
    before,
    limit,
  )
  return rows.map(mapSummary)
}

/** Every enquiry from any of these addresses, newest activity first. Used when
 *  something wants one person's whole history rather than a page of the list. */
export async function submissionSummariesForEmails(
  emails: string[],
  limit = 50,
): Promise<SubmissionSummaryRow[]> {
  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (cleaned.length === 0) return []
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `${SUMMARY_SELECT}
      WHERE lower(s."email") = ANY($1::text[])
      ORDER BY last_activity_at DESC, s."id" DESC
      LIMIT $2`,
    cleaned,
    Math.max(1, Math.min(200, limit)),
  )
  return rows.map(mapSummary)
}
