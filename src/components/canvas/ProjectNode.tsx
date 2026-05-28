"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";

export function ProjectNode({ data, selected }: NodeProps) {
  const label = (data as { label?: string })?.label ?? "project";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth: 240,
        minHeight: 160,
        border: "1.5px solid rgba(59,130,246,.6)",
        borderRadius: 8,
        background: "rgba(59,130,246,.05)",
      }}
    >
      <NodeResizer minWidth={240} minHeight={160} isVisible={!!selected} />
      <div
        className="nodrag"
        style={{ fontSize: 11, fontWeight: 600, color: "#c8d3f5", padding: "4px 8px" }}
      >
        ▣ {label}
      </div>
    </div>
  );
}
