-- M-012: cost_rules, rule_conditions, rule_actions, rule_exceptions
-- Rule engine tables. Rules modify cost after the precedence hierarchy resolves a cost.
-- Conditions are AND-combined per logical_group; different groups are OR-combined.
-- OQ-03 resolved: rule_conditions/actions immutability enforced at application layer (not RLS).

-- ─── cost_rules ──────────────────────────────────────────────────────────────

CREATE TABLE cost_rules (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  name                text        NOT NULL,
  description         text        NOT NULL,
  pipeline_stage      text        NOT NULL DEFAULT 'after_cost_resolution',
  priority            integer     NOT NULL,
  cost_set_scope_id   uuid        NULL,
  effective_from      date        NOT NULL,
  effective_to        date        NULL,
  is_active           boolean     NOT NULL DEFAULT false,
  requires_approval   boolean     NOT NULL DEFAULT true,
  approved_by         uuid        NULL,
  approved_at         timestamptz NULL,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid        NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cost_rules_pkey
    PRIMARY KEY (id),
  CONSTRAINT cost_rules_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT cost_rules_cost_set_scope_id_fkey
    FOREIGN KEY (cost_set_scope_id) REFERENCES cost_sets(id),
  CONSTRAINT cost_rules_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT cost_rules_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT cost_rules_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT cost_rules_description_check
    CHECK (char_length(trim(description)) > 0),
  CONSTRAINT cost_rules_priority_check
    CHECK (priority > 0),
  CONSTRAINT cost_rules_pipeline_stage_check
    CHECK (pipeline_stage IN ('after_cost_resolution', 'after_rollup')),
  CONSTRAINT cost_rules_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TRIGGER trg_cost_rules_updated_at
  BEFORE UPDATE ON cost_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE cost_rules IS
  'Business cost policy header. Conditions in rule_conditions; modifications in rule_actions.';
COMMENT ON COLUMN cost_rules.pipeline_stage IS
  'after_cost_resolution: fires per leaf cost. after_rollup: fires on final BOM total.';
COMMENT ON COLUMN cost_rules.is_active IS
  'Starts false. Must be explicitly activated. If requires_approval=true, approved_by must be set first.';
COMMENT ON COLUMN cost_rules.description IS
  'Business justification — non-empty required (C-20). Explains why this rule exists.';

-- ─── rule_conditions ─────────────────────────────────────────────────────────

CREATE TABLE rule_conditions (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,
  cost_rule_id        uuid        NOT NULL,
  condition_field     text        NOT NULL,
  condition_operator  text        NOT NULL,
  condition_value     text        NOT NULL,
  logical_group       integer     NOT NULL DEFAULT 0,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rule_conditions_pkey
    PRIMARY KEY (id),
  CONSTRAINT rule_conditions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT rule_conditions_cost_rule_id_fkey
    FOREIGN KEY (cost_rule_id) REFERENCES cost_rules(id),
  CONSTRAINT rule_conditions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT rule_conditions_condition_operator_check
    CHECK (condition_operator IN (
      'equals', 'not_equals', 'in', 'not_in',
      'greater_than', 'less_than', 'is_null', 'is_not_null'
    ))
);

-- No updated_at: rule_conditions are immutable after the rule is activated (OQ-03: app-layer enforcement).
COMMENT ON TABLE rule_conditions IS
  'One condition that must match for the parent cost_rule to fire. All conditions AND-combined per logical_group.';
COMMENT ON COLUMN rule_conditions.condition_field IS
  'Dot-notation path to evaluated field: sku.family_id | supplier.country | sku.item_type | bom_line.depth | etc.';
COMMENT ON COLUMN rule_conditions.logical_group IS
  'Conditions in same group are ANDed; different groups are ORed. Default 0 = all in same group (AND-all).';

-- ─── rule_actions ─────────────────────────────────────────────────────────────

CREATE TABLE rule_actions (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL,
  cost_rule_id             uuid        NOT NULL,
  action_type              text        NOT NULL,
  action_value             numeric     NULL,
  action_currency          text        NULL,
  applies_to_item_type     text        NULL,
  action_sequence          integer     NOT NULL DEFAULT 1,
  created_by               uuid        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rule_actions_pkey
    PRIMARY KEY (id),
  CONSTRAINT rule_actions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT rule_actions_cost_rule_id_fkey
    FOREIGN KEY (cost_rule_id) REFERENCES cost_rules(id),
  CONSTRAINT rule_actions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT rule_actions_action_type_check
    CHECK (action_type IN (
      'add_percentage', 'add_fixed', 'multiply', 'replace_cost',
      'exclude_from_rollup', 'cap_at_value', 'floor_at_value'
    )),
  CONSTRAINT rule_actions_action_currency_check
    CHECK (action_currency IS NULL OR char_length(action_currency) = 3)
);

-- No updated_at: rule_actions are immutable after the rule is activated (OQ-03: app-layer enforcement).
COMMENT ON TABLE rule_actions IS
  'What a cost_rule does when all conditions match. Multiple actions applied in action_sequence order.';
COMMENT ON COLUMN rule_actions.action_value IS
  'NULL for exclude_from_rollup. Percentage (0-100), multiplier, fixed amount, cap, or floor otherwise.';

-- ─── rule_exceptions ─────────────────────────────────────────────────────────

CREATE TABLE rule_exceptions (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL,
  cost_rule_id             uuid        NOT NULL,
  exception_scope_type     text        NOT NULL,
  exception_scope_id       uuid        NOT NULL,
  exception_type           text        NOT NULL,
  override_value           numeric     NULL,
  override_value_currency  text        NULL,
  business_justification   text        NOT NULL,
  status                   text        NOT NULL DEFAULT 'requested',
  approved_by              uuid        NULL,
  approved_at              timestamptz NULL,
  rejection_reason         text        NULL,
  effective_from           date        NOT NULL,
  effective_to             date        NULL,
  requested_by             uuid        NOT NULL,
  created_by               uuid        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid        NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rule_exceptions_pkey
    PRIMARY KEY (id),
  CONSTRAINT rule_exceptions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT rule_exceptions_cost_rule_id_fkey
    FOREIGN KEY (cost_rule_id) REFERENCES cost_rules(id),
  CONSTRAINT rule_exceptions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT rule_exceptions_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES profiles(id),
  CONSTRAINT rule_exceptions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT rule_exceptions_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT rule_exceptions_justification_check
    CHECK (char_length(trim(business_justification)) > 0),
  CONSTRAINT rule_exceptions_scope_type_check
    CHECK (exception_scope_type IN (
      'sku', 'bom_version', 'family', 'subfamily', 'supplier', 'warehouse', 'project'
    )),
  CONSTRAINT rule_exceptions_exception_type_check
    CHECK (exception_type IN ('skip_rule', 'override_value', 'override_basis')),
  CONSTRAINT rule_exceptions_status_check
    CHECK (status IN ('requested', 'approved', 'active', 'expired', 'rejected')),
  CONSTRAINT rule_exceptions_currency_check
    CHECK (override_value_currency IS NULL OR char_length(override_value_currency) = 3),
  CONSTRAINT rule_exceptions_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TRIGGER trg_rule_exceptions_updated_at
  BEFORE UPDATE ON rule_exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rule_exceptions IS
  'Approved override suppressing or modifying a Cost Rule for a specific scope. Every exception requires approval.';
COMMENT ON COLUMN rule_exceptions.business_justification IS
  'Required non-empty (C-09). Regulatory requirement: every exception must have a documented justification.';
COMMENT ON COLUMN rule_exceptions.exception_scope_id IS
  'Polymorphic FK — target varies by exception_scope_type. Enforced at application layer.';
