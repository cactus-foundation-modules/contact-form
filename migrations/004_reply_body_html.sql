-- A reply can now be written with formatting (bold, links, lists) from the
-- unified inbox. The words as typed stay in "body" as plain text, which is what
-- every reader of this table already expects; the formatted version that
-- actually went out is kept beside it. NULL is a reply sent before this change,
-- or one typed as plain markdown on this module's own screen.
ALTER TABLE "cf_contact_submission_replies"
    ADD COLUMN IF NOT EXISTS "body_html" TEXT;
