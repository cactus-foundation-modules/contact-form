'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  submissionId: string
  archived: boolean
}

export default function ArchiveToggleButton({ submissionId, archived }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleToggle() {
    setBusy(true)
    const res = await fetch(`/api/m/contact-form/admin/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: archived ? 'read' : 'archived' }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      alert(`Failed to ${archived ? 'unarchive' : 'archive'} this submission.`)
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={handleToggle}
      disabled={busy}
    >
      {busy ? (archived ? 'Unarchiving…' : 'Archiving…') : archived ? 'Unarchive' : 'Archive'}
    </button>
  )
}
