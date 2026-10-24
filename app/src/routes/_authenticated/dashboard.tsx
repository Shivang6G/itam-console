import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ItamLayout } from "@/components/itam-layout";
import { getDashboard } from "@/api/dashboard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  Tooltip,
  PieChart,
  Pie,
} from "recharts";
import { Boxes, CheckCircle2, Wrench, AlertTriangle, ArrowUpRight, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ITAM Console" },
      { name: "description", content: "Overview of IT assets, tickets, and licenses." },
      { property: "og:title", content: "Dashboard — ITAM Console" },
      { property: "og:description", content: "Overview of IT assets, tickets, and licenses." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });

  const total = stats?.assets.total ?? 0;
  const kpis = [
    { label: "Assigned", value: stats?.assets.assigned ?? 0, Icon: CheckCircle2, tone: "text-[color:var(--ok)]" },
    { label: "In stock", value: stats?.assets.in_stock ?? 0, Icon: Boxes, tone: "text-[color:var(--ink)]" },
    { label: "In Repair", value: stats?.assets.in_repair ?? 0, Icon: Wrench, tone: "text-[color:var(--warn)]" },
    { label: "Warranty ≤ 30d", value: stats?.warrantiesEndingSoon ?? 0, Icon: AlertTriangle, tone: "text-[color:var(--alert)]" },
  ];

  const statusBars = [
    { name: "Assigned", value: stats?.assets.assigned ?? 0, fill: "var(--ok)" },
    { name: "In stock", value: stats?.assets.in_stock ?? 0, fill: "var(--signal)" },
    { name: "In Repair", value: stats?.assets.in_repair ?? 0, fill: "var(--warn)" },
    { name: "Retired", value: stats?.assets.retired ?? 0, fill: "var(--steel-400)" },
  ];

  const ticketData = [
    { name: "Open", value: stats?.tickets.open ?? 0, fill: "var(--alert)" },
    { name: "In Progress", value: stats?.tickets.in_progress ?? 0, fill: "var(--warn)" },
    { name: "Resolved", value: stats?.tickets.resolved ?? 0, fill: "var(--ok)" },
  ];
  const totalTickets = ticketData.reduce((a, b) => a + b.value, 0);

  const priorityStyles: Record<string, string> = {
    low: "bg-[color:var(--steel-100)] text-[color:var(--steel-600)]",
    medium: "bg-amber-50 text-[color:var(--signal-dark)]",
    high: "bg-orange-50 text-[color:var(--warn)]",
    critical: "bg-red-50 text-[color:var(--alert)]",
  };

  return (
    <ItamLayout eyebrow="Overview" title="Dashboard" subtitle="Live snapshot of your inventory, ticket queue, and licensing posture.">
      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Hero KPI: Total Assets with mini bar chart */}
        <div className="col-span-12 lg:col-span-7 relative overflow-hidden rounded-sm border border-[color:var(--hairline)] bg-[color:var(--ink-950)] text-[color:var(--paper)] p-6 tag-card-lift">
          <div className="grid-paper absolute inset-0 opacity-10" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal)]">Total Assets Under Management</p>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="font-display text-6xl font-bold tabular">{total}</span>
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--ok)]/15 text-[color:var(--ok)] px-2 py-0.5 text-xs font-mono-tag uppercase tracking-widest">
                    <ArrowUpRight className="h-3 w-3" /> live
                  </span>
                </div>
                <div className="barcode-strip text-[color:var(--signal)]/70 mt-3 w-40" />
              </div>
              <Link
                to="/assets"
                className="hidden md:inline-flex items-center gap-1 rounded-sm border border-white/15 px-3 py-1.5 text-xs font-mono-tag uppercase tracking-widest text-[color:var(--paper)] hover:bg-white/5"
              >
                Inventory <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-6 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusBars} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--steel-400)", fontFamily: "var(--font-mono)" }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ background: "var(--ink-900)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, fontSize: 12 }} labelStyle={{ color: "var(--paper)" }} />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                    {statusBars.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Ticket queue donut */}
        <div className="col-span-12 lg:col-span-5 rounded-sm border border-[color:var(--hairline)] bg-white p-6 tag-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal-dark)]">Ticket Queue</p>
              <h3 className="font-display text-xl font-semibold text-[color:var(--ink)] uppercase mt-1">Support Load</h3>
            </div>
            <Link to="/tickets" className="text-xs font-mono-tag uppercase tracking-widest text-[color:var(--steel-500)] hover:text-[color:var(--ink)]">View all</Link>
          </div>
          <div className="mt-4 flex items-center gap-6">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={ticketData} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="none">
                    {ticketData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <p className="font-display text-3xl font-bold tabular text-[color:var(--ink)]">{totalTickets}</p>
                  <p className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">total</p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-3 text-sm">
              {ticketData.map((d) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} />
                  <span className="flex-1 text-[color:var(--steel-600)]">{d.name}</span>
                  <span className="font-mono-tag font-semibold tabular text-[color:var(--ink)]">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* KPI row */}
        {kpis.map((k) => (
          <div key={k.label} className="col-span-6 md:col-span-3 rounded-sm border border-[color:var(--hairline)] bg-white p-5 tag-card">
            <div className="flex items-center justify-between">
              <p className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">{k.label}</p>
              <k.Icon className={`h-4 w-4 ${k.tone}`} />
            </div>
            <p className={`font-display text-3xl font-bold tabular mt-3 ${k.tone}`}>{k.value}</p>
            <div className="barcode-strip text-[color:var(--steel-300)] mt-3 w-16" />
          </div>
        ))}

        {/* Recent tickets feed */}
        <div className="col-span-12 lg:col-span-7 rounded-sm border border-[color:var(--hairline)] bg-white p-6 tag-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal-dark)]">Recent Activity</p>
              <h3 className="font-display text-xl font-semibold text-[color:var(--ink)] uppercase">Latest Tickets</h3>
            </div>
            <Link to="/tickets" className="text-xs font-mono-tag uppercase tracking-widest text-[color:var(--steel-500)] hover:text-[color:var(--ink)]">Queue →</Link>
          </div>
          <ul className="mt-4 divide-y divide-[color:var(--hairline)]">
            {(stats?.recentTickets ?? []).length === 0 && (
              <li className="py-8 text-center text-sm text-[color:var(--steel-500)]">No tickets logged yet.</li>
            )}
            {(stats?.recentTickets ?? []).map((t) => (
              <li key={t.id} className="py-3 flex items-center gap-3 min-w-0">
                <span className="font-mono-tag text-[11px] tabular text-[color:var(--steel-500)] w-14 shrink-0">#{t.ticketNo}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-[color:var(--ink)]">{t.title}</span>
                <span className={`font-mono-tag text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm ${priorityStyles[t.priority] || ""}`}>{t.priority}</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs text-[color:var(--steel-500)] font-mono-tag">
                  <Clock className="h-3 w-3" />
                  {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Expiring licenses */}
        <div className="col-span-12 lg:col-span-5 rounded-sm border border-[color:var(--hairline)] bg-white p-6 tag-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal-dark)]">Watchlist</p>
              <h3 className="font-display text-xl font-semibold text-[color:var(--ink)] uppercase">Licenses Expiring</h3>
            </div>
            <Link to="/licenses" className="text-xs font-mono-tag uppercase tracking-widest text-[color:var(--steel-500)] hover:text-[color:var(--ink)]">Ledger →</Link>
          </div>
          <ul className="mt-4 space-y-3">
            {(stats?.expiringLicenses ?? []).length === 0 && (
              <li className="py-6 text-center text-sm text-[color:var(--steel-500)]">No licenses tracked.</li>
            )}
            {(stats?.expiringLicenses ?? []).map((l, i) => {
              const days = l.expiresOn ? Math.round((new Date(l.expiresOn + "T00:00:00").getTime() - Date.now()) / 86_400_000) : null;
              const warn = days !== null && days <= 30;
              return (
                <li key={l.id} className="flex items-center gap-3">
                  <span className="font-mono-tag text-[10px] tabular text-[color:var(--steel-500)] w-14 shrink-0">LIC-{String(i + 1).padStart(4, "0")}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[color:var(--ink)] font-medium">{l.product}</span>
                  <span className={`font-mono-tag text-[11px] tabular px-2 py-0.5 rounded-sm ${warn ? "bg-red-50 text-[color:var(--alert)]" : "bg-[color:var(--steel-100)] text-[color:var(--steel-600)]"}`}>
                    {days !== null ? `${days}d` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ItamLayout>
  );
}