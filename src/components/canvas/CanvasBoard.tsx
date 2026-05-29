"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, type Node, type Edge, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentTerminalNode } from "./AgentTerminalNode";
import { ProjectNode } from "./ProjectNode";
import { CanvasToolbar } from "./CanvasToolbar";
import { FocusContext } from "./focus-context";
import { FocusOverlay } from "./FocusOverlay";
import { deserializeGraph, serializeGraph } from "@/lib/canvas-graph";
import { saveCanvas } from "@/actions/canvas";
import { buildLaunchCommand } from "@/lib/shell-cd";

type Machine = { id: number; name: string };

export function CanvasBoard({ machines, initialGraphJson }: { machines: Machine[]; initialGraphJson: string }) {
  const hubHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const initial = useMemo(() => deserializeGraph(initialGraphJson), [initialGraphJson]);
  const nodeTypes = useMemo(() => ({ agentTerminal: AgentTerminalNode, project: ProjectNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);

  const [focusedId, setFocused] = useState<string | null>(null);
  const focusedNode = nodes.find((n) => n.id === focusedId && n.type === "agentTerminal");
  const focusedSession = focusedNode
    ? (() => {
        const fd = focusedNode.data as unknown as { machineId: number; hubHost: string; command: string; cwd?: string; label?: string };
        return { sessionId: focusedNode.id, machineId: fd.machineId, hubHost: fd.hubHost, cmd: buildLaunchCommand(fd.command, fd.cwd), label: fd.label || fd.command };
      })()
    : null;

  // Debounced autosave; skip the initial mount. `latest` holds the newest
  // serialized graph so we can flush it on unmount / tab close without a
  // sub-debounce change being lost.
  const latest = useRef(initialGraphJson);
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latest.current = serializeGraph(nodes, edges);
    if (firstRun.current) { firstRun.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveCanvas(latest.current); }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [nodes, edges]);

  // Flush the latest graph on unmount (SPA navigation) and best-effort on tab close.
  useEffect(() => {
    const flush = () => { void saveCanvas(latest.current); };
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, []);

  const addNode = useCallback((node: Node) => setNodes((ns) => [...ns, node]), [setNodes]);

  return (
    <FocusContext.Provider value={{ focusedId, setFocused }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#070a0f" }}>
        <CanvasToolbar machines={machines} hubHost={hubHost} onAdd={addNode} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable style={{ background: "#0b0e14" }} />
        </ReactFlow>
        {focusedSession && <FocusOverlay session={focusedSession} />}
      </div>
    </FocusContext.Provider>
  );
}
