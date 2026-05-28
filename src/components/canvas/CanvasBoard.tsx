"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentTerminalNode } from "./AgentTerminalNode";

type Machine = { id: number; name: string };

export function CanvasBoard({ machines }: { machines: Machine[] }) {
  const hubHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const nodeTypes = useMemo(() => ({ agentTerminal: AgentTerminalNode }), []);

  const initialNodes: Node[] = [
    {
      id: "agent-1",
      type: "agentTerminal",
      position: { x: 80, y: 80 },
      data: { machines, hubHost },
    },
  ];

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#070a0f" }}>
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
