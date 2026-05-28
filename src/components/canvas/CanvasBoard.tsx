"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentTerminalNode } from "./AgentTerminalNode";
import { ProjectNode } from "./ProjectNode";
import { CanvasToolbar } from "./CanvasToolbar";
import { deserializeGraph, serializeGraph } from "@/lib/canvas-graph";
import { saveCanvas } from "@/actions/canvas";

type Machine = { id: number; name: string };

export function CanvasBoard({ machines, initialGraphJson }: { machines: Machine[]; initialGraphJson: string }) {
  const hubHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const initial = useMemo(() => deserializeGraph(initialGraphJson), [initialGraphJson]);
  const nodeTypes = useMemo(() => ({ agentTerminal: AgentTerminalNode, project: ProjectNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(initial.edges);

  // Debounced autosave; skip the initial mount.
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveCanvas(serializeGraph(nodes, edges)); }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [nodes, edges]);

  const addNode = useCallback((node: Node) => setNodes((ns) => [...ns, node]), [setNodes]);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#070a0f" }}>
      <CanvasToolbar machines={machines} hubHost={hubHost} onAdd={addNode} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
