"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Sample {
  ts: string;
  cpuPercent: number | null;
  diskFreeGb: number | null;
  ramTotalGb: number | null;
}

export function MachineMetricsChart({ samples }: { samples: Sample[] }) {
  // Recharts wants Date or numeric for time; convert ISO -> ms
  const data = samples.map((s) => ({
    ...s,
    tsMs: new Date(s.ts).getTime(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">CPU %</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="tsMs" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => formatTime(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis domain={[0, "auto"]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
              contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
            />
            <Line type="monotone" dataKey="cpuPercent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Disk free (GB)</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="tsMs" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => formatTime(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
              contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
            />
            <Line type="monotone" dataKey="diskFreeGb" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
