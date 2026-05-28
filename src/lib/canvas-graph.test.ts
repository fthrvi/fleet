import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeGraph, deserializeGraph } from "./canvas-graph";

test("serialize→deserialize round-trips nodes and edges", () => {
  const nodes = [{ id: "a", type: "agentTerminal", position: { x: 1, y: 2 }, data: { machineId: 6, command: "claude", label: "api" } }];
  const edges = [{ id: "e1", source: "a", target: "b" }];
  const json = serializeGraph(nodes as any, edges as any);
  assert.deepEqual(deserializeGraph(json), { nodes, edges });
});

test("deserialize tolerates empty/invalid JSON → empty graph", () => {
  assert.deepEqual(deserializeGraph(""), { nodes: [], edges: [] });
  assert.deepEqual(deserializeGraph("not json"), { nodes: [], edges: [] });
  assert.deepEqual(deserializeGraph('{"nodes":[]}'), { nodes: [], edges: [] });
});
