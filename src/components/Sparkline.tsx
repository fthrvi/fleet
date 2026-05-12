interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

/**
 * Tiny inline SVG sparkline. Zero deps, server-renderable. Auto-scales y to
 * the [0, max(values)] range, falls back to a flat line if there's no data.
 */
export function Sparkline({ values, width = 100, height = 24, stroke = "currentColor" }: Props) {
  if (!values || values.length === 0) {
    return (
      <svg width={width} height={height} className="text-muted-foreground/30">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="2 2" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
