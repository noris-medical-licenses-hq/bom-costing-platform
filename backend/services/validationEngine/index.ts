// Validation Engine — orchestrates all validation rules
// Runs independently from the cost engine (ADR-105).
// Called by: cost engine Stage 02, inventory approval, on-demand from API.

import type { SupabaseServerClient } from '../../lib/supabase'
import type { ValidationRunInput, ValidationResult, ValidationFindingInput } from './types'
import {
  createValidationRun,
  completeValidationRun,
  createFindingsBatch,
  autoResolveStaleFindingsForEntities,
} from '../../repositories/validationRepository'

// BOM validators
import { validateBomHasLines } from './rules/bom/V-BOM-001'
import { validateBomLinesReferenceActiveSkus } from './rules/bom/V-BOM-002'
import { validateNoDuplicateBomLines } from './rules/bom/V-BOM-003'
import { validateBomLineQuantities } from './rules/bom/V-BOM-004'
import { validateNoBomCycle } from './rules/bom/V-BOM-005'
import { validateNoBomLinesWithArchivedSkus } from './rules/bom/V-BOM-006'
import { validateSubAssemblyMakeBuy } from './rules/bom/V-BOM-007'
import { validateBomSkuSubfamilies } from './rules/sku/V-SKU-002'
// Cost validators
import { validateCostItemCurrencies } from './rules/cost/V-COST-001'

export async function runValidationEngine(
  input: ValidationRunInput,
  client: SupabaseServerClient
): Promise<ValidationResult> {
  // Create the validation run record
  const { data: { user } } = await client.auth.getUser()
  const orgIdResult = await client.rpc('auth_org_id').maybeSingle()
  const orgId: string = (orgIdResult.data as string | null) ?? ''

  const run = await createValidationRun({
    organization_id: orgId,
    run_type: input.run_type,
    scope_type: input.scope_type,
    scope_id: input.scope_id ?? null,
    status: 'running',
    error_count: 0,
    warning_count: 0,
    info_count: 0,
    triggered_by: user?.id ?? null,
    completed_at: null,
  }, client)

  const allFindings: ValidationFindingInput[] = []

  try {
    // Run validators based on scope
    if (input.scope_type === 'bom_version' && input.scope_id) {
      const bomVersionId = input.scope_id
      const bomFindings = await runBomValidators(bomVersionId, client)
      allFindings.push(...bomFindings)
    }

    if (input.scope_type === 'cost_set' && input.scope_id) {
      const costFindings = await validateCostItemCurrencies(input.scope_id, client)
      allFindings.push(...costFindings)
    }

    // Persist findings
    if (allFindings.length > 0) {
      await createFindingsBatch(
        allFindings.map(f => ({ ...f, organization_id: run.organization_id, validation_run_id: run.id, status: 'open' as const })),
        client
      )
    }

    // Auto-resolve stale findings (OQ-07)
    const activeCodes = [...new Set(allFindings.map(f => f.rule_code))]
    let autoResolvedCount = 0
    if (input.scope_id) {
      autoResolvedCount = await autoResolveStaleFindingsForEntities(
        input.scope_type, [input.scope_id], activeCodes, client
      )
    }

    const errorCount = allFindings.filter(f => f.severity === 'error').length
    const warningCount = allFindings.filter(f => f.severity === 'warning').length
    const infoCount = allFindings.filter(f => f.severity === 'info').length

    await completeValidationRun(run.id, { error_count: errorCount, warning_count: warningCount, info_count: infoCount }, client)

    return { runId: run.id, errorCount, warningCount, infoCount, findings: allFindings, autoResolvedCount }
  } catch (err) {
    await client.from('validation_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
    throw err
  }
}

async function runBomValidators(bomVersionId: string, client: SupabaseServerClient): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []
  const validators = [
    validateBomHasLines,
    validateBomLinesReferenceActiveSkus,
    validateNoDuplicateBomLines,
    validateBomLineQuantities,
    validateNoBomCycle,
    validateNoBomLinesWithArchivedSkus,
    validateSubAssemblyMakeBuy,
    validateBomSkuSubfamilies,
  ]
  for (const validator of validators) {
    findings.push(...await validator(bomVersionId, client))
  }
  return findings
}
