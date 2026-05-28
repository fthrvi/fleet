import type { Node, Edge } from "@xyflow/react";

export function serializeGraph(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({ nodes, edges });
}

export function deserializeGraph(json: string | null | undefined): { nodes: Node[]; edges: Edge[] } {
  if (!json) return { nodes: [], edges: [] };
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) return { nodes: [], edges: [] };
    return { nodes: parsed.nodes as Node[], edges: parsed.edges as Edge[] };
  } catch {
    return { nodes: [], edges: [] };
  }
}
