'use client'

import { useEffect, useRef, useState } from 'react'
import { markdownToHtml } from '@/modules/contact-form/lib/markdown-client'

type Props = {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  minHeight?: string
  // What to render in the Preview tab when it differs from `value`
  // (e.g. a reply previewed with its signature appended). Defaults to `value`.
  previewContent?: string
}

type ToolAction =
  | { kind: 'wrap'; before: string; after: string; placeholder: string }
  | { kind: 'line'; prefix: string }
  | { kind: 'link' }

const TOOLS: { label: string; title: string; style?: React.CSSProperties; action: ToolAction }[] = [
  { label: 'B', title: 'Bold', style: { fontWeight: 700 }, action: { kind: 'wrap', before: '**', after: '**', placeholder: 'bold text' } },
  { label: 'I', title: 'Italic', style: { fontStyle: 'italic' }, action: { kind: 'wrap', before: '*', after: '*', placeholder: 'italic text' } },
  { label: 'H', title: 'Heading', action: { kind: 'line', prefix: '## ' } },
  { label: 'Link', title: 'Link', action: { kind: 'link' } },
  { label: 'List', title: 'Bullet list', action: { kind: 'line', prefix: '- ' } },
  { label: 'Quote', title: 'Blockquote', action: { kind: 'line', prefix: '> ' } },
  { label: 'Code', title: 'Inline code', style: { fontFamily: 'monospace' }, action: { kind: 'wrap', before: '`', after: '`', placeholder: 'code' } },
]

// A small dependency-free markdown editor: a formatting toolbar that edits the
// textarea selection, plus a Write/Preview toggle backed by the module's
// client-safe markdownToHtml. Shared by the signature page and the reply box.
export default function MarkdownEditor({ value, onChange, rows = 8, placeholder, minHeight = '8rem', previewContent }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<[number, number] | null>(null)
  const [preview, setPreview] = useState(false)

  // Restore the caret/selection after a toolbar edit re-renders the textarea.
  useEffect(() => {
    if (pendingSel.current && ref.current) {
      const [start, end] = pendingSel.current
      ref.current.focus()
      ref.current.setSelectionRange(start, end)
      pendingSel.current = null
    }
  }, [value])

  function apply(action: ToolAction) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)

    let next = value
    let selStart = start
    let selEnd = end

    if (action.kind === 'wrap') {
      const inner = selected || action.placeholder
      next = value.slice(0, start) + action.before + inner + action.after + value.slice(end)
      selStart = start + action.before.length
      selEnd = selStart + inner.length
    } else if (action.kind === 'line') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const nl = value.indexOf('\n', end)
      const lineEnd = nl === -1 ? value.length : nl
      const block = value.slice(lineStart, lineEnd)
      const prefixed = block
        .split('\n')
        .map((line) => (line.startsWith(action.prefix) ? line : action.prefix + line))
        .join('\n')
      next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
      selStart = lineStart
      selEnd = lineStart + prefixed.length
    } else {
      const text = selected || 'text'
      const snippet = `[${text}](url)`
      next = value.slice(0, start) + snippet + value.slice(end)
      selStart = start + text.length + 3 // position of "url"
      selEnd = selStart + 3
    }

    pendingSel.current = [selStart, selEnd]
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {!preview && TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            className="btn btn-secondary btn-sm"
            title={t.title}
            aria-label={t.title}
            onClick={() => apply(t.action)}
            style={t.style}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${!preview ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreview(false)}
          >
            Write
          </button>
          <button
            type="button"
            className={`btn btn-sm ${preview ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
        </div>
      </div>

      {preview ? (
        <div
          className="prose"
          style={{ minHeight, padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: '0.375rem' }}
          dangerouslySetInnerHTML={{
            __html: (previewContent ?? value)
              ? markdownToHtml(previewContent ?? value)
              : '<em style="color:var(--color-text-muted)">Nothing to preview.</em>',
          }}
        />
      ) : (
        <div className="field" style={{ marginBottom: 0 }}>
          <textarea
            ref={ref}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ minHeight }}
          />
        </div>
      )}
    </div>
  )
}
