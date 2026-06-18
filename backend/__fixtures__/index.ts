// Shared test fixtures — deterministic UUIDs for repeatable tests
export const IDS = {
  org:        'org-00000000-0000-0000-0000-000000000001',
  family:     {
    window:   'fam-00000000-0000-0000-0000-000000000001',
    door:     'fam-00000000-0000-0000-0000-000000000002',
    profile:  'fam-00000000-0000-0000-0000-000000000003',
    glass:    'fam-00000000-0000-0000-0000-000000000004',
  },
  subfamily:  {
    pvc:      'sub-00000000-0000-0000-0000-000000000001',
    alum:     'sub-00000000-0000-0000-0000-000000000002',
  },
  sku:        {
    frame:    'sku-00000000-0000-0000-0000-000000000001',
    glass:    'sku-00000000-0000-0000-0000-000000000002',
    seal:     'sku-00000000-0000-0000-0000-000000000003',
    assembly: 'sku-00000000-0000-0000-0000-000000000004',
    window:   'sku-00000000-0000-0000-0000-000000000005',
  },
  bom:        {
    window:   'bom-00000000-0000-0000-0000-000000000001',
    assembly: 'bom-00000000-0000-0000-0000-000000000002',
  },
  bomVersion: {
    window:   'bmv-00000000-0000-0000-0000-000000000001',
    assembly: 'bmv-00000000-0000-0000-0000-000000000002',
  },
  bomLine:    {
    frame:    'bln-00000000-0000-0000-0000-000000000001',
    glass:    'bln-00000000-0000-0000-0000-000000000002',
    seal:     'bln-00000000-0000-0000-0000-000000000003',
    assembly: 'bln-00000000-0000-0000-0000-000000000004',
  },
  costSet:    {
    siteA:    'cst-00000000-0000-0000-0000-000000000001',
    siteB:    'cst-00000000-0000-0000-0000-000000000002',
  },
  rule:       {
    familyMark: 'rul-00000000-0000-0000-0000-000000000001',
    capValue:   'rul-00000000-0000-0000-0000-000000000002',
  },
  snapshot:   {
    q1:       'snp-00000000-0000-0000-0000-000000000001',
  },
  warehouse:  {
    berlin:   'whs-00000000-0000-0000-0000-000000000001',
    munich:   'whs-00000000-0000-0000-0000-000000000002',
  },
}

export function makeSku(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.sku.frame,
    organization_id: IDS.org,
    part_number: 'WND-FRAME-001',
    name: 'Window Frame PVC 80mm',
    description: null as string | null,
    item_type: 'sub_assembly' as const,
    make_buy: 'make' as const,
    unit_of_measure: 'pcs',
    family_id: IDS.family.window as string | null,
    subfamily_id: IDS.subfamily.pvc as string | null,
    default_supplier_id: null as string | null,
    lead_time_days: 14 as number | null,
    is_regulated: false,
    status: 'active' as const,
    notes: null as string | null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: null as string | null,
    updated_by: null as string | null,
    ...overrides,
  }
}

export function makeCondition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cnd-001',
    organization_id: IDS.org,
    cost_rule_id: IDS.rule.familyMark,
    condition_field: 'sku.family_id',
    condition_operator: 'equals' as const,
    condition_value: IDS.family.window,
    logical_group: 1,
    created_by: 'user-test',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-001',
    action_type: 'add_percentage' as const,
    action_value: 10 as number | null,
    ...overrides,
  }
}

export function makeBomLine(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.bomLine.frame,
    organization_id: IDS.org,
    bom_version_id: IDS.bomVersion.window,
    parent_line_id: null as string | null,
    position: 1,
    depth: 1,
    sku_id: IDS.sku.frame as string | null,
    virtual_component_id: null as string | null,
    quantity: 1,
    unit_of_measure: 'pcs',
    reference_designator: null as string | null,
    notes: null as string | null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: null as string | null,
    updated_by: null as string | null,
    ...overrides,
  }
}

export function makeException(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exc-001',
    organization_id: IDS.org,
    cost_rule_id: IDS.rule.familyMark,
    exception_scope_type: 'sku' as const,
    exception_scope_id: IDS.sku.frame,
    exception_type: 'skip_rule' as const,
    override_value: null,
    override_value_currency: null,
    business_justification: 'Test exception',
    status: 'active' as const,
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    effective_from: '2024-01-01',
    effective_to: null,
    requested_by: 'user-test',
    created_by: 'user-test',
    created_at: '2024-01-01T00:00:00Z',
    updated_by: 'user-test',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}
