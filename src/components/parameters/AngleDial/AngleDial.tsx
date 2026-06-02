interface AngleDialProps {
  /** Angle in degrees */
  degrees: number;
  size?: number;
}

export function AngleDial({ degrees, size = 12 }: AngleDialProps) {
  const r = size / 2;
  const rad = ((degrees - 90) * Math.PI) / 180;
  const x = r + (r - 1.5) * Math.cos(rad);
  const y = r + (r - 1.5) * Math.sin(rad);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden
    >
      <circle
        cx={r}
        cy={r}
        r={r - 0.5}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={1}
      />
      <line
        x1={r}
        y1={r}
        x2={x}
        y2={y}
        stroke="currentColor"
        strokeOpacity={0.8}
        strokeWidth={1.2}
        strokeLinecap="round"
        style={{ transition: "x2 0.1s ease, y2 0.1s ease" }}
      />
    </svg>
  );
}
