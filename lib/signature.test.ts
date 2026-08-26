import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml, emailHtmlToPlainText } from '@/lib/sanitize'
import { interpolate } from '@/lib/email/blocks'
import { cleanSignatureHtml, signatureMergeVars } from './signature'

// The signature Chris asked this feature to carry, kept whole on purpose: it is
// the shape of a real pasted corporate signature (nested tables, presentational
// attributes, an onerror fallback, merge tags in hrefs), and every one of those
// is something an earlier allow-list would have quietly eaten.

const SAMPLE = `<table cellpadding="0" cellspacing="0" border="0" width="520" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#2B2D30;width:520px">
  <tr>
    <td width="196" style="padding:0 18px 0 0;vertical-align:top;width:196px">
      <a href="https://deskwell.co.uk" style="text-decoration:none;border:0">
        <img src="https://deskwell.co.uk/brand/email-signature-logo.png"
             alt="Deskwell Office Furniture"
             onerror="this.onerror=null;this.src='Email Signature Logo.png'"
             width="178" height="34" style="display:block;border:0;outline:none;text-decoration:none;width:178px;height:34px">
      </a>
    </td>
    <td style="padding:0 0 0 18px;border-left:3px solid #E3A857;vertical-align:top">
      <div style="font-size:15px;font-weight:bold;color:#1B3E44;line-height:1.3">{{FULL_NAME}}</div>
      <div style="font-size:13px;color:#6B6A66;line-height:1.5;padding-bottom:8px">{{JOB_TITLE}}</div>
      <div style="font-size:13px;line-height:1.7">
        <a href="mailto:{{EMAIL}}" style="color:#1A5F5A;text-decoration:none">{{EMAIL}}</a><br>
        <a href="tel:{{PHONE_E164}}" style="color:#1A5F5A;text-decoration:none">{{PHONE_DISPLAY}}</a><br>
        <a href="https://deskwell.co.uk" style="color:#1A5F5A;text-decoration:none;font-weight:bold">deskwell.co.uk</a>
      </div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:14px 0 0">
      <div style="font-size:12px;color:#6B6A66;line-height:1.5;border-top:1px solid #D8D6D1;padding-top:10px">
        Furniture for businesses that have better things to do.
      </div>
      <div style="font-size:10px;color:#9A9894;line-height:1.5;padding-top:6px">
        Deskwell Limited, registered in England and Wales, company number 17332661. VAT number GB 525 366 781.
        Registered office: 22 Blackwall Basin Moorings, 1 Myers Walk, Canary Wharf, London E14 5GT.
      </div>
    </td>
  </tr>
</table>`

describe('the pasted signature', () => {
  const clean = sanitizeEmailHtml(SAMPLE)

  it('keeps the table layout attributes', () => {
    for (const attr of ['cellpadding="0"', 'cellspacing="0"', 'border="0"', 'width="520"', 'colspan="2"', 'width="196"']) {
      expect(clean, attr).toContain(attr)
    }
  })

  it('keeps inline styles, the image and every link', () => {
    expect(clean).toContain('border-left:3px solid #E3A857')
    expect(clean).toContain('src="https://deskwell.co.uk/brand/email-signature-logo.png"')
    expect(clean).toContain('height="34"')
    expect(clean).toContain('href="mailto:{{EMAIL}}"')
    expect(clean).toContain('href="tel:{{PHONE_E164}}"')
    expect(clean).toContain('alt="Deskwell Office Furniture"')
  })

  it('strips the onerror handler and nothing else', () => {
    expect(clean).not.toContain('onerror')
    expect(clean).not.toMatch(/on[a-z]+=/i)
  })

  it('fills the merge tags in', () => {
    const vars = {
      FULL_NAME: 'Chris Taylor-Guest', JOB_TITLE: 'Director',
      EMAIL: 'chris@deskwell.co.uk', PHONE_DISPLAY: '020 7946 0123', PHONE_E164: '+442079460123',
    }
    const out = interpolate(clean, vars, true)
    expect(out).toContain('Chris Taylor-Guest')
    expect(out).toContain('href="mailto:chris@deskwell.co.uk"')
    expect(out).toContain('href="tel:+442079460123"')
    expect(out).not.toContain('{{')
  })

  it('leaves an unfilled tag as nothing rather than as braces', () => {
    const out = interpolate(clean, { FULL_NAME: 'Chris' }, true)
    expect(out).not.toContain('{{JOB_TITLE}}')
    expect(out).not.toContain('JOB_TITLE')
  })

  it('flattens to readable plain text', () => {
    const text = emailHtmlToPlainText(interpolate(clean, { FULL_NAME: 'Chris', JOB_TITLE: 'Director' }, true))
    expect(text).toContain('Chris')
    expect(text).toContain('Director')
    expect(text).toContain('company number 17332661')
    expect(text.split('\n').length).toBeGreaterThan(2)
  })

  it('still refuses script and javascript: hrefs', () => {
    const nasty = sanitizeEmailHtml('<div>hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe></div>')
    expect(nasty).not.toContain('script')
    expect(nasty).not.toContain('javascript:')
    expect(nasty).not.toContain('iframe')
    expect(nasty).toContain('hi')
  })

  it('is what cleanSignatureHtml stores, and an empty paste stores nothing', () => {
    expect(cleanSignatureHtml(SAMPLE)).toBe(clean.trim())
    expect(cleanSignatureHtml('   ')).toBeNull()
    expect(cleanSignatureHtml(null)).toBeNull()
    // Markup that sanitises away to nothing is stored as nothing, not as ''.
    expect(cleanSignatureHtml('<script>alert(1)</script>')).toBeNull()
  })
})

describe('signatureMergeVars', () => {
  const author = { displayName: 'Chris T-G', email: 'chris@deskwell.co.uk' }

  it('prefers the profile name and always takes the email from the account', () => {
    const vars = signatureMergeVars(
      { fullName: 'Chris Taylor-Guest', jobTitle: 'Director', phoneDisplay: '020 7946 0123', phoneE164: '+442079460123' },
      author,
    )
    expect(vars.FULL_NAME).toBe('Chris Taylor-Guest')
    expect(vars.EMAIL).toBe('chris@deskwell.co.uk')
    expect(vars.PHONE_E164).toBe('+442079460123')
  })

  it('falls back to the account display name, and blanks what is not set', () => {
    const vars = signatureMergeVars(null, author)
    expect(vars.FULL_NAME).toBe('Chris T-G')
    expect(vars.JOB_TITLE).toBe('')
    expect(vars.PHONE_DISPLAY).toBe('')
  })
})
