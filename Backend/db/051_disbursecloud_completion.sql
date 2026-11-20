-- Complete the existing DisburseCloud transaction tracking without duplicating tables.
-- customer_reference_id stores disbursement_uuid; this column stores payee_uuid.
ALTER TABLE commission_payment_transaction
    ADD COLUMN IF NOT EXISTS payee_reference_id varchar(50);

CREATE INDEX IF NOT EXISTS idx_commissionpaytxn_disbursecloud_refs
    ON commission_payment_transaction(customer_reference_id, payee_reference_id)
    WHERE customer_reference_id IS NOT NULL AND payee_reference_id IS NOT NULL;
