import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Company } from "@/lib/companies";

type Props = { companies: Company[]; days?: number };

const SERIES = [
  { key: "answered", label: "Answered", color: "var(--info)" },
  { key: "no_answer", label: "No Answer", color: "var(--muted-foreground)" },
  { key: "interested", label: "Interested", color: "var(--primary)" },
  { key: "deal_made", label: "Deal Made", color: "var(--success)" },
  { key: "not_interested", label: "Not Interested", color: "var(--destructive)" },
] as const;

export function CallsChart({ companies, days = 14 }: Props) {
  const data = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { answered: 0, no_answer: 0, interested: 0, deal_made: 0, not_interested: 0 };
    }
    for (const c of companies) {
      if (!c.last_contact) continue;
      const key = new Date(c.last_contact).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      switch (c.status) {
        case "called_no_answer":
          buckets[key].no_answer++;
          break;
        case "follow_up":
          buckets[key].answered++;
          break;
        case "in_negotiation":
          buckets[key].answered++;
          buckets[key].interested++;
          break;
        case "deal_made":
          buckets[key].answered++;
          buckets[key].interested++;
          buckets[key].deal_made++;
          break;
        case "not_interested":
          buckets[key].answered++;
          buckets[key].not_interested++;
          break;
      }
    }
    return Object.entries(buckets).map(([date, vals]) => ({
      date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      ...vals,
    }));
  }, [companies, days]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-lg">Call outcomes</h2>
        <span className="text-xs text-muted-foreground">Last {days} days</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
            <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
