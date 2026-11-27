-- Claims / Claim Letter Templates
-- Idempotent schema required by LetterTemplateRepository.

CREATE TABLE IF NOT EXISTS letter_template (
    id                  bigserial PRIMARY KEY,
    client_id           bigint NOT NULL REFERENCES client(id),
    template_code       varchar(100),
    status              varchar(50),
    current_version     varchar(50),
    template_name       varchar(500),
    template_category   varchar(200),
    insurance_type      varchar(200),
    line_of_business    varchar(200),
    subject_line        varchar(500),
    description         text,
    created_on          timestamptz,
    created_by          bigint REFERENCES "user"(id),
    updated_on          timestamptz,
    updated_by          bigint REFERENCES "user"(id)
);

CREATE INDEX IF NOT EXISTS idx_letter_template_client_id
    ON letter_template(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_letter_template_client_code
    ON letter_template(client_id, template_code)
    WHERE template_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS letter_template_document (
    id                    bigserial PRIMARY KEY,
    template_id           bigint NOT NULL REFERENCES letter_template(id) ON DELETE CASCADE,
    document_name         varchar(500),
    document_file         varchar(500),
    document_content      text,
    version               varchar(50),
    effective_start_date  date,
    effective_end_date    date,
    created_by            bigint REFERENCES "user"(id),
    created_on            timestamptz,
    updated_by            bigint REFERENCES "user"(id),
    updated_on            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_letter_template_document_template_id
    ON letter_template_document(template_id);

CREATE TABLE IF NOT EXISTS letter_template_state (
    id            bigserial PRIMARY KEY,
    template_id   bigint NOT NULL REFERENCES letter_template(id) ON DELETE CASCADE,
    state         varchar(100)
);

CREATE INDEX IF NOT EXISTS idx_letter_template_state_template_id
    ON letter_template_state(template_id);
