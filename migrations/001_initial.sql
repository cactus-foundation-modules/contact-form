-- Contact Form Module — Initial Migration
-- Table prefix: cf_
-- Applied once by the Cactus module migration runner during build.

-- ---------------------------------------------------------------------------
-- Contact form submissions
-- ---------------------------------------------------------------------------

CREATE TABLE "cf_contact_submissions" (
    "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Submitted field values
    "name"          TEXT        NOT NULL,
    "email"         TEXT        NOT NULL,
    "phone"         TEXT,
    "company"       TEXT,
    "subject"       TEXT,
    "message"       TEXT        NOT NULL,

    -- Request metadata
    "ip_address"    TEXT,
    "user_agent"    TEXT,

    -- GDPR
    "gdpr_consent"  BOOLEAN     NOT NULL DEFAULT false,

    -- Inbox state: "unread" | "read" | "archived"
    "status"        TEXT        NOT NULL DEFAULT 'unread',

    -- Source tracking (which Puck block on which page/layout)
    "source_type"       TEXT,
    "source_id"         TEXT,
    "source_block_id"   TEXT,
    "source_label"      TEXT,

    CONSTRAINT "cf_contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cf_contact_submissions_status_idx"     ON "cf_contact_submissions" ("status");
CREATE INDEX "cf_contact_submissions_created_at_idx" ON "cf_contact_submissions" ("created_at");
CREATE INDEX "cf_contact_submissions_email_idx"      ON "cf_contact_submissions" ("email");
CREATE INDEX "cf_contact_submissions_ip_created_idx" ON "cf_contact_submissions" ("ip_address", "created_at");
CREATE INDEX "cf_contact_submissions_block_id_idx"   ON "cf_contact_submissions" ("source_block_id");

-- ---------------------------------------------------------------------------
-- Reply thread per submission
-- ---------------------------------------------------------------------------

CREATE TABLE "cf_contact_submission_replies" (
    "id"                    TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submission_id"         TEXT        NOT NULL,
    "sent_by_id"            TEXT        NOT NULL,
    "body"                  TEXT        NOT NULL,
    "signature_snapshot"    TEXT,

    CONSTRAINT "cf_contact_submission_replies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cf_contact_submission_replies_submission_fk"
        FOREIGN KEY ("submission_id") REFERENCES "cf_contact_submissions" ("id") ON DELETE CASCADE,
    CONSTRAINT "cf_contact_submission_replies_user_fk"
        FOREIGN KEY ("sent_by_id") REFERENCES "User" ("id") ON DELETE RESTRICT
);

CREATE INDEX "cf_contact_submission_replies_submission_idx" ON "cf_contact_submission_replies" ("submission_id");

-- ---------------------------------------------------------------------------
-- Per-admin email signature (one row per User, created on first save)
-- ---------------------------------------------------------------------------

CREATE TABLE "cf_user_profiles" (
    "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id"       TEXT        NOT NULL,
    "signature"     TEXT,

    CONSTRAINT "cf_user_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cf_user_profiles_user_id_unique" UNIQUE ("user_id"),
    CONSTRAINT "cf_user_profiles_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE
);
