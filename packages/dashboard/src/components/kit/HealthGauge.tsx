interface Props { score: number; size?: number }

// Semicircular 0–100 gauge. Color-graded (red→amber→green) with the numeric
// score shown as a large KPI, so meaning never relies on color alone.
export function HealthGauge({ score, size = 180 }: Props) {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  const r = size / 2 - 14
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * r // semicircle
  const dash = (s / 100) * circumference
  const color = s >= 80 ? 'hsl(var(--success))' : s >= 50 ? 'hsl(var(--brand-amber))' : 'hsl(var(--destructive))'
  const label = s >= 80 ? 'Healthy' : s >= 50 ? 'Needs attention' : 'Critical'

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`Health score ${s} out of 100 — ${label}`}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={12} strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 32, fontWeight: 700 }}>{s}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>/ 100</text>
      </svg>
      <span className="-mt-1 text-sm font-medium" style={{ color }}>{label}</span>
    </div>
  )
}
