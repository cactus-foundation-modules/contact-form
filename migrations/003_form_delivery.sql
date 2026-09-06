-- Which form an enquiry came from, and where it was addressed.
--
-- Both are settled the moment the enquiry arrives, from the form's own saved
-- settings, rather than looked up afterwards. A form's title gets edited and its
-- delivery gets pointed somewhere else; an enquiry from last March came from the
-- form as it read last March, and a screen that says otherwise is telling a
-- polite fib about somebody's post.
--
-- `form_title` is the name of the form in the owner's own words - "Get in
-- touch", "Request a quote". It is stored whether or not the title is drawn on
-- the page: a form can perfectly well sit under a heading of its own and still
-- need a name everywhere else.
--
-- `destination_id` is opaque here and deliberately so. It is an id another
-- module published through core's message-destination seam, this module hands
-- it back untouched, and nothing in the contact form knows or cares what it
-- points at. On a site with no such module it is NULL on every row, which is
-- exactly how every enquiry behaved before any of this existed.

ALTER TABLE "cf_contact_submissions"
    ADD COLUMN IF NOT EXISTS "form_title"     TEXT,
    ADD COLUMN IF NOT EXISTS "destination_id" TEXT;
