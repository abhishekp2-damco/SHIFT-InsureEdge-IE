-- AI_GENERATED | HUMAN_VALIDATION_REQUIRED
-- QA IP-17 / IP-28: binding a quote now records a Policy History / Timeline event, and
-- policy_transaction.transaction_type must reference a row here. Idempotent.

INSERT INTO policy_transaction_type (code, label)
SELECT 'Bound', 'Bound'
WHERE NOT EXISTS (SELECT 1 FROM policy_transaction_type WHERE code = 'Bound');
