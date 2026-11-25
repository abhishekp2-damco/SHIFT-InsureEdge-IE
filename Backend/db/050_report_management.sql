-- Report Management module (PRD 2026-10-16 / backend PRD 2026-10-21).
-- Additive and idempotent: no existing table or production row is modified or removed.
BEGIN;

CREATE TABLE IF NOT EXISTS report_group (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS report_item (
  id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL REFERENCES report_group(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL UNIQUE, label VARCHAR(160) NOT NULL, page_title VARCHAR(180) NOT NULL,
  item_type VARCHAR(20) NOT NULL, role_visibility VARCHAR(20) NOT NULL DEFAULT 'All', sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS report_card (
  id BIGSERIAL PRIMARY KEY, item_id BIGINT NOT NULL REFERENCES report_item(id) ON DELETE CASCADE,
  report_code VARCHAR(60) NOT NULL UNIQUE, title VARCHAR(180) NOT NULL, description TEXT NOT NULL,
  default_report_name VARCHAR(180) NOT NULL, is_implemented BOOLEAN NOT NULL DEFAULT FALSE, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stored_report_file (
  id BIGSERIAL PRIMARY KEY, file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(150) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0, content BYTEA NULL, created_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS report_file (
  id BIGSERIAL PRIMARY KEY, item_id BIGINT NOT NULL REFERENCES report_item(id), client_id BIGINT NOT NULL,
  intermediary_id BIGINT NULL, producer_id BIGINT NULL, report_name VARCHAR(255) NOT NULL,
  reporting_period DATE NOT NULL, issuing_carrier VARCHAR(200) NULL, created_on TIMESTAMPTZ NOT NULL,
  stored_file_id BIGINT NULL REFERENCES stored_report_file(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_report_file_scope_period ON report_file(client_id,item_id,reporting_period);
CREATE TABLE IF NOT EXISTS report_definition (
  id BIGSERIAL PRIMARY KEY, card_id BIGINT NOT NULL REFERENCES report_card(id), client_id BIGINT NOT NULL,
  intermediary_id BIGINT NULL, producer_id BIGINT NULL, report_name VARCHAR(180) NOT NULL,
  date_criteria VARCHAR(40) NULL, period_from DATE NULL, period_to DATE NULL, filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT NOT NULL, created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by BIGINT NULL,
  updated_on TIMESTAMPTZ NULL, status VARCHAR(20) NOT NULL DEFAULT 'Active'
);
CREATE INDEX IF NOT EXISTS ix_report_definition_scope ON report_definition(client_id,card_id,status);
CREATE TABLE IF NOT EXISTS report_schedule (
  id BIGSERIAL PRIMARY KEY, definition_id BIGINT NOT NULL UNIQUE REFERENCES report_definition(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL, frequency VARCHAR(20) NULL, scheduled_date DATE NOT NULL,
  start_date DATE NULL, end_date DATE NULL, delivery_method VARCHAR(20) NOT NULL DEFAULT 'Email',
  recipients TEXT NOT NULL, next_run_date DATE NOT NULL, last_run_on TIMESTAMPTZ NULL, status VARCHAR(20) NOT NULL DEFAULT 'Active'
);
CREATE INDEX IF NOT EXISTS ix_report_schedule_due ON report_schedule(status,next_run_date);
CREATE TABLE IF NOT EXISTS generated_report (
  id BIGSERIAL PRIMARY KEY, definition_id BIGINT NULL REFERENCES report_definition(id) ON DELETE SET NULL,
  card_id BIGINT NOT NULL REFERENCES report_card(id), client_id BIGINT NOT NULL, intermediary_id BIGINT NULL,
  producer_id BIGINT NULL, run_by BIGINT NOT NULL, created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_scheduled BOOLEAN NOT NULL DEFAULT FALSE, stored_file_id BIGINT NOT NULL REFERENCES stored_report_file(id), row_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_generated_report_scope ON generated_report(client_id,card_id,created_on DESC);
CREATE TABLE IF NOT EXISTS report_recent_activity (
  id BIGSERIAL PRIMARY KEY, client_id BIGINT NOT NULL, user_id BIGINT NOT NULL, action VARCHAR(20) NOT NULL,
  target_type VARCHAR(30) NOT NULL, target_id BIGINT NOT NULL, target_name VARCHAR(255) NOT NULL,
  occurred_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_report_recent_activity_user ON report_recent_activity(client_id,user_id,occurred_on DESC);
CREATE TABLE IF NOT EXISTS report_run_log (
  id BIGSERIAL PRIMARY KEY, definition_id BIGINT NOT NULL, started_on TIMESTAMPTZ NOT NULL,
  ended_on TIMESTAMPTZ NULL, status VARCHAR(20) NOT NULL, error TEXT NULL, generated_report_id BIGINT NULL
);
CREATE INDEX IF NOT EXISTS ix_report_run_log_definition ON report_run_log(definition_id,started_on DESC);

INSERT INTO report_group(name,sort_order) VALUES ('Bordereaux',1),('Claims',2),('Policy',3),('Commissions',4)
ON CONFLICT(name) DO UPDATE SET sort_order=EXCLUDED.sort_order;

INSERT INTO report_item(group_id,code,label,page_title,item_type,role_visibility,sort_order)
SELECT g.id,v.code,v.label,v.title,v.kind,v.roles,v.ord FROM report_group g JOIN (VALUES
('Bordereaux','MGA_TO_ISSUER','MGA to Issuer','Bordereaux - MGA to Issuer','FileList','All',1),
('Claims','CLAIMS_MANAGEMENT','Claims Management Reports','Claim- Claims Management Report','Catalog','All',1),
('Claims','CLAIM_FINANCIAL','Claim Financial Reports','Claim- Claim Financial Reports','Catalog','All',2),
('Claims','LOSS_EXPOSURE','Loss & Exposure Reports','Claim- Loss & Exposure Reports','Catalog','All',3),
('Claims','COMPLIANCE_REGULATORY','Compliance / Regulatory Reports','Claim- Compliance / Regulatory Reports','Catalog','All',4),
('Claims','REINSURANCE_CATASTROPHE','Reinsurance / Catastrophe Reports','Claim- Reinsurance / Catastrophe Reports','Catalog','All',5),
('Policy','NB_ISSUANCE','New Business Issuance','New Business Issuance','FileList','All',1),
('Policy','NB_PREMIUM','New Business Premium','New Business Premium','FileList','All',2),
('Policy','NUMBER_OF_POLICIES','No. of Policies by Transaction Type','Number of Policies','FileList','All',3),
('Commissions','ALL_BROKERAGE','All Brokerage Firms','All Brokerage Firms','FileList','Admin',1),
('Commissions','MY_COMMISSIONS','My Commissions','My Commissions','FileList','Producer',2)
) v(grp,code,label,title,kind,roles,ord) ON g.name=v.grp
ON CONFLICT(code) DO UPDATE SET label=EXCLUDED.label,page_title=EXCLUDED.page_title,item_type=EXCLUDED.item_type,role_visibility=EXCLUDED.role_visibility,sort_order=EXCLUDED.sort_order;

INSERT INTO report_card(item_id,report_code,title,description,default_report_name,is_implemented,sort_order)
SELECT i.id,v.code,v.title,v.description,v.default_name,v.built,v.ord FROM report_item i JOIN (VALUES
('CLAIMS_MANAGEMENT','CLAIMS_REPORTS','Claims Reports','Lists all claims registered in the system within a selected period along with key claim, policy, and financial details.','Claims Reports',false,1),
('CLAIMS_MANAGEMENT','CLAIM_REGISTER','Claim Register Report','Lists all claims registered in the system within a selected period along with key claim, policy, and financial details.','Claim Register Report',true,2),
('CLAIMS_MANAGEMENT','CLAIMS_AGING','Claims Aging Report','Shows how long claims have remained open, grouped into aging buckets to identify backlogs and delays.','Claims Aging Report',false,3),
('CLAIMS_MANAGEMENT','CLAIMS_BY_ADJUSTER','Claims by Adjuster / Claim Handler','Displays claims assigned to each adjuster to measure workload distribution and individual performance.','Claims by Adjuster / Claim Handler',false,4),
('CLAIMS_MANAGEMENT','CLAIMS_BY_LOB','Claims by Line of Business / Coverage','Analyzes claims volume and cost by product line or coverage type to identify loss trends.','Claims by Line of Business / Coverage',false,5),
('CLAIMS_MANAGEMENT','CLAIMS_INCURRED_PAID','Claims Incurred vs Paid','Compares total incurred losses against amounts paid to track outstanding exposure and settlement progress.','Claims Incurred vs Paid',false,6),
('CLAIM_FINANCIAL','PAID_CLAIMS','Paid Claims Summary','Summarizes all claim payments made during a period, including payment type, amount, and payee.','Paid Claim Summary',true,1),
('CLAIM_FINANCIAL','OUTSTANDING_RESERVES','Outstanding Reserves Report','Shows unpaid claim reserves to assess current and future financial exposure.','Outstanding Reserve Report',true,2),
('CLAIM_FINANCIAL','PAYEE_REGISTER','Claims Payee Register','Lists all payees associated with claims along with payment and banking details.','Claim Payee Register',true,3),
('CLAIM_FINANCIAL','RECOVERIES_SUMMARY','Recoveries Summary','Tracks amounts recovered through salvage and subrogation against paid claims.','Recoveries Summary',true,4),
('CLAIM_FINANCIAL','EXPENSE_VS_INDEMNITY','Claim Expense vs Indemnity','Compares claim handling expenses with indemnity payments to evaluate cost efficiency.','Claim Expense vs Indemnity',false,5),
('CLAIM_FINANCIAL','CLAIM_EXPENSE','Claim Expense Report','Provides detailed information on claim-related expenses such as legal, investigation, and service fees.','Claim Expense Report',false,6),
('LOSS_EXPOSURE','LOSS_EXPOSURE_REPORTS','Loss & Exposure Reports','Analyze claim frequency, severity, and exposure to support risk assessment and underwriting decisions.','Loss & Exposure Reports',false,1),
('LOSS_EXPOSURE','LOSS_RATIO','Loss Ratio Report','Measures claim losses against earned premium to assess product and portfolio profitability.','Loss Ratio Report',false,2),
('LOSS_EXPOSURE','CLAIMS_BY_CAUSE','Claims by Cause of Loss','Breaks down claims by loss cause to identify major drivers of claim frequency and severity.','Claims by Cause of Loss',false,3),
('COMPLIANCE_REGULATORY','CLOSED_CLAIMS_COMPLIANCE','Closed Claims Compliance Report','Support regulatory filing, audit requirements, and adherence to statutory and internal controls.','Closed Claims Compliance Report',false,1),
('COMPLIANCE_REGULATORY','CLAIMS_AUDIT_TRAIL','Claims Audit Trail','Records all changes and actions performed on a claim for audit, compliance, and security purposes.','Claims Audit Trail',false,2),
('REINSURANCE_CATASTROPHE','CATASTROPHE_CLAIMS','Catastrophe Claims Report','Summarizes claims arising from catastrophic events such as floods, earthquakes, or storms.','Catastrophe Claims Report',false,1),
('REINSURANCE_CATASTROPHE','REINSURANCE_BORDEREAUX','Reinsurance Bordereaux (Claims)','Details claim information and financial amounts reported to reinsurers under reinsurance treaties.','Reinsurance Bordereaux (Claims)',false,2),
('REINSURANCE_CATASTROPHE','CLAIMS_EXCEEDING_RETENTION','Claims Exceeding Retention','Identifies claims where losses exceed the insurer''s retention and trigger reinsurance coverage.','Claims Exceeding Retention',false,3)
) v(item_code,code,title,description,default_name,built,ord) ON i.code=v.item_code
ON CONFLICT(report_code) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,default_report_name=EXCLUDED.default_report_name,is_implemented=EXCLUDED.is_implemented,sort_order=EXCLUDED.sort_order;

-- Safe local/demo file-list seed. Existing matching rows are left untouched.
DO $$
DECLARE cid BIGINT; iid BIGINT; pid BIGINT; month_start DATE; item_code TEXT; v_item_id BIGINT; v_report_name TEXT;
BEGIN
  SELECT id INTO cid FROM client ORDER BY id LIMIT 1;
  IF cid IS NULL THEN RETURN; END IF;
  SELECT id INTO iid FROM intermediary WHERE client_id=cid ORDER BY id LIMIT 1;
  SELECT id INTO pid FROM producer WHERE client_id=cid ORDER BY id LIMIT 1;
  FOREACH item_code IN ARRAY ARRAY['MGA_TO_ISSUER','NB_ISSUANCE','NB_PREMIUM','NUMBER_OF_POLICIES','ALL_BROKERAGE','MY_COMMISSIONS'] LOOP
    SELECT id INTO v_item_id FROM report_item WHERE code=item_code;
    FOR month_start IN SELECT generate_series(DATE '2026-01-01',DATE '2026-09-01',INTERVAL '1 month')::date LOOP
      v_report_name := CASE item_code
        WHEN 'MGA_TO_ISSUER' THEN 'MGA to Issuer_'||to_char(month_start,'Mon YYYY')
        WHEN 'NB_ISSUANCE' THEN 'New Business Issuance_ '||to_char(month_start,'Mon YYYY')||'.xlsx'
        WHEN 'NB_PREMIUM' THEN 'New Business Premium_ '||to_char(month_start,'Mon YYYY')||'.xlsx'
        WHEN 'NUMBER_OF_POLICIES' THEN 'Number of Policies by Transaction_'||to_char(month_start,'Mon YYYY')||'.xlsx'
        WHEN 'ALL_BROKERAGE' THEN to_char(month_start,'Mon-YYYY')||'_All Brokerage Firms.xlsx'
        ELSE to_char(month_start,'Mon-YYYY')||'_'||COALESCE((SELECT intermediary_name FROM intermediary WHERE id=iid),'My Brokerage')||'.xlsx' END;
      IF NOT EXISTS(SELECT 1 FROM report_file rf WHERE rf.client_id=cid AND rf.item_id=v_item_id AND rf.reporting_period=month_start AND rf.report_name=v_report_name) THEN
        INSERT INTO report_file(item_id,client_id,intermediary_id,producer_id,report_name,reporting_period,issuing_carrier,created_on)
        VALUES(v_item_id,cid,CASE WHEN item_code IN('MY_COMMISSIONS','NB_ISSUANCE','NB_PREMIUM','NUMBER_OF_POLICIES') THEN iid END,
          CASE WHEN item_code IN('NB_ISSUANCE','NB_PREMIUM','NUMBER_OF_POLICIES') THEN pid END,v_report_name,month_start,
          CASE WHEN item_code='MGA_TO_ISSUER' THEN 'Sierra Specialty Insurance Company' END,(month_start+INTERVAL '1 month'));
      END IF;
    END LOOP;
  END LOOP;
  SELECT id INTO v_item_id FROM report_item WHERE code='MGA_TO_ISSUER';
  IF NOT EXISTS(SELECT 1 FROM report_file rf WHERE rf.client_id=cid AND rf.item_id=v_item_id AND rf.reporting_period=DATE '2025-12-01') THEN
    INSERT INTO report_file(item_id,client_id,report_name,reporting_period,issuing_carrier,created_on)
    VALUES(v_item_id,cid,'MGA to Issuer_Dec 2025',DATE '2025-12-01','Sierra Specialty Insurance Company',TIMESTAMPTZ '2026-01-01 00:00:00Z');
  END IF;
END $$;

COMMIT;
