-- Align Group Rights module cards with the IE US H&B OutSystems navigation order.
-- Ancillary modules remain available after the eight primary navigation modules.
-- Idempotent: safe to run more than once.

UPDATE module
SET sort_order = CASE module_name
  WHEN 'Dashboard'                     THEN 1
  WHEN 'Quotes & Policies'             THEN 2
  WHEN 'Claims'                        THEN 3
  WHEN 'User Management'               THEN 4
  WHEN 'User Groups Management'        THEN 5
  WHEN 'Distribution Management'       THEN 6
  WHEN 'Billing Management'            THEN 7
  WHEN 'Report Management'             THEN 8
  WHEN 'Client Management'             THEN 9
  WHEN 'Accounts Maintenance'          THEN 10
  WHEN 'Insurance Product Maintenance' THEN 11
  WHEN 'Document Management'           THEN 12
  ELSE sort_order
END
WHERE module_name IN (
  'Dashboard', 'Quotes & Policies', 'Claims', 'User Management',
  'User Groups Management', 'Distribution Management', 'Billing Management',
  'Report Management', 'Client Management', 'Accounts Maintenance',
  'Insurance Product Maintenance', 'Document Management'
);
