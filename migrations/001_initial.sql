-- Contact Form Module — Initial Migration
-- Table prefix: cf_
-- Applied once by the Cactus module migration runner during build.

-- ---------------------------------------------------------------------------
-- Site-wide module configuration (one row per Cactus installation)
-- ---------------------------------------------------------------------------

CREATE TABLE "cf_contact_form_config" (
    "id"                    TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Field visibility toggles
    "show_phone"            BOOLEAN     NOT NULL DEFAULT true,
    "show_company"          BOOLEAN     NOT NULL DEFAULT false,
    "show_subject"          BOOLEAN     NOT NULL DEFAULT true,

    -- Field required toggles (only applies when show_* is true)
    "require_phone"         BOOLEAN     NOT NULL DEFAULT false,
    "require_company"       BOOLEAN     NOT NULL DEFAULT false,
    "require_subject"       BOOLEAN     NOT NULL DEFAULT false,

    -- Name validation: "first_only" | "both"
    "name_validation_mode"  TEXT        NOT NULL DEFAULT 'first_only',

    -- Notification settings
    "notification_email"    TEXT,
    "cc_emails"             TEXT[]      NOT NULL DEFAULT '{}',
    "auto_reply_enabled"    BOOLEAN     NOT NULL DEFAULT false,
    "auto_reply_body"       TEXT,

    -- Spam protection
    "turnstile_enabled"     BOOLEAN     NOT NULL DEFAULT true,
    "rate_limit_enabled"    BOOLEAN     NOT NULL DEFAULT true,
    "rate_limit_max_attempts" INTEGER   NOT NULL DEFAULT 3,
    "rate_limit_window_min" INTEGER     NOT NULL DEFAULT 10,

    -- GDPR
    "gdpr_consent_enabled"  BOOLEAN     NOT NULL DEFAULT false,
    "gdpr_consent_label"    TEXT,

    -- Retention policy (0 = never auto-delete)
    "retention_days"        INTEGER     NOT NULL DEFAULT 0,

    -- Default success message
    "success_message"       TEXT        NOT NULL DEFAULT 'Thank you for your message. We''ll be in touch soon.',

    CONSTRAINT "cf_contact_form_config_pkey" PRIMARY KEY ("id")
);

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

    -- Inbox state: "unread" | "read" | "archived" | "deleted"
    "status"        TEXT        NOT NULL DEFAULT 'unread',

    CONSTRAINT "cf_contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cf_contact_submissions_status_idx" ON "cf_contact_submissions" ("status");
CREATE INDEX "cf_contact_submissions_created_at_idx" ON "cf_contact_submissions" ("created_at");
CREATE INDEX "cf_contact_submissions_email_idx" ON "cf_contact_submissions" ("email");
CREATE INDEX "cf_contact_submissions_ip_created_idx" ON "cf_contact_submissions" ("ip_address", "created_at");

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

-- ---------------------------------------------------------------------------
-- Insert default config row
-- ---------------------------------------------------------------------------

INSERT INTO "cf_contact_form_config" ("id") VALUES (gen_random_uuid()::text);
