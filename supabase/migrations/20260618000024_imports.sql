-- M-024: Import Center — job tracking, templates, field dictionary
-- Supports CSV/XLSX imports for SKU Master, BOM Lines, Costs, Inventory Snapshot.
-- All tables follow the same org-isolation pattern as the rest of the schema.

-- ─── import_templates (created before import_jobs for the FK) ─────────────────

CREATE TABLE import_templates (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  name             text        NOT NULL,
  import_type      text        NOT NULL,
  active           boolean     NOT NULL DEFAULT true,
  created_by       uuid        REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_templates_pkey
    PRIMARY KEY (id),
  CONSTRAINT import_templates_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ─── import_jobs ──────────────────────────────────────────────────────────────

CREATE TABLE import_jobs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  import_type      text        NOT NULL,
  file_name        text,
  status           text        NOT NULL DEFAULT 'pending',
  total_rows       int         NOT NULL DEFAULT 0,
  valid_rows       int         NOT NULL DEFAULT 0,
  warning_rows     int         NOT NULL DEFAULT 0,
  error_rows       int         NOT NULL DEFAULT 0,
  mapping          jsonb,
  template_id      uuid,
  created_by       uuid        REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  metadata         jsonb,

  CONSTRAINT import_jobs_pkey
    PRIMARY KEY (id),
  CONSTRAINT import_jobs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT import_jobs_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES import_templates(id),
  CONSTRAINT import_jobs_status_check
    CHECK (status IN ('pending', 'validating', 'validated', 'committed', 'failed', 'cancelled')),
  CONSTRAINT import_jobs_import_type_check
    CHECK (import_type IN (
      'sku_master', 'bom_lines', 'costs', 'inventory_snapshot',
      'supplier_prices', 'suppliers', 'sites', 'warehouses',
      'cost_rules', 'rule_exceptions', 'virtual_components'
    ))
);

-- ─── import_template_mappings ─────────────────────────────────────────────────

CREATE TABLE import_template_mappings (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  template_id      uuid        NOT NULL,
  source_column    text        NOT NULL,
  target_field     text        NOT NULL,
  confidence       numeric     NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_template_mappings_pkey
    PRIMARY KEY (id),
  CONSTRAINT import_template_mappings_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES import_templates(id) ON DELETE CASCADE
);

-- ─── import_job_rows ──────────────────────────────────────────────────────────

CREATE TABLE import_job_rows (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  import_job_id    uuid        NOT NULL,
  row_number       int         NOT NULL,
  raw_data         jsonb       NOT NULL,
  mapped_data      jsonb,
  status           text        NOT NULL DEFAULT 'pending',
  errors           jsonb,
  warnings         jsonb,

  CONSTRAINT import_job_rows_pkey
    PRIMARY KEY (id),
  CONSTRAINT import_job_rows_import_job_id_fkey
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
  CONSTRAINT import_job_rows_status_check
    CHECK (status IN ('pending', 'valid', 'warning', 'error', 'committed', 'skipped'))
);

-- ─── import_field_dictionary ──────────────────────────────────────────────────
-- organization_id IS NULL = global defaults; org-specific overrides have a value.

CREATE TABLE import_field_dictionary (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid,
  import_type      text        NOT NULL,
  source_alias     text        NOT NULL,
  target_field     text        NOT NULL,
  confidence       numeric     NOT NULL DEFAULT 1,
  usage_count      int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_field_dictionary_pkey
    PRIMARY KEY (id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS import_jobs_org_idx
  ON import_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_type_idx
  ON import_jobs (organization_id, import_type);
CREATE INDEX IF NOT EXISTS import_templates_org_type_idx
  ON import_templates (organization_id, import_type);
CREATE INDEX IF NOT EXISTS import_template_mappings_template_idx
  ON import_template_mappings (template_id);
CREATE INDEX IF NOT EXISTS import_job_rows_job_idx
  ON import_job_rows (import_job_id, row_number);
CREATE INDEX IF NOT EXISTS import_field_dictionary_type_idx
  ON import_field_dictionary (import_type, source_alias);
