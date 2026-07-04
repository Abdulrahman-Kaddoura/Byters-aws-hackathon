import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { CHART_COLORS } from '../lib/ui';

// Single-series confidence-over-stages trend. One hue (brand), direct value
// labels on each point, recessive grid, hover crosshair — no legend needed.
export function ConfidenceTrendChart({
  data,
  height = 180,
  color = CHART_COLORS.brand,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
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
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              fontSize: 12,
              boxShadow: 'var(--shadow-card)',
              color: 'var(--text)',
            }}
            labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
            formatter={(v: number) => [`${v}%`, 'Confidence']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#confFill)"
            dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }}
          >
            <LabelList
              dataKey="value"
              position="top"
              offset={10}
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-secondary)' }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
