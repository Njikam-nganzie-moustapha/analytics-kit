import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface TrendPoint { label: string; value: number; value2?: number }

interface Props {
  data: TrendPoint[]
  height?: number
  series?: { key: 'value' | 'value2'; name: string; color: string }[]
}

export function AreaTrend({ data, height = 260, series }: Props) {
  const s = series ?? [{ key: 'value', name: 'Sessions', color: 'hsl(var(--primary))' }]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {s.map(ser => (
            <linearGradient key={ser.key} id={`grad-${ser.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ser.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ser.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))',
            borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))',
          }}
          labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
        />
        {s.map(ser => (
          <Area
            key={ser.key} type="monotone" dataKey={ser.key} name={ser.name}
            stroke={ser.color} strokeWidth={2} fill={`url(#grad-${ser.key})`}
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
