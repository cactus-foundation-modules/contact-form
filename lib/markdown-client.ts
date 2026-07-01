'use client'

import { marked } from 'marked'
import createDOMPurify from 'dompurify'

// Browser-only markdown renderer for this module's client components.
//
// Vendored deliberately: client components must never import @/lib/sanitize
// (it lazy-requires jsdom, which breaks in the serverless runtime if it reaches
// the client bundle). Core ships @/lib/markdown-client for exactly this, but a
// module that imports it fails to build on any install whose core predates that
// file. Keeping our own copy makes contact-form portable across core versions.
//
// The allow-list below mirrors core's lib/sanitize-config.ts so output matches
// the server renderer (@/lib/sanitize) used elsewhere in the module. Keep the
// two in sync if core's list ever changes.
//
// Only call markdownToHtml in the browser (e.g. from an event handler or a
// "preview" branch gated behind a mounted/loading flag). It reads `window`, so
// it must not run during server-side rendering.

// Allowed HTML elements after markdown parsing. Raw HTML in the input is
// stripped before parsing - authors write markdown, not HTML.
const ALLOWED_TAGS = [
  'p', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'em', 'del', 's',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
]

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'id', 'class',
]

let _purifier: ReturnType<typeof createDOMPurify> | null = null

function getPurifier(): ReturnType<typeof createDOMPurify> {
  if (_purifier) return _purifier
  _purifier = createDOMPurify(window)
  return _purifier
}

// Converts markdown to sanitized HTML.
// Raw HTML blocks in the input are escaped by stripping angle brackets first,
// so <script> etc. never reach the parser.
export function markdownToHtml(markdown: string): string {
  const stripped = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rawHtml = marked.parse(stripped, { async: false, breaks: true }) as string

  return getPurifier().sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })
}
