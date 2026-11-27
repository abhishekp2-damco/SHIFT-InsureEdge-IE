-- Convert legacy/ad-hoc issued policy numbers to the IE US H&B OutSystems shape:
-- CCC-IIIII-SSSSSSS-00 (client id, intermediary id, policy sequence, base-policy suffix).
--
-- This is an idempotent data migration. It preserves every policy row and its relationships,
-- and synchronizes denormalized policy-number copies used by history, notices and submissions.
BEGIN;

CREATE TEMP TABLE policy_number_migration_map (
    client_id bigint NOT NULL,
    old_policy_number varchar(100) NOT NULL,
    new_policy_number varchar(100) NOT NULL,
    PRIMARY KEY (client_id, old_policy_number)
) ON COMMIT DROP;

WITH candidates AS (
    SELECT
        p.client_id,
        p.policy_number AS old_policy_number,
        COALESCE(MIN(p.intermediary_id), 0) AS intermediary_id,
        CASE WHEN p.policy_number ~ '^HB-[0-9]{4}-[0-9]+$'
            THEN (regexp_match(p.policy_number, '^HB-[0-9]{4}-([0-9]+)$'))[1]::integer
            ELSE NULL
        END AS legacy_sequence
    FROM policy p
    WHERE p.policy_number !~ '^[0-9]{3}-[0-9]{5}-[0-9]{7}-[0-9]{2}$'
      AND (
          p.policy_number ~ '^HB-[0-9]{4}-[0-9]+$'
          OR EXISTS (
              SELECT 1 FROM policy issued
              WHERE issued.client_id = p.client_id
                AND issued.policy_number = p.policy_number
                AND issued.policy_type = 'POLICY'
          )
          OR EXISTS (SELECT 1 FROM claim c WHERE c.policy_id = p.id)
      )
    GROUP BY p.client_id, p.policy_number
), proposed AS (
    SELECT
        l.*,
        lpad(l.client_id::text, 3, '0') || '-' ||
        lpad(l.intermediary_id::text, 5, '0') || '-' ||
        CASE WHEN l.legacy_sequence IS NULL THEN NULL
            ELSE lpad(l.legacy_sequence::text, 7, '0') || '-00'
        END AS proposed_number
    FROM candidates l
), conflicts AS (
    SELECT
        p.*,
        p.legacy_sequence IS NULL
            OR count(*) OVER (PARTITION BY p.client_id, p.proposed_number) > 1
            OR EXISTS (
                SELECT 1 FROM policy current_policy
                WHERE current_policy.client_id = p.client_id
                  AND current_policy.policy_number = p.proposed_number
            ) AS needs_new_sequence
    FROM proposed p
), client_bases AS (
    SELECT
        c.client_id,
        GREATEST(
            COALESCE(MAX(c.legacy_sequence), 0),
            COALESCE((
                SELECT MAX(substring(existing.policy_number from '^[0-9]{3}-[0-9]{5}-([0-9]{7})-[0-9]{2}$')::integer)
                FROM policy existing
                WHERE existing.client_id = c.client_id
                  AND existing.policy_number ~ '^[0-9]{3}-[0-9]{5}-[0-9]{7}-[0-9]{2}$'
            ), 0)
        ) AS max_sequence
    FROM conflicts c
    GROUP BY c.client_id
), numbered AS (
    SELECT
        c.*,
        SUM(CASE WHEN c.needs_new_sequence THEN 1 ELSE 0 END) OVER (
            PARTITION BY c.client_id ORDER BY c.old_policy_number
        ) AS conflict_sequence
    FROM conflicts c
)
INSERT INTO policy_number_migration_map (client_id, old_policy_number, new_policy_number)
SELECT
    n.client_id,
    n.old_policy_number,
    CASE WHEN n.needs_new_sequence THEN
        lpad(n.client_id::text, 3, '0') || '-' ||
        lpad(n.intermediary_id::text, 5, '0') || '-' ||
        lpad((b.max_sequence + n.conflict_sequence)::text, 7, '0') || '-00'
    ELSE n.proposed_number END
FROM numbered n
JOIN client_bases b ON b.client_id = n.client_id;

UPDATE policy p
SET policy_number = m.new_policy_number
FROM policy_number_migration_map m
WHERE p.client_id = m.client_id
  AND p.policy_number = m.old_policy_number;

UPDATE policy_transaction pt
SET policy_number = m.new_policy_number
FROM policy_number_migration_map m
WHERE pt.client_id = m.client_id
  AND pt.policy_number = m.old_policy_number;

-- Renewal notices are convention-mapped and may not exist in SQL-only setups. Support both
-- singular and plural names used by historical database snapshots.
DO $migration$
BEGIN
    IF to_regclass('public.renewal_notice') IS NOT NULL THEN
        EXECUTE '
            UPDATE renewal_notice rn
            SET policy_number = m.new_policy_number
            FROM policy_number_migration_map m
            WHERE rn.client_id = m.client_id
              AND rn.policy_number = m.old_policy_number';
    ELSIF to_regclass('public.renewal_notices') IS NOT NULL THEN
        EXECUTE '
            UPDATE renewal_notices rn
            SET policy_number = m.new_policy_number
            FROM policy_number_migration_map m
            WHERE rn.client_id = m.client_id
              AND rn.policy_number = m.old_policy_number';
    END IF;
END
$migration$;

-- Issued submissions cache policyNumber and originalPolicyNumber inside jsonb.
UPDATE submissions s
SET data = replace(s.data::text, m.old_policy_number, m.new_policy_number)::jsonb
FROM policy_number_migration_map m
WHERE s.client_id = m.client_id
  AND s.data::text LIKE '%' || m.old_policy_number || '%';

-- Some audit descriptions include the identifier as readable text.
UPDATE audits a
SET activity_description = replace(a.activity_description, m.old_policy_number, m.new_policy_number)
FROM policy_number_migration_map m
WHERE a.client_id = m.client_id
  AND a.activity_description LIKE '%' || m.old_policy_number || '%';

COMMIT;
