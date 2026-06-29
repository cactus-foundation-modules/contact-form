import { getContactFormConfig, pruneExpiredSubmissions } from './db'

export async function runRetentionPolicy(): Promise<void> {
  const config = await getContactFormConfig()
  if (!config || config.retentionDays <= 0) return
  await pruneExpiredSubmissions(config.retentionDays)
}
