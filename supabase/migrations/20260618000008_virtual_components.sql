-- M-008: virtual_components
-- Non-physical cost elements: regulatory amortization, packaging, scrap factors, tooling.
-- Without virtual components, these costs are hidden in component prices (non-auditable).
-- Virtual components make them explicit, line-by-line traceable, and reportable.

CREATE TABLE virtual_components (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL,
  code              text        NOT NULL,
  name              text        NOT NULL,
  description       text        NOT NULL,
  cost_type         text        NOT NULL,
  default_value     numeric     NULL,
  default_currency  text        NULL,
  status            text        NOT NULL DEFAULT 'active',
  notes             text        NULL,
  created_by        uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT virtual_components_pkey
    PRIMARY KEY (id),
  CONSTRAINT virtual_components_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT virtual_components_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT virtual_components_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT virtual_components_org_code_key
    UNIQUE (organization_id, code),
  CONSTRAINT virtual_components_cost_type_check
    CHECK (cost_type IN (
      'fixed_per_unit',
      'percentage_of_material',
      'percentage_of_bom_total',
      'percentage_of_labor'
    )),
  CONSTRAINT virtual_components_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT virtual_components_default_currency_check
    CHECK (default_currency IS NULL OR char_length(default_currency) = 3),
  CONSTRAINT virtual_components_description_check
    CHECK (char_length(trim(description)) > 0)
);

CREATE TRIGGER trg_virtual_components_updated_at
  BEFORE UPDATE ON virtual_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE virtual_components IS
  'Non-physical cost elements: packaging, CE marking amortization, scrap factors, tooling. Required for Explainability First.';
COMMENT ON COLUMN virtual_components.description IS
  'Business justification is required (non-empty) — explains why this virtual cost exists.';
COMMENT ON COLUMN virtual_components.default_value IS
  'Default rate/amount. Overridden by a cost_item with scope_type=virtual_component in an active cost set.';
COMMENT ON COLUMN virtual_components.cost_type IS
  'How the cost is calculated: fixed_per_unit | percentage_of_material | percentage_of_bom_total | percentage_of_labor';
