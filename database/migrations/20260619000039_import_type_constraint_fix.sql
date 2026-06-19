-- M-039: Extend import_jobs_import_type_check to include price_list and purchase_history
--
-- Root cause: M-031 introduced the price_list import flow and M-036 introduced
-- purchase_history, but neither migration updated this constraint. Any attempt to
-- start a Price List or Purchase History import creates an import_jobs row that
-- immediately violates the constraint, crashing the Import Center at the mapping step.
--
-- Pattern mirrors M-028 (which correctly extended import_jobs_status_check).
-- Additive, backward compatible, idempotent (DROP IF EXISTS then re-add).

ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_import_type_check;

ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_import_type_check
  CHECK (import_type IN (
    'sku_master',
    'bom_lines',
    'costs',
    'inventory_snapshot',
    'supplier_prices',
    'suppliers',
    'sites',
    'warehouses',
    'cost_rules',
    'rule_exceptions',
    'virtual_components',
    'price_list',
    'purchase_history'
  ));
