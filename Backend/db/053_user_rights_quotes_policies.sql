-- AI_GENERATED | HUMAN_VALIDATION_REQUIRED
-- Align Add/View User -> User Rights -> Quotes & Policies with the H&B
-- OutSystems matrix. Existing screens and permission rows are preserved; obsolete
-- rows are hidden rather than deleted. Idempotent and safe to re-run.

BEGIN;

ALTER TABLE app_screen
    ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

INSERT INTO app_screen (screen_code, screen_name, module_id, is_visible)
SELECT 'POLICYSUMMARY', 'Policy Summary', m.id, true
FROM module m
WHERE m.module_name = 'Quotes & Policies'
  AND NOT EXISTS (
      SELECT 1 FROM app_screen WHERE screen_code = 'POLICYSUMMARY'
  );

UPDATE app_screen s
SET module_id = m.id,
    screen_name = names.screen_name,
    is_visible = true
FROM module m
JOIN (VALUES
    ('NEWBUSINESSINDIVIDUAL', 'New Business Quote'),
    ('ENDORSEMENTINDIVIDUAL', 'Endorsement Quote'),
    ('RENEWALINDIVIDUAL', 'Renewal Quote'),
    ('POLICIESINDIVIDUAL', 'Policies'),
    ('POLICYSUMMARY', 'Policy Summary')
) AS names(screen_code, screen_name) ON true
WHERE m.module_name = 'Quotes & Policies'
  AND s.screen_code = names.screen_code;

-- Hide all other Quotes & Policies rows, including the four Business rows and
-- the later duplicate NBQUOTESSCREEN row. No records or grants are deleted.
UPDATE app_screen s
SET is_visible = false
FROM module m
WHERE s.module_id = m.id
  AND m.module_name = 'Quotes & Policies'
  AND s.screen_code NOT IN (
      'NEWBUSINESSINDIVIDUAL',
      'ENDORSEMENTINDIVIDUAL',
      'RENEWALINDIVIDUAL',
      'POLICIESINDIVIDUAL',
      'POLICYSUMMARY'
  );

-- Preserve existing per-user intent by initializing Policy Summary from the
-- user's Policies permissions when the new row has no explicit grant yet.
INSERT INTO user_screen (
    user_id, screen_id,
    is_view_permission, is_create_permission, is_edit_permission,
    is_duplicate_permission, is_upload_permission, is_download_permission,
    is_view_sensitive_info, is_access_sensitive_doc, is_approve_reject, all_access
)
SELECT us.user_id, summary.id,
       us.is_view_permission, us.is_create_permission, us.is_edit_permission,
       us.is_duplicate_permission, us.is_upload_permission, us.is_download_permission,
       us.is_view_sensitive_info, us.is_access_sensitive_doc, us.is_approve_reject, us.all_access
FROM user_screen us
JOIN app_screen policies
  ON policies.id = us.screen_id AND policies.screen_code = 'POLICIESINDIVIDUAL'
JOIN app_screen summary
  ON summary.screen_code = 'POLICYSUMMARY'
ON CONFLICT (user_id, screen_id) DO NOTHING;

COMMIT;
