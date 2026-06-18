// Append-only repository for calculation trace tables (ADR-104).
// Traces are written by the cost engine and never mutated by the application
// (except the single is_complete=true UPDATE on the header after all sub-records are written).
import type { SupabaseServerClient } from '../lib/supabase'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type CalcTrace = Tables<'calculation_traces'>
export type CalcTraceLine = Tables<'calculation_trace_lines'>
export type RuleExecTrace = Tables<'rule_execution_traces'>
export type ExceptionExecTrace = Tables<'exception_execution_traces'>
export type CostSourceTrace = Tables<'cost_source_traces'>

// ─── Trace Header ─────────────────────────────────────────────────────────────

export async function createTrace(
  input: Inserts<'calculation_traces'>,
  client: SupabaseServerClient
): Promise<CalcTrace> {
  const { data, error } = await client.from('calculation_traces').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createTrace', 'calculation_traces')
  if (!data) throw new Error('createTrace returned no data')
  return data
}

// Called by engine as its last write — sets is_complete=true and final_cost.
// After this, the trace is immutable (C-12).
export async function completeTrace(
  traceId: string,
  finalCost: number,
  durationMs: number,
  hasWarnings: boolean,
  warningCount: number,
  missingCostCount: number,
  client: SupabaseServerClient
): Promise<void> {
  const { error } = await client
    .from('calculation_traces')
    .update({ is_complete: true, final_cost: finalCost, duration_ms: durationMs, has_warnings: hasWarnings, warning_count: warningCount, missing_cost_count: missingCostCount })
    .eq('id', traceId)
    .eq('is_complete', false)  // guard: only complete once
  if (error) handleSupabaseError(error, 'completeTrace', 'calculation_traces')
}

export async function findTraceById(id: string, client: SupabaseServerClient): Promise<CalcTrace> {
  const { data, error } = await client.from('calculation_traces').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findTraceById', 'calculation_traces')
  if (!data) throw new NotFoundError('CalcTrace', id)
  return data
}

export async function listTracesForSku(
  skuId: string,
  costSetId: string,
  limit: number,
  client: SupabaseServerClient
): Promise<CalcTrace[]> {
  const { data, error } = await client
    .from('calculation_traces')
    .select('*')
    .eq('sku_id', skuId)
    .eq('cost_set_id', costSetId)
    .eq('is_complete', true)
    .order('triggered_at', { ascending: false })
    .limit(limit)
  if (error) handleSupabaseError(error, 'listTracesForSku', 'calculation_traces')
  return data ?? []
}

// ─── Trace Lines ─────────────────────────────────────────────────────────────

export async function createTraceLines(
  inputs: Inserts<'calculation_trace_lines'>[],
  client: SupabaseServerClient
): Promise<CalcTraceLine[]> {
  if (inputs.length === 0) return []
  const { data, error } = await client.from('calculation_trace_lines').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createTraceLines', 'calculation_trace_lines')
  return data ?? []
}

export async function listTraceLinesForTrace(
  traceId: string,
  client: SupabaseServerClient
): Promise<CalcTraceLine[]> {
  const { data, error } = await client
    .from('calculation_trace_lines')
    .select('*')
    .eq('trace_id', traceId)
    .order('depth', { ascending: true })
    .order('position', { ascending: true })
  if (error) handleSupabaseError(error, 'listTraceLinesForTrace', 'calculation_trace_lines')
  return data ?? []
}

// ─── Rule Execution Traces ────────────────────────────────────────────────────

export async function createRuleExecTraces(
  inputs: Inserts<'rule_execution_traces'>[],
  client: SupabaseServerClient
): Promise<RuleExecTrace[]> {
  if (inputs.length === 0) return []
  const { data, error } = await client.from('rule_execution_traces').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createRuleExecTraces', 'rule_execution_traces')
  return data ?? []
}

// ─── Exception Execution Traces ───────────────────────────────────────────────

export async function createExceptionExecTraces(
  inputs: Inserts<'exception_execution_traces'>[],
  client: SupabaseServerClient
): Promise<ExceptionExecTrace[]> {
  if (inputs.length === 0) return []
  const { data, error } = await client.from('exception_execution_traces').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createExceptionExecTraces', 'exception_execution_traces')
  return data ?? []
}

// ─── Cost Source Traces ───────────────────────────────────────────────────────

export async function createCostSourceTraces(
  inputs: Inserts<'cost_source_traces'>[],
  client: SupabaseServerClient
): Promise<CostSourceTrace[]> {
  if (inputs.length === 0) return []
  const { data, error } = await client.from('cost_source_traces').insert(inputs).select()
  if (error) handleSupabaseError(error, 'createCostSourceTraces', 'cost_source_traces')
  return data ?? []
}
