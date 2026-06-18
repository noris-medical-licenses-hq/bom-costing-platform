// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Run: npm run db:generate-types
// This file will be regenerated after `supabase db push` succeeds.
//
// Until Supabase is provisioned, this file contains the expected shape
// based on DATA_MODEL.md v2.0 (32-table schema).
// Replace this file entirely with the supabase gen types output.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          default_currency: string
          default_cost_set_id: string | null
          status: 'active' | 'suspended' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          email: string
          full_name: string | null
          role: 'viewer' | 'editor' | 'cost_analyst' | 'procurement' | 'approver' | 'admin'
          is_active: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      families: {
        Row: {
          id: string
          organization_id: string
          code: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['families']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['families']['Insert']>
      }
      subfamilies: {
        Row: {
          id: string
          organization_id: string
          family_id: string
          code: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['subfamilies']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['subfamilies']['Insert']>
      }
      suppliers: {
        Row: {
          id: string
          organization_id: string
          name: string
          country: string
          contact_email: string | null
          contact_name: string | null
          status: 'active' | 'inactive' | 'disqualified'
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }
      skus: {
        Row: {
          id: string
          organization_id: string
          part_number: string
          name: string
          description: string | null
          item_type: 'purchased_part' | 'sub_assembly' | 'finished_good' | 'service' | 'virtual'
          make_buy: 'make' | 'buy' | 'make_or_buy'
          unit_of_measure: string
          family_id: string | null
          subfamily_id: string | null
          default_supplier_id: string | null
          lead_time_days: number | null
          is_regulated: boolean
          status: 'draft' | 'active' | 'discontinued' | 'archived'
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['skus']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['skus']['Insert']>
      }
      supplier_prices: {
        Row: {
          id: string
          organization_id: string
          sku_id: string
          supplier_id: string
          unit_price: number
          currency: string
          min_order_qty: number | null
          lead_time_days: number | null
          effective_from: string
          effective_to: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['supplier_prices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['supplier_prices']['Insert']>
      }
      virtual_components: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string
          cost_type: 'fixed_per_unit' | 'percentage_of_material' | 'percentage_of_bom_total' | 'percentage_of_labor'
          default_value: number
          unit_of_measure: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['virtual_components']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['virtual_components']['Insert']>
      }
      boms: {
        Row: {
          id: string
          organization_id: string
          sku_id: string
          description: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['boms']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['boms']['Insert']>
      }
      bom_versions: {
        Row: {
          id: string
          organization_id: string
          bom_id: string
          version_number: number
          status: 'draft' | 'approved' | 'superseded' | 'withdrawn'
          effective_from: string | null
          effective_to: string | null
          notes: string | null
          approved_by: string | null
          approved_at: string | null
          is_locked: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['bom_versions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['bom_versions']['Insert']>
      }
      bom_lines: {
        Row: {
          id: string
          organization_id: string
          bom_version_id: string
          parent_line_id: string | null
          position: number
          depth: number
          sku_id: string | null
          virtual_component_id: string | null
          quantity: number
          unit_of_measure: string
          reference_designator: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['bom_lines']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['bom_lines']['Insert']>
      }
      cost_sets: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          cost_set_type: 'standard' | 'budget' | 'quote' | 'actual' | 'simulation'
          base_currency: string
          status: 'draft' | 'active' | 'archived'
          effective_from: string | null
          effective_to: string | null
          is_locked: boolean
          is_default: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['cost_sets']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['cost_sets']['Insert']>
      }
      cost_items: {
        Row: {
          id: string
          organization_id: string
          cost_set_id: string
          item_type: 'material_price' | 'labor_rate' | 'overhead_pct' | 'freight_pct' | 'duty_rate' | 'tooling_fixed' | 'scrap_rate' | 'custom'
          scope_type: 'global' | 'family' | 'subfamily' | 'sku' | 'supplier' | 'supplier_country' | 'virtual_component'
          scope_id: string | null
          scope_code: string | null
          value: number
          value_unit: 'currency' | 'percentage' | 'rate_per_hour' | 'rate_per_unit'
          currency: string | null
          effective_from: string | null
          effective_to: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['cost_items']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['cost_items']['Insert']>
      }
      manual_cost_adjustments: {
        Row: {
          id: string
          organization_id: string
          sku_id: string
          cost_set_id: string
          bom_version_id: string | null
          adjusted_unit_cost: number
          currency: string
          reason: string
          status: 'pending' | 'approved' | 'rejected' | 'revoked'
          approved_by: string | null
          approved_at: string | null
          valid_from: string | null
          valid_to: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['manual_cost_adjustments']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['manual_cost_adjustments']['Insert']>
      }
      calculation_traces: {
        Row: {
          id: string
          organization_id: string
          sku_id: string
          bom_version_id: string | null
          cost_set_id: string
          triggered_by: string | null
          triggered_at: string
          valuation_date: string | null
          trace_level: 'summary' | 'detailed' | 'full'
          total_unit_cost: number
          currency: string
          warnings: Json | null
        }
        Insert: Omit<Database['public']['Tables']['calculation_traces']['Row'], 'id' | 'triggered_at'>
        Update: never
      }
      validation_runs: {
        Row: {
          id: string
          organization_id: string
          run_type: 'on_demand' | 'pre_calculation' | 'pre_approval' | 'scheduled'
          scope_type: string
          scope_id: string | null
          status: 'running' | 'completed' | 'failed'
          error_count: number
          warning_count: number
          info_count: number
          triggered_by: string | null
          triggered_at: string
          completed_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['validation_runs']['Row'], 'id' | 'triggered_at'>
        Update: Partial<Omit<Database['public']['Tables']['validation_runs']['Row'], 'id'>>
      }
      validation_findings: {
        Row: {
          id: string
          organization_id: string
          validation_run_id: string
          rule_code: string
          severity: 'error' | 'warning' | 'info'
          entity_type: string
          entity_id: string | null
          message: string
          suggested_fix: string | null
          status: 'open' | 'resolved' | 'suppressed'
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['validation_findings']['Row'], 'id' | 'created_at'>
        Update: Partial<Omit<Database['public']['Tables']['validation_findings']['Row'], 'id'>>
      }
      audit_log: {
        Row: {
          id: string
          organization_id: string
          event_type: string
          event_category: 'data' | 'workflow' | 'rule' | 'calculation' | 'valuation' | 'admin'
          table_name: string | null
          record_id: string | null
          performed_by: string | null
          performed_at: string
          old_values: Json | null
          new_values: Json | null
          change_delta: Json | null
          metadata: Json | null
        }
        Insert: never
        Update: never
      }
    }
    Functions: {
      auth_org_id: { Args: Record<never, never>; Returns: string }
      auth_user_role: { Args: Record<never, never>; Returns: string }
      auth_has_role: { Args: { required_roles: string[] }; Returns: boolean }
    }
  }
}

// Convenience type aliases
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
