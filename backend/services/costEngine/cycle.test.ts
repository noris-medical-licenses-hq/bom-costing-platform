import { describe, it, expect } from 'vitest'
import { detectBomCycle, wouldCreateCycle } from './cycle'
import type { BomLine } from '../../repositories/bomRepository'

function line(id: string, parentId: string | null = null): BomLine {
  return {
    id,
    organization_id: 'org',
    bom_version_id: 'bv',
    parent_line_id: parentId,
    position: 0,
    depth: parentId ? 1 : 0,
    sku_id: `sku-${id}`,
    virtual_component_id: null,
    quantity: 1,
    unit_of_measure: 'pcs',
    reference_designator: null,
    notes: null,
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
  }
}

describe('detectBomCycle', () => {
  it('returns null for an empty BOM', () => {
    expect(detectBomCycle([])).toBeNull()
  })

  it('returns null for a single-level BOM (3 components)', () => {
    expect(detectBomCycle([line('A'), line('B'), line('C')])).toBeNull()
  })

  it('returns null for a two-level BOM', () => {
    // Root → A, Root → B, A → C
    expect(detectBomCycle([
      line('Root'),
      line('A', 'Root'),
      line('B', 'Root'),
      line('C', 'A'),
    ])).toBeNull()
  })

  it('returns null for a deep 5-level BOM', () => {
    expect(detectBomCycle([
      line('L1'),
      line('L2', 'L1'),
      line('L3', 'L2'),
      line('L4', 'L3'),
      line('L5', 'L4'),
    ])).toBeNull()
  })

  it('returns null when a shared component appears under multiple parents (diamond)', () => {
    // L1 and L2 are both roots; each has a child referencing the same sku but different line IDs
    expect(detectBomCycle([
      line('L1'),
      line('L2'),
      line('L1-child', 'L1'),
      line('L2-child', 'L2'),
    ])).toBeNull()
  })

  it('detects a direct cycle: A.parent=null, B.parent=A, A2.parent=B where A2 has id=A (back-edge)', () => {
    // This simulates the data-corruption case where line id 'A' appears twice:
    // once as a root and once as a descendant.
    // buildChildrenOf maps: null→[A, A], A→[B], B→[A]  (A appears twice in children of null!)
    // When DFS visits root 'A' (gray), then visits B (child of A), then visits A again
    // (child of B per childrenOf['B'] = ['A']) — A is gray → cycle!
    const lines: BomLine[] = [
      line('A', null),
      line('B', 'A'),
      // Duplicate id 'A' with parent 'B' — back-edge
      { ...line('A', 'B') },
    ]
    const cycle = detectBomCycle(lines)
    expect(cycle).not.toBeNull()
    expect(cycle).toContain('A')
  })

  it('detects a 3-node cycle: A→B→C→A', () => {
    // childrenOf: null→[A], A→[B], B→[C], C→[A]
    // When DFS visits A(gray)→B(gray)→C(gray), then tries to visit A (child of C) — A is gray!
    const lines: BomLine[] = [
      line('A', null),
      line('B', 'A'),
      line('C', 'B'),
      { ...line('A', 'C') }, // back-edge to A
    ]
    const cycle = detectBomCycle(lines)
    expect(cycle).not.toBeNull()
    expect(cycle).toContain('A')
  })
})

describe('wouldCreateCycle', () => {
  const base = [
    line('L1'),
    line('L2', 'L1'),
    line('L3', 'L2'),
  ]

  it('returns false when adding a leaf node', () => {
    expect(wouldCreateCycle(base, 'L4', 'L3', 'bv')).toBe(false)
  })

  it('returns false when adding a second root', () => {
    expect(wouldCreateCycle(base, 'L4', null, 'bv')).toBe(false)
  })

  it('returns false when adding a sibling of L2', () => {
    expect(wouldCreateCycle(base, 'L4', 'L1', 'bv')).toBe(false)
  })

  it('handles adding to an empty BOM without error', () => {
    expect(wouldCreateCycle([], 'first', null, 'bv')).toBe(false)
  })
})
