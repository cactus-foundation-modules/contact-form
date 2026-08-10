import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// The contact inbox is now a tab of core's shared Inbox rather than a screen of
// its own (see components/admin/InboxPanel). This route stays put so old
// bookmarks, the detail page's back link and any saved filter still land
// somewhere sensible instead of a 404.
export default async function ContactInboxRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
  const sp = new URLSearchParams(await searchParams)
  sp.set('tab', 'contact-form')
  return redirect(`/${adminPath}/inbox?${sp.toString()}`)
}
