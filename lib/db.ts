import { prisma } from '@/lib/db/prisma'
import type {
  ContactSubmission,
  ContactSubmissionReply,
  ContactUserProfile,
  SubmissionWithReplies,
  PaginatedSubmissions,
} from './types'

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
  signatureSnapshot: string | null
}

export async function createReply(data: CreateReplyData): Promise<string> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "cf_contact_submission_replies"
      ("id", "submission_id", "sent_by_id", "body", "signature_snapshot")
    VALUES
      (gen_random_uuid()::text, ${data.submissionId}, ${data.sentById},
       ${data.body}, ${data.signatureSnapshot})
    RETURNING "id"
  `
  return rows[0].id
}

// ---------------------------------------------------------------------------
// User profiles (signature storage)
// ---------------------------------------------------------------------------

export async function getUserProfile(userId: string): Promise<ContactUserProfile | null> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; user_id: string; signature: string | null; created_at: Date; updated_at: Date;
  }>>`SELECT * FROM "cf_user_profiles" WHERE "user_id" = ${userId} LIMIT 1`

  const r = rows[0]
  if (!r) return null
  return { id: r.id, userId: r.user_id, signature: r.signature, createdAt: r.created_at, updatedAt: r.updated_at }
}

export async function upsertUserProfile(userId: string, signature: string | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "cf_user_profiles" ("id", "user_id", "signature")
    VALUES (gen_random_uuid()::text, ${userId}, ${signature})
    ON CONFLICT ("user_id") DO UPDATE
    SET "signature" = ${signature}, "updated_at" = CURRENT_TIMESTAMP
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
