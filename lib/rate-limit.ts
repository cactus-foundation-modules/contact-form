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
