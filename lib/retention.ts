import { prisma } from '@/lib/db/prisma'
import { pruneExpiredSubmissionsByBlock } from './db'

type PuckItem = { type: string; id: string; props: Record<string, unknown> }
type PuckData = {
  content?: PuckItem[]
  zones?: Record<string, PuckItem[]>
}

function collectContactFormBlocks(data: unknown): Array<{ id: string; retentionDays: number }> {
  const blocks: Array<{ id: string; retentionDays: number }> = []
  if (!data || typeof data !== 'object') return blocks
  const puck = data as PuckData
  const items: PuckItem[] = [
    ...(puck.content ?? []),
    ...Object.values(puck.zones ?? {}).flat(),
  ]
  for (const item of items) {
    if (item.type === 'ContactForm') {
      const retention = item.props.retentionDays
      blocks.push({
        id: item.id,
        retentionDays: typeof retention === 'number' ? retention : 0,
      })
    }
  }
  return blocks
}

export async function runRetentionPolicy(): Promise<number> {
  const blockMap = new Map<string, number>()

  const [pages, layouts] = await Promise.all([
    prisma.infoPage.findMany({ select: { builderData: true } }),
    prisma.layout.findMany({ select: { builderData: true } }),
  ])

  for (const record of [...pages, ...layouts]) {
    if (!record.builderData) continue
    let data: unknown
    try {
      data = typeof record.builderData === 'string'
        ? JSON.parse(record.builderData)
        : record.builderData
    } catch { continue }
    for (const block of collectContactFormBlocks(data)) {
      if (!blockMap.has(block.id)) blockMap.set(block.id, block.retentionDays)
    }
  }

  let deleted = 0
  for (const [blockId, retentionDays] of blockMap.entries()) {
    if (retentionDays > 0) {
      deleted += await pruneExpiredSubmissionsByBlock(blockId, retentionDays)
    }
  }
  return deleted
}
