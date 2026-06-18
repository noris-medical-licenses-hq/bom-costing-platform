import type { BomLine } from '../../repositories/bomRepository'

// Detects cycles in a BOM adjacency list.
// Run BEFORE inserting any bom_line to prevent circular BOMs (ADR-106).
// Also run at the start of cost engine Stage 01 as a secondary guard.
//
// Algorithm: DFS with three-color marking (white=unvisited, gray=in-stack, black=done).
// Time: O(V + E) where V = lines, E = parent-child relationships.
//
// Returns the cycle path if found, or null if no cycle.
export function detectBomCycle(lines: BomLine[]): string[] | null {
  const childrenOf = new Map<string | null, string[]>()
  for (const line of lines) {
    const parentId = line.parent_line_id ?? null
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
    childrenOf.get(parentId)!.push(line.id)
  }

  const white = new Set(lines.map(l => l.id))
  const gray = new Set<string>()
  const parent = new Map<string, string | null>()

  function dfs(nodeId: string): string[] | null {
    white.delete(nodeId)
    gray.add(nodeId)

    for (const childId of childrenOf.get(nodeId) ?? []) {
      if (gray.has(childId)) {
        // Reconstruct cycle path
        const cycle = [childId]
        let cur: string | null = nodeId
        while (cur && cur !== childId) {
          cycle.unshift(cur)
          cur = parent.get(cur) ?? null
        }
        cycle.unshift(childId)
        return cycle
      }
      if (white.has(childId)) {
        parent.set(childId, nodeId)
        const cycle = dfs(childId)
        if (cycle) return cycle
      }
    }

    gray.delete(nodeId)
    return null
  }

  // Check all roots (lines with no parent)
  for (const rootId of childrenOf.get(null) ?? []) {
    if (white.has(rootId)) {
      parent.set(rootId, null)
      const cycle = dfs(rootId)
      if (cycle) return cycle
    }
  }

  return null
}

// Checks if adding a new line with (bomVersionId, parentLineId) would create a cycle.
// Loads existing lines from the repository before calling this.
export function wouldCreateCycle(
  existingLines: BomLine[],
  newLineId: string,
  newLineParentId: string | null,
  newLineBomVersionId: string
): boolean {
  const hypothetical: BomLine = {
    id: newLineId,
    organization_id: existingLines[0]?.organization_id ?? '',
    bom_version_id: newLineBomVersionId,
    parent_line_id: newLineParentId,
    position: 0,
    depth: 0,
    sku_id: null,
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
  return detectBomCycle([...existingLines, hypothetical]) !== null
}
