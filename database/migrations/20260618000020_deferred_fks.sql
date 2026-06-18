-- M-020: Deferred FK constraints
-- All FK stubs that could not be created earlier (circular dependencies) are resolved here.
-- All tables referenced by these FKs now exist.

-- ─── inventory_lines.cost_trace_id → calculation_traces ──────────────────────
-- Stub column created in M-016 without FK (calculation_traces did not exist yet).
ALTER TABLE inventory_lines
  ADD CONSTRAINT inventory_lines_cost_trace_id_fkey
  FOREIGN KEY (cost_trace_id) REFERENCES calculation_traces(id);

COMMENT ON COLUMN inventory_lines.cost_trace_id IS
  'FK to calculation_traces.id. Constraint added here in M-020 (deferred from M-016). Links line to its cost derivation.';
