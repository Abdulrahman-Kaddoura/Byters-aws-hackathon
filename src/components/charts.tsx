import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

export function ConfidenceTrendChart({
  data,
  height = 180,
  color = '#4f46e5',
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Not enough history yet to plot a trend.</p>;
  }
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="confFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(120,130,150,0.15)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 10,
              fontSize: 12,
              color: 'hsl(var(--popover-foreground))',
            }}
            labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
            formatter={(v: number) => [`${v}%`, 'Confidence']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#confFill)"
            dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, strokeWidth: 2 }}
          >
            <LabelList
              dataKey="value"
              position="top"
              offset={10}
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
