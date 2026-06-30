// Keeps a single rolling admin notification in sync with the unread-message count.
// Imports the core alert helpers via the @/ alias, the same way other module code
// reaches core libs (e.g. @/lib/db/prisma).
import { upsertAlert, clearAlert } from '@/lib/notifications/alerts'
import { countUnreadSubmissions } from './db'

const DEDUPE_KEY = 'contact-form:messages'

// Counts unread submissions and reflects that in one rolling "N unread messages"
// notification: raised/updated when there are any, cleared when the count hits zero.
// Call (fire-and-forget) after any mutation that changes the unread count.
export async function syncMessagesNotification(): Promise<void> {
  const n = await countUnreadSubmissions()

  if (n > 0) {
    await upsertAlert({
      type: 'message',
      dedupeKey: DEDUPE_KEY,
      title: `${n} unread message${n === 1 ? '' : 's'}`,
      link: '/m/contact-form/inbox?tab=unread',
    })
  } else {
    await clearAlert(DEDUPE_KEY)
  }
}
