// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Run: npm run db:generate-types
// Replace this entire file with the output of `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Relationships: [] satisfies GenericTable constraint from @supabase/supabase-js
// without which client.from().insert() types resolve to never.
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; default_currency: string; default_cost_set_id: string | null; status: 'active' | 'suspended' | 'archived'; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; slug: string; default_currency: string; default_cost_set_id?: string | null; status?: 'active' | 'suspended' | 'archived'; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; slug?: string; default_currency?: string; default_cost_set_id?: string | null; status?: 'active' | 'suspended' | 'archived'; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { id: string; user_id: string; organization_id: string; email: string; full_name: string | null; role: 'viewer' | 'editor' | 'cost_analyst' | 'procurement' | 'approver' | 'admin'; is_active: boolean; last_seen_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; organization_id: string; email: string; full_name?: string | null; role?: 'viewer' | 'editor' | 'cost_analyst' | 'procurement' | 'approver' | 'admin'; is_active?: boolean; last_seen_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; organization_id?: string; email?: string; full_name?: string | null; role?: 'viewer' | 'editor' | 'cost_analyst' | 'procurement' | 'approver' | 'admin'; is_active?: boolean; last_seen_at?: string | null; updated_at?: string }
        Relationships: []
      }
      families: {
        Row: { id: string; organization_id: string; code: string; name: string; description: string | null; is_active: boolean; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; code: string; name: string; description?: string | null; is_active?: boolean; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; code?: string; name?: string; description?: string | null; is_active?: boolean; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      subfamilies: {
        Row: { id: string; organization_id: string; family_id: string; code: string; name: string; description: string | null; is_active: boolean; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; family_id: string; code: string; name: string; description?: string | null; is_active?: boolean; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; family_id?: string; code?: string; name?: string; description?: string | null; is_active?: boolean; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      suppliers: {
        Row: { id: string; organization_id: string; name: string; country: string; contact_email: string | null; contact_name: string | null; status: 'active' | 'inactive' | 'disqualified'; notes: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; name: string; country: string; contact_email?: string | null; contact_name?: string | null; status?: 'active' | 'inactive' | 'disqualified'; notes?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; name?: string; country?: string; contact_email?: string | null; contact_name?: string | null; status?: 'active' | 'inactive' | 'disqualified'; notes?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      skus: {
        Row: { id: string; organization_id: string; part_number: string; name: string; description: string | null; item_type: 'purchased_part' | 'sub_assembly' | 'finished_good' | 'service' | 'virtual'; make_buy: 'make' | 'buy' | 'make_or_buy'; unit_of_measure: string; family_id: string | null; subfamily_id: string | null; default_supplier_id: string | null; lead_time_days: number | null; is_regulated: boolean; status: 'draft' | 'active' | 'discontinued' | 'archived'; notes: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; part_number: string; name: string; description?: string | null; item_type: 'purchased_part' | 'sub_assembly' | 'finished_good' | 'service' | 'virtual'; make_buy: 'make' | 'buy' | 'make_or_buy'; unit_of_measure: string; family_id?: string | null; subfamily_id?: string | null; default_supplier_id?: string | null; lead_time_days?: number | null; is_regulated?: boolean; status?: 'draft' | 'active' | 'discontinued' | 'archived'; notes?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; part_number?: string; name?: string; description?: string | null; item_type?: 'purchased_part' | 'sub_assembly' | 'finished_good' | 'service' | 'virtual'; make_buy?: 'make' | 'buy' | 'make_or_buy'; unit_of_measure?: string; family_id?: string | null; subfamily_id?: string | null; default_supplier_id?: string | null; lead_time_days?: number | null; is_regulated?: boolean; status?: 'draft' | 'active' | 'discontinued' | 'archived'; notes?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      supplier_prices: {
        Row: { id: string; organization_id: string; sku_id: string; supplier_id: string; unit_price: number; currency: string; min_order_qty: number | null; lead_time_days: number | null; effective_from: string; effective_to: string | null; notes: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; sku_id: string; supplier_id: string; unit_price: number; currency: string; min_order_qty?: number | null; lead_time_days?: number | null; effective_from: string; effective_to?: string | null; notes?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; sku_id?: string; supplier_id?: string; unit_price?: number; currency?: string; min_order_qty?: number | null; lead_time_days?: number | null; effective_from?: string; effective_to?: string | null; notes?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      virtual_components: {
        Row: { id: string; organization_id: string; name: string; description: string; cost_type: 'fixed_per_unit' | 'percentage_of_material' | 'percentage_of_bom_total' | 'percentage_of_labor'; default_value: number; unit_of_measure: string | null; is_active: boolean; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; name: string; description: string; cost_type: 'fixed_per_unit' | 'percentage_of_material' | 'percentage_of_bom_total' | 'percentage_of_labor'; default_value: number; unit_of_measure?: string | null; is_active?: boolean; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; name?: string; description?: string; cost_type?: 'fixed_per_unit' | 'percentage_of_material' | 'percentage_of_bom_total' | 'percentage_of_labor'; default_value?: number; unit_of_measure?: string | null; is_active?: boolean; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      boms: {
        Row: { id: string; organization_id: string; sku_id: string; description: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; sku_id: string; description?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; sku_id?: string; description?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      bom_versions: {
        Row: { id: string; organization_id: string; bom_id: string; version_number: number; status: 'draft' | 'approved' | 'superseded' | 'withdrawn'; effective_from: string | null; effective_to: string | null; notes: string | null; approved_by: string | null; approved_at: string | null; is_locked: boolean; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; bom_id: string; version_number: number; status?: 'draft' | 'approved' | 'superseded' | 'withdrawn'; effective_from?: string | null; effective_to?: string | null; notes?: string | null; approved_by?: string | null; approved_at?: string | null; is_locked?: boolean; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; bom_id?: string; version_number?: number; status?: 'draft' | 'approved' | 'superseded' | 'withdrawn'; effective_from?: string | null; effective_to?: string | null; notes?: string | null; approved_by?: string | null; approved_at?: string | null; is_locked?: boolean; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      bom_lines: {
        Row: { id: string; organization_id: string; bom_version_id: string; parent_line_id: string | null; position: number; depth: number; sku_id: string | null; virtual_component_id: string | null; quantity: number; unit_of_measure: string; reference_designator: string | null; notes: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; bom_version_id: string; parent_line_id?: string | null; position: number; depth?: number; sku_id?: string | null; virtual_component_id?: string | null; quantity: number; unit_of_measure: string; reference_designator?: string | null; notes?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; bom_version_id?: string; parent_line_id?: string | null; position?: number; depth?: number; sku_id?: string | null; virtual_component_id?: string | null; quantity?: number; unit_of_measure?: string; reference_designator?: string | null; notes?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      cost_sets: {
        Row: { id: string; organization_id: string; name: string; description: string | null; cost_set_type: 'standard' | 'budget' | 'quote' | 'actual' | 'simulation'; base_currency: string; status: 'draft' | 'active' | 'archived'; effective_from: string | null; effective_to: string | null; is_locked: boolean; is_default: boolean; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; cost_set_type: 'standard' | 'budget' | 'quote' | 'actual' | 'simulation'; base_currency: string; status?: 'draft' | 'active' | 'archived'; effective_from?: string | null; effective_to?: string | null; is_locked?: boolean; is_default?: boolean; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; cost_set_type?: 'standard' | 'budget' | 'quote' | 'actual' | 'simulation'; base_currency?: string; status?: 'draft' | 'active' | 'archived'; effective_from?: string | null; effective_to?: string | null; is_locked?: boolean; is_default?: boolean; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      cost_items: {
        Row: { id: string; organization_id: string; cost_set_id: string; item_type: 'material_price' | 'labor_rate' | 'overhead_pct' | 'freight_pct' | 'duty_rate' | 'tooling_fixed' | 'scrap_rate' | 'custom'; scope_type: 'global' | 'family' | 'subfamily' | 'sku' | 'supplier' | 'supplier_country' | 'virtual_component'; scope_id: string | null; scope_code: string | null; value: number; value_unit: 'currency' | 'percentage' | 'rate_per_hour' | 'rate_per_unit'; currency: string | null; effective_from: string | null; effective_to: string | null; notes: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; cost_set_id: string; item_type: 'material_price' | 'labor_rate' | 'overhead_pct' | 'freight_pct' | 'duty_rate' | 'tooling_fixed' | 'scrap_rate' | 'custom'; scope_type: 'global' | 'family' | 'subfamily' | 'sku' | 'supplier' | 'supplier_country' | 'virtual_component'; scope_id?: string | null; scope_code?: string | null; value: number; value_unit: 'currency' | 'percentage' | 'rate_per_hour' | 'rate_per_unit'; currency?: string | null; effective_from?: string | null; effective_to?: string | null; notes?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; cost_set_id?: string; item_type?: 'material_price' | 'labor_rate' | 'overhead_pct' | 'freight_pct' | 'duty_rate' | 'tooling_fixed' | 'scrap_rate' | 'custom'; scope_type?: 'global' | 'family' | 'subfamily' | 'sku' | 'supplier' | 'supplier_country' | 'virtual_component'; scope_id?: string | null; scope_code?: string | null; value?: number; value_unit?: 'currency' | 'percentage' | 'rate_per_hour' | 'rate_per_unit'; currency?: string | null; effective_from?: string | null; effective_to?: string | null; notes?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      cost_rules: {
        Row: { id: string; organization_id: string; name: string; description: string; pipeline_stage: 'after_cost_resolution' | 'after_rollup'; priority: number; cost_set_scope_id: string | null; effective_from: string; effective_to: string | null; is_active: boolean; requires_approval: boolean; approved_by: string | null; approved_at: string | null; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; name: string; description: string; pipeline_stage?: 'after_cost_resolution' | 'after_rollup'; priority: number; cost_set_scope_id?: string | null; effective_from: string; effective_to?: string | null; is_active?: boolean; requires_approval?: boolean; approved_by?: string | null; approved_at?: string | null; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string; pipeline_stage?: 'after_cost_resolution' | 'after_rollup'; priority?: number; cost_set_scope_id?: string | null; effective_from?: string; effective_to?: string | null; is_active?: boolean; requires_approval?: boolean; approved_by?: string | null; approved_at?: string | null; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      rule_conditions: {
        Row: { id: string; organization_id: string; cost_rule_id: string; condition_field: string; condition_operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'is_null' | 'is_not_null'; condition_value: string; logical_group: number; created_by: string; created_at: string }
        Insert: { id?: string; organization_id: string; cost_rule_id: string; condition_field: string; condition_operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'is_null' | 'is_not_null'; condition_value: string; logical_group?: number; created_by: string; created_at?: string }
        Update: never
        Relationships: []
      }
      rule_actions: {
        Row: { id: string; organization_id: string; cost_rule_id: string; action_type: 'add_percentage' | 'add_fixed' | 'multiply' | 'replace_cost' | 'exclude_from_rollup' | 'cap_at_value' | 'floor_at_value'; action_value: number | null; action_currency: string | null; applies_to_item_type: string | null; action_sequence: number; created_by: string; created_at: string }
        Insert: { id?: string; organization_id: string; cost_rule_id: string; action_type: 'add_percentage' | 'add_fixed' | 'multiply' | 'replace_cost' | 'exclude_from_rollup' | 'cap_at_value' | 'floor_at_value'; action_value?: number | null; action_currency?: string | null; applies_to_item_type?: string | null; action_sequence?: number; created_by: string; created_at?: string }
        Update: never
        Relationships: []
      }
      rule_exceptions: {
        Row: { id: string; organization_id: string; cost_rule_id: string; exception_scope_type: 'sku' | 'bom_version' | 'family' | 'subfamily' | 'supplier' | 'warehouse' | 'project'; exception_scope_id: string; exception_type: 'skip_rule' | 'override_value' | 'override_basis'; override_value: number | null; override_value_currency: string | null; business_justification: string; status: 'requested' | 'approved' | 'active' | 'expired' | 'rejected'; approved_by: string | null; approved_at: string | null; rejection_reason: string | null; effective_from: string; effective_to: string | null; requested_by: string; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; cost_rule_id: string; exception_scope_type: 'sku' | 'bom_version' | 'family' | 'subfamily' | 'supplier' | 'warehouse' | 'project'; exception_scope_id: string; exception_type: 'skip_rule' | 'override_value' | 'override_basis'; override_value?: number | null; override_value_currency?: string | null; business_justification: string; status?: 'requested' | 'approved' | 'active' | 'expired' | 'rejected'; approved_by?: string | null; approved_at?: string | null; rejection_reason?: string | null; effective_from: string; effective_to?: string | null; requested_by: string; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; cost_rule_id?: string; exception_scope_type?: 'sku' | 'bom_version' | 'family' | 'subfamily' | 'supplier' | 'warehouse' | 'project'; exception_scope_id?: string; exception_type?: 'skip_rule' | 'override_value' | 'override_basis'; override_value?: number | null; override_value_currency?: string | null; business_justification?: string; status?: 'requested' | 'approved' | 'active' | 'expired' | 'rejected'; approved_by?: string | null; approved_at?: string | null; rejection_reason?: string | null; effective_from?: string; effective_to?: string | null; requested_by?: string; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      manual_cost_adjustments: {
        Row: { id: string; organization_id: string; sku_id: string; cost_set_id: string; bom_version_id: string | null; adjusted_unit_cost: number; currency: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'revoked'; approved_by: string | null; approved_at: string | null; valid_from: string | null; valid_to: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }
        Insert: { id?: string; organization_id: string; sku_id: string; cost_set_id: string; bom_version_id?: string | null; adjusted_unit_cost: number; currency: string; reason: string; status?: 'pending' | 'approved' | 'rejected' | 'revoked'; approved_by?: string | null; approved_at?: string | null; valid_from?: string | null; valid_to?: string | null; created_at?: string; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Update: { id?: string; organization_id?: string; sku_id?: string; cost_set_id?: string; bom_version_id?: string | null; adjusted_unit_cost?: number; currency?: string; reason?: string; status?: 'pending' | 'approved' | 'rejected' | 'revoked'; approved_by?: string | null; approved_at?: string | null; valid_from?: string | null; valid_to?: string | null; updated_at?: string; created_by?: string | null; updated_by?: string | null }
        Relationships: []
      }
      sites: {
        Row: { id: string; organization_id: string; code: string; name: string; address: string | null; city: string | null; country: string | null; is_active: boolean; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; code: string; name: string; address?: string | null; city?: string | null; country?: string | null; is_active?: boolean; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; code?: string; name?: string; address?: string | null; city?: string | null; country?: string | null; is_active?: boolean; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      warehouses: {
        Row: { id: string; organization_id: string; site_id: string; code: string; name: string; warehouse_type: string; is_active: boolean; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; site_id: string; code: string; name: string; warehouse_type: string; is_active?: boolean; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; site_id?: string; code?: string; name?: string; warehouse_type?: string; is_active?: boolean; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      projects: {
        Row: { id: string; organization_id: string; code: string; name: string; description: string | null; status: 'active' | 'on_hold' | 'completed' | 'cancelled'; project_manager_id: string | null; start_date: string | null; end_date: string | null; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; code: string; name: string; description?: string | null; status?: 'active' | 'on_hold' | 'completed' | 'cancelled'; project_manager_id?: string | null; start_date?: string | null; end_date?: string | null; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; code?: string; name?: string; description?: string | null; status?: 'active' | 'on_hold' | 'completed' | 'cancelled'; project_manager_id?: string | null; start_date?: string | null; end_date?: string | null; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      inventory_snapshots: {
        Row: { id: string; organization_id: string; snapshot_name: string; snapshot_date: string; snapshot_type: 'full' | 'site' | 'warehouse' | 'project'; cost_set_id: string; cost_set_snapshot: Json | null; scope_site_id: string | null; scope_warehouse_id: string | null; scope_project_id: string | null; status: 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived'; total_quantity: number | null; total_value: number | null; base_currency: string; line_count: number | null; missing_cost_count: number | null; notes: string | null; approved_by: string | null; approved_at: string | null; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; snapshot_name: string; snapshot_date: string; snapshot_type: 'full' | 'site' | 'warehouse' | 'project'; cost_set_id: string; cost_set_snapshot?: Json | null; scope_site_id?: string | null; scope_warehouse_id?: string | null; scope_project_id?: string | null; status?: 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived'; total_quantity?: number | null; total_value?: number | null; base_currency: string; line_count?: number | null; missing_cost_count?: number | null; notes?: string | null; approved_by?: string | null; approved_at?: string | null; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; snapshot_name?: string; snapshot_date?: string; snapshot_type?: 'full' | 'site' | 'warehouse' | 'project'; cost_set_id?: string; cost_set_snapshot?: Json | null; scope_site_id?: string | null; scope_warehouse_id?: string | null; scope_project_id?: string | null; status?: 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived'; total_quantity?: number | null; total_value?: number | null; base_currency?: string; line_count?: number | null; missing_cost_count?: number | null; notes?: string | null; approved_by?: string | null; approved_at?: string | null; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      inventory_lines: {
        Row: { id: string; organization_id: string; snapshot_id: string; sku_id: string; warehouse_id: string; quantity: number; unit_cost: number | null; total_value: number | null; currency: string; cost_trace_id: string | null; cost_source: 'cost_set_item' | 'supplier_price' | 'bom_rollup' | 'manual_adjustment' | 'none' | null; bom_version_id: string | null; has_missing_cost: boolean; notes: string | null; created_by: string; created_at: string; updated_by: string; updated_at: string }
        Insert: { id?: string; organization_id: string; snapshot_id: string; sku_id: string; warehouse_id: string; quantity: number; unit_cost?: number | null; total_value?: number | null; currency: string; cost_trace_id?: string | null; cost_source?: 'cost_set_item' | 'supplier_price' | 'bom_rollup' | 'manual_adjustment' | 'none' | null; bom_version_id?: string | null; has_missing_cost?: boolean; notes?: string | null; created_by: string; created_at?: string; updated_by: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; snapshot_id?: string; sku_id?: string; warehouse_id?: string; quantity?: number; unit_cost?: number | null; total_value?: number | null; currency?: string; cost_trace_id?: string | null; cost_source?: 'cost_set_item' | 'supplier_price' | 'bom_rollup' | 'manual_adjustment' | 'none' | null; bom_version_id?: string | null; has_missing_cost?: boolean; notes?: string | null; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      inventory_valuation_results: {
        Row: { id: string; organization_id: string; snapshot_id: string; family_id: string | null; subfamily_id: string | null; warehouse_id: string | null; line_count: number; total_quantity: number; total_value: number; missing_cost_count: number; currency: string; created_at: string }
        Insert: { id?: string; organization_id: string; snapshot_id: string; family_id?: string | null; subfamily_id?: string | null; warehouse_id?: string | null; line_count: number; total_quantity: number; total_value: number; missing_cost_count: number; currency: string; created_at?: string }
        Update: never
        Relationships: []
      }
      calculation_traces: {
        Row: { id: string; organization_id: string; trace_type: 'sku_cost' | 'inventory_line'; sku_id: string; bom_version_id: string | null; cost_set_id: string; valuation_date: string; site_id: string | null; warehouse_id: string | null; project_id: string | null; quantity: number; final_cost: number | null; currency: string; has_warnings: boolean; warning_count: number; missing_cost_count: number; is_complete: boolean; engine_version: string; triggered_by: string; triggered_at: string; duration_ms: number | null; trace_level: 'summary' | 'detailed' | 'full'; created_at: string }
        Insert: { id?: string; organization_id: string; trace_type: 'sku_cost' | 'inventory_line'; sku_id: string; bom_version_id?: string | null; cost_set_id: string; valuation_date: string; site_id?: string | null; warehouse_id?: string | null; project_id?: string | null; quantity?: number; final_cost?: number | null; currency: string; has_warnings?: boolean; warning_count?: number; missing_cost_count?: number; is_complete?: boolean; engine_version: string; triggered_by: string; triggered_at: string; duration_ms?: number | null; trace_level: 'summary' | 'detailed' | 'full'; created_at?: string }
        Update: { is_complete?: boolean; final_cost?: number | null; duration_ms?: number | null; has_warnings?: boolean; warning_count?: number; missing_cost_count?: number }
        Relationships: []
      }
      calculation_trace_lines: {
        Row: { id: string; organization_id: string; trace_id: string; parent_line_id: string | null; bom_line_id: string | null; depth: number; position: number; line_type: 'sku' | 'virtual_component' | 'adjustment' | 'rollup_subtotal'; sku_id: string | null; virtual_component_id: string | null; quantity: number; resolved_unit_cost: number | null; adjusted_unit_cost: number | null; line_total: number | null; cost_source_priority: number | null; cost_source_type: string | null; cost_source_id: string | null; cost_source_table: string | null; is_rolled_up: boolean; has_missing_cost: boolean; is_reference_only: boolean; warnings: Json | null; created_at: string }
        Insert: { id?: string; organization_id: string; trace_id: string; parent_line_id?: string | null; bom_line_id?: string | null; depth?: number; position?: number; line_type: 'sku' | 'virtual_component' | 'adjustment' | 'rollup_subtotal'; sku_id?: string | null; virtual_component_id?: string | null; quantity: number; resolved_unit_cost?: number | null; adjusted_unit_cost?: number | null; line_total?: number | null; cost_source_priority?: number | null; cost_source_type?: string | null; cost_source_id?: string | null; cost_source_table?: string | null; is_rolled_up?: boolean; has_missing_cost?: boolean; is_reference_only?: boolean; warnings?: Json | null; created_at?: string }
        Update: never
        Relationships: []
      }
      rule_execution_traces: {
        Row: { id: string; organization_id: string; trace_id: string; trace_line_id: string; cost_rule_id: string; rule_name_snapshot: string; rule_priority: number; condition_summary: string; condition_result: boolean; was_applied: boolean; suppressed_by_exception_id: string | null; value_before: number | null; value_after: number | null; delta: number | null; created_at: string }
        Insert: { id?: string; organization_id: string; trace_id: string; trace_line_id: string; cost_rule_id: string; rule_name_snapshot: string; rule_priority: number; condition_summary: string; condition_result: boolean; was_applied: boolean; suppressed_by_exception_id?: string | null; value_before?: number | null; value_after?: number | null; delta?: number | null; created_at?: string }
        Update: never
        Relationships: []
      }
      exception_execution_traces: {
        Row: { id: string; organization_id: string; trace_id: string; trace_line_id: string; rule_execution_trace_id: string; rule_exception_id: string; exception_type_snapshot: string; justification_snapshot: string; was_active: boolean; suppression_applied: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; trace_id: string; trace_line_id: string; rule_execution_trace_id: string; rule_exception_id: string; exception_type_snapshot: string; justification_snapshot: string; was_active: boolean; suppression_applied: boolean; created_at?: string }
        Update: never
        Relationships: []
      }
      cost_source_traces: {
        Row: { id: string; organization_id: string; trace_id: string; trace_line_id: string; source_type: 'cost_set_item' | 'supplier_price' | 'manual_adjustment' | 'virtual_component_default' | 'none'; source_record_id: string | null; source_table: string | null; scope_type: string | null; resolved_value: number | null; currency: string | null; priority_level: number | null; was_selected: boolean; rejection_reason: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; trace_id: string; trace_line_id: string; source_type: 'cost_set_item' | 'supplier_price' | 'manual_adjustment' | 'virtual_component_default' | 'none'; source_record_id?: string | null; source_table?: string | null; scope_type?: string | null; resolved_value?: number | null; currency?: string | null; priority_level?: number | null; was_selected: boolean; rejection_reason?: string | null; created_at?: string }
        Update: never
        Relationships: []
      }
      validation_runs: {
        Row: { id: string; organization_id: string; run_type: 'on_demand' | 'pre_calculation' | 'pre_approval' | 'scheduled'; scope_type: string; scope_id: string | null; status: 'running' | 'completed' | 'failed'; error_count: number; warning_count: number; info_count: number; triggered_by: string | null; triggered_at: string; completed_at: string | null }
        Insert: { id?: string; organization_id: string; run_type: 'on_demand' | 'pre_calculation' | 'pre_approval' | 'scheduled'; scope_type: string; scope_id?: string | null; status?: 'running' | 'completed' | 'failed'; error_count?: number; warning_count?: number; info_count?: number; triggered_by?: string | null; triggered_at?: string; completed_at?: string | null }
        Update: { id?: string; organization_id?: string; run_type?: 'on_demand' | 'pre_calculation' | 'pre_approval' | 'scheduled'; scope_type?: string; scope_id?: string | null; status?: 'running' | 'completed' | 'failed'; error_count?: number; warning_count?: number; info_count?: number; triggered_by?: string | null; triggered_at?: string; completed_at?: string | null }
        Relationships: []
      }
      validation_findings: {
        Row: { id: string; organization_id: string; validation_run_id: string; rule_code: string; severity: 'error' | 'warning' | 'info'; entity_type: string; entity_id: string | null; message: string; suggested_fix: string | null; status: 'open' | 'resolved' | 'suppressed'; resolved_at: string | null; resolved_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; validation_run_id: string; rule_code: string; severity: 'error' | 'warning' | 'info'; entity_type: string; entity_id?: string | null; message: string; suggested_fix?: string | null; status?: 'open' | 'resolved' | 'suppressed'; resolved_at?: string | null; resolved_by?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; validation_run_id?: string; rule_code?: string; severity?: 'error' | 'warning' | 'info'; entity_type?: string; entity_id?: string | null; message?: string; suggested_fix?: string | null; status?: 'open' | 'resolved' | 'suppressed'; resolved_at?: string | null; resolved_by?: string | null }
        Relationships: []
      }
      audit_log: {
        Row: { id: string; organization_id: string; event_type: string; event_category: 'data' | 'workflow' | 'rule' | 'calculation' | 'valuation' | 'admin'; table_name: string | null; record_id: string | null; performed_by: string | null; performed_at: string; old_values: Json | null; new_values: Json | null; change_delta: Json | null; metadata: Json | null }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      auth_org_id: { Args: Record<never, never>; Returns: string }
      auth_user_role: { Args: Record<never, never>; Returns: string }
      auth_has_role: { Args: { roles: string[] }; Returns: boolean }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
