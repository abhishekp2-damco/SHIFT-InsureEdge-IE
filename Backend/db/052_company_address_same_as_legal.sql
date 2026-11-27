-- AI_GENERATED | HUMAN_VALIDATION_REQUIRED
-- Persist the Client Company Mailing Address "Same as Home Office / Legal Address"
-- selection explicitly. Existing address values are preserved and existing rows default
-- to unchecked because the historical schema did not retain the user's actual selection.

ALTER TABLE company_address
    ADD COLUMN IF NOT EXISTS is_same_as_legal boolean NOT NULL DEFAULT false;
