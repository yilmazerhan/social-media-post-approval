"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--card-foreground)",
};

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * UI_UX_SPEC.md §6: every report chart "accompanies a data table" (never a
 * chart alone) and must be "readable in greyscale". Every report here is a
 * single series, so one solid fill — the app's own `--primary` token,
 * already tuned for contrast in both themes — is enough; there's no second
 * series to tell apart by hue. `role="img"` treats the chart as a single
 * decorative visual (the always-present table is the accessible data
 * source, per WCAG 2.2 AA §9's table-alongside-chart requirement).
 */
export function ReportBarChart({
  data,
  xKey,
  yKey,
  yLabel,
  horizontal = false,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  yLabel: string;
  horizontal?: boolean;
}) {
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`${yLabel} by ${xKey}, shown as a bar chart — see the table below for exact values`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, left: horizontal ? 8 : 0, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={!horizontal}
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                width={120}
                tickFormatter={(value: string) => truncate(value, 18)}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={0}
                angle={data.length > 6 ? -30 : 0}
                textAnchor={data.length > 6 ? "end" : "middle"}
                height={data.length > 6 ? 50 : 30}
                tickFormatter={(value: string) => truncate(value, 14)}
              />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
            </>
          )}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "var(--card-foreground)" }}
          />
          <Bar
            dataKey={yKey}
            name={yLabel}
            fill="var(--primary)"
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={horizontal ? 24 : 48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
