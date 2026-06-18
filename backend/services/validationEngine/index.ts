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
// SKU validators
import { validateSkuPartNumberUnique } from './rules/sku/V-SKU-001'
import { validateBomSkuSubfamilies } from './rules/sku/V-SKU-002'
import { validateNoDiscontinuedSkuInActiveBom } from './rules/sku/V-SKU-003'
import { validateSkuHasActiveCost } from './rules/sku/V-SKU-004'
// Cost validators
import { validateCostItemCurrencies } from './rules/cost/V-COST-001'
import { validateNoCostItemDateOverlap } from './rules/cost/V-COST-002'
import { validateScrapRateRange } from './rules/cost/V-COST-003'
import { validateGlobalOverheadExists } from './rules/cost/V-COST-004'
import { validateSupplierPricesCoveredByCostItems } from './rules/cost/V-COST-005'
// Rule validators
import { validateRuleConditionFields } from './rules/rule/V-RULE-001'
import { validateRuleActionValues } from './rules/rule/V-RULE-002'
import { validateActiveRuleHasConditions } from './rules/rule/V-RULE-003'
import { validateNoStaleExceptions } from './rules/rule/V-RULE-004'
// Inventory validators
import { validateInventorySkusHaveBoms } from './rules/inventory/V-INV-001'
import { validateInventoryLinesHaveCosts } from './rules/inventory/V-INV-002'
import { validateSnapshotTotalNotZero } from './rules/inventory/V-INV-003'
import { validateSnapshotHasNoOpenErrors } from './rules/inventory/V-INV-004'

export async function runValidationEngine(
  input: ValidationRunInput,
  client: SupabaseServerClient
): Promise<ValidationResult> {
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
    if (input.scope_type === 'bom_version' && input.scope_id) {
      allFindings.push(...await runBomValidators(input.scope_id, client))
    }

    if (input.scope_type === 'sku' && input.scope_id) {
      allFindings.push(...await runSkuValidators(input.scope_id, client))
    }

    if (input.scope_type === 'cost_set' && input.scope_id) {
      allFindings.push(...await runCostSetValidators(input.scope_id, client))
    }

    if (input.scope_type === 'rule' && input.scope_id) {
      allFindings.push(...await runRuleValidators(input.scope_id, client))
    }

    if (input.scope_type === 'inventory_snapshot' && input.scope_id) {
      allFindings.push(...await runInventoryValidators(input.scope_id, client))
    }

    if (input.scope_type === 'organization') {
      // Org-wide sweep: not implemented — too broad for on-demand; use scheduled runs
    }

    if (allFindings.length > 0) {
      await createFindingsBatch(
        allFindings.map(f => ({
          ...f,
          organization_id: run.organization_id,
          validation_run_id: run.id,
          status: 'open' as const,
        })),
        client
      )
    }

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
  for (const validator of [
    validateBomHasLines,
    validateBomLinesReferenceActiveSkus,
    validateNoDuplicateBomLines,
    validateBomLineQuantities,
    validateNoBomCycle,
    validateNoBomLinesWithArchivedSkus,
    validateSubAssemblyMakeBuy,
    validateBomSkuSubfamilies,
  ]) {
    findings.push(...await validator(bomVersionId, client))
  }
  return findings
}

async function runSkuValidators(skuId: string, client: SupabaseServerClient): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []
  for (const validator of [
    validateSkuPartNumberUnique,
    validateNoDiscontinuedSkuInActiveBom,
    validateSkuHasActiveCost,
  ]) {
    findings.push(...await validator(skuId, client))
  }
  return findings
}

async function runCostSetValidators(costSetId: string, client: SupabaseServerClient): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []
  for (const validator of [
    validateCostItemCurrencies,
    validateNoCostItemDateOverlap,
    validateScrapRateRange,
    validateGlobalOverheadExists,
    validateSupplierPricesCoveredByCostItems,
  ]) {
    findings.push(...await validator(costSetId, client))
  }
  return findings
}

async function runRuleValidators(ruleId: string, client: SupabaseServerClient): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []
  for (const validator of [
    validateRuleConditionFields,
    validateRuleActionValues,
    validateActiveRuleHasConditions,
    validateNoStaleExceptions,
  ]) {
    findings.push(...await validator(ruleId, client))
  }
  return findings
}

async function runInventoryValidators(snapshotId: string, client: SupabaseServerClient): Promise<ValidationFindingInput[]> {
  const findings: ValidationFindingInput[] = []
  for (const validator of [
    validateInventorySkusHaveBoms,
    validateInventoryLinesHaveCosts,
    validateSnapshotTotalNotZero,
    validateSnapshotHasNoOpenErrors,
  ]) {
    findings.push(...await validator(snapshotId, client))
  }
  return findings
}
