-- Policy Information: Organization Name and Doing Business As both accept up
-- to 75 characters. Safe to re-run.
ALTER TABLE account
    ALTER COLUMN legal_business_name TYPE varchar(75),
    ALTER COLUMN doing_business_as TYPE varchar(75);
