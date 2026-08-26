-- Signature kinds: rich text (markdown, the original), pasted HTML, or a
-- signature built from the email blocks in the page builder.
--
-- `signature` keeps its original meaning - the markdown one - so an install that
-- upgrades keeps the signature it already had, with `signature_kind` defaulting
-- to 'markdown' underneath it.
--
-- The per-person fields below are what makes one pasted HTML blob usable by a
-- whole team: the owner hands out the markup once and each person's own name,
-- job title and number merge into it. Core's User carries a display name and an
-- email and nothing else useful here (its only phone number is encrypted, and is
-- for sign-in codes rather than for printing on a signature).

ALTER TABLE "cf_user_profiles"
    ADD COLUMN IF NOT EXISTS "signature_kind"  TEXT NOT NULL DEFAULT 'markdown',
    ADD COLUMN IF NOT EXISTS "signature_html"  TEXT,
    ADD COLUMN IF NOT EXISTS "signature_puck"  JSONB,
    ADD COLUMN IF NOT EXISTS "full_name"       TEXT,
    ADD COLUMN IF NOT EXISTS "job_title"       TEXT,
    ADD COLUMN IF NOT EXISTS "phone_display"   TEXT,
    ADD COLUMN IF NOT EXISTS "phone_e164"      TEXT;

-- Sent replies keep a snapshot of the signature as it was on the day. Markdown
-- alone can no longer describe that, so the rendered HTML is stored alongside
-- it. A NULL kind is a reply sent before this change: markdown, rendered on
-- read, exactly as it always was.
ALTER TABLE "cf_contact_submission_replies"
    ADD COLUMN IF NOT EXISTS "signature_snapshot_kind" TEXT,
    ADD COLUMN IF NOT EXISTS "signature_snapshot_html" TEXT;
