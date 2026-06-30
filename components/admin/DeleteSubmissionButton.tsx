'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Props = {
  submissionId: string
}

// Lives in a client component because the detail page is a Server Component, and
// Server Components can't attach the confirm() onClick handler this needs. It also
// calls the DELETE handler directly (the old inline form POSTed with a _method
// field the API never read).
export default function DeleteSubmissionButton({ submissionId }: Props) {
  const router = useRouter()
  const adminPath = useAdminPath()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this submission and all its replies?')) return
    setDeleting(true)
    const res = await fetch(`/api/m/contact-form/admin/submissions/${submissionId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      router.push(`/${adminPath}/m/contact-form/inbox`)
      router.refresh()
    } else {
      setDeleting(false)
      alert('Failed to delete this submission.')
    }
  }

  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      onClick={handleDelete}
      disabled={deleting}
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  )
}
