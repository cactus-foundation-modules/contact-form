import { prisma } from '@/lib/db/prisma'
import type { ContactFormConfig } from './types'

export async function checkContactRateLimit(
  ip: string,
  config: Pick<ContactFormConfig, 'rateLimitMaxAttempts' | 'rateLimitWindowMin'>,
  blockId?: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - config.rateLimitWindowMin * 60 * 1000)

  const count = blockId
    ? await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM "cf_contact_submissions"
        WHERE "ip_address" = ${ip}
        AND "created_at" > ${windowStart}
        AND "source_block_id" = ${blockId}
      `
    : await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM "cf_contact_submissions"
        WHERE "ip_address" = ${ip}
        AND "created_at" > ${windowStart}
      `

  return Number(count[0].count) < config.rateLimitMaxAttempts
}

// Per-address limit, counted across the whole site rather than per block.
//
// The IP limit above protects the site; this one protects the person whose
// address was typed into the form. An auto-reply is sent to an unverified
// address from the site's own trusted domain, so without this a spammer can
// point the form at one victim, rotate their source address, and have the site
// mail-bomb them - on the site's sending reputation, not theirs.
export async function checkContactEmailRateLimit(
  email: string,
  config: Pick<ContactFormConfig, 'rateLimitMaxAttempts' | 'rateLimitWindowMin'>
): Promise<boolean> {
  const windowStart = new Date(Date.now() - config.rateLimitWindowMin * 60 * 1000)

  const count = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) FROM "cf_contact_submissions"
    WHERE lower("email") = ${email.trim().toLowerCase()}
    AND "created_at" > ${windowStart}
  `

  return Number(count[0].count) < config.rateLimitMaxAttempts
}
