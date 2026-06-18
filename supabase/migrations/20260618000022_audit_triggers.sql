-- M-022: audit_log trigger function + triggers on all business tables
-- ADR-005: DB trigger guarantees audit coverage regardless of application code path.
-- The trigger uses SECURITY DEFINER to write to audit_log as the trigger owner (bypasses RLS).
-- A WHEN OTHERS exception guard ensures audit failure never blocks the business operation.

-- ─── Audit trigger function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data   JSONB;
  v_new_data   JSONB;
  v_delta      JSONB;
  v_event_type text;
  v_org_id     uuid;
  v_record_id  uuid;
BEGIN
  -- Serialize old and new rows
  IF TG_OP = 'DELETE' THEN
    v_old_data   := to_jsonb(OLD);
    v_event_type := 'data_delete';
  ELSIF TG_OP = 'INSERT' THEN
    v_new_data   := to_jsonb(NEW);
    v_event_type := 'data_insert';
  ELSE -- UPDATE
    v_old_data   := to_jsonb(OLD);
    v_new_data   := to_jsonb(NEW);
    v_event_type := 'data_update';
    -- Delta: only keys whose value changed
    SELECT jsonb_object_agg(n.key, n.value)
    INTO   v_delta
    FROM   jsonb_each(v_new_data) AS n
    WHERE  NOT (v_old_data ? n.key AND v_old_data -> n.key = n.value);
  END IF;

  -- Extract organization_id and record_id from JSONB
  -- organizations table uses id as the org identifier (has no organization_id column)
  IF TG_TABLE_NAME = 'organizations' THEN
    v_org_id := CASE TG_OP WHEN 'DELETE'
                  THEN (v_old_data ->>'id')::uuid
                  ELSE (v_new_data ->>'id')::uuid END;
  ELSE
    v_org_id := CASE TG_OP WHEN 'DELETE'
                  THEN (v_old_data ->>'organization_id')::uuid
                  ELSE (v_new_data ->>'organization_id')::uuid END;
  END IF;

  v_record_id := CASE TG_OP WHEN 'DELETE'
                   THEN (v_old_data ->>'id')::uuid
                   ELSE (v_new_data ->>'id')::uuid END;

  INSERT INTO audit_log (
    organization_id,
    event_type,
    event_category,
    table_name,
    record_id,
    performed_by,
    performed_at,
    old_values,
    new_values,
    change_delta
  ) VALUES (
    v_org_id,
    v_event_type,
    'data',
    TG_TABLE_NAME,
    v_record_id,
    auth.uid(),    -- NULL for service-role / background operations
    now(),
    v_old_data,
    v_new_data,
    v_delta
  );

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  -- Audit failure must never block the business operation.
  RAISE WARNING 'audit_log_trigger: failed for table=% op=% error=%',
                TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION audit_log_trigger() IS
  'Generic AFTER INSERT/UPDATE/DELETE trigger that writes to audit_log. SECURITY DEFINER bypasses RLS on audit_log. Failure never blocks the business operation.';

-- ─── Apply trigger to all business tables ─────────────────────────────────────

CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_families
  AFTER INSERT OR UPDATE OR DELETE ON families
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_subfamilies
  AFTER INSERT OR UPDATE OR DELETE ON subfamilies
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_skus
  AFTER INSERT OR UPDATE OR DELETE ON skus
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_supplier_prices
  AFTER INSERT OR UPDATE OR DELETE ON supplier_prices
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_virtual_components
  AFTER INSERT OR UPDATE OR DELETE ON virtual_components
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_sites
  AFTER INSERT OR UPDATE OR DELETE ON sites
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_warehouses
  AFTER INSERT OR UPDATE OR DELETE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_cost_sets
  AFTER INSERT OR UPDATE OR DELETE ON cost_sets
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_cost_items
  AFTER INSERT OR UPDATE OR DELETE ON cost_items
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_cost_rules
  AFTER INSERT OR UPDATE OR DELETE ON cost_rules
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_rule_conditions
  AFTER INSERT OR UPDATE OR DELETE ON rule_conditions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_rule_actions
  AFTER INSERT OR UPDATE OR DELETE ON rule_actions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_rule_exceptions
  AFTER INSERT OR UPDATE OR DELETE ON rule_exceptions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_manual_cost_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON manual_cost_adjustments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_boms
  AFTER INSERT OR UPDATE OR DELETE ON boms
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_bom_versions
  AFTER INSERT OR UPDATE OR DELETE ON bom_versions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_bom_lines
  AFTER INSERT OR UPDATE OR DELETE ON bom_lines
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_inventory_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON inventory_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_inventory_lines
  AFTER INSERT OR UPDATE OR DELETE ON inventory_lines
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Explainability, validation, and audit_log tables are excluded from trigger coverage:
-- - They are written by the engine/system (not user mutations)
-- - Triggering on audit_log itself would cause recursive logging
-- - Calculation/validation tables are immutable by design
