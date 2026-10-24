import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { searchAll } from "@/api/search";
import { ItamSidebar } from "./itam-sidebar";

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchAll({ data: { q: debounced } }),
    enabled: debounced.length >= 2,
  });
  const hit = "block px-3 py-1.5 text-sm hover:bg-[color:var(--steel-50)]";
  const none = data && !data.assets.length && !data.tickets.length && !data.licenses.length;
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--steel-500)]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setQ(""), 150)}
        placeholder="Search assets, tickets, licenses…"
        aria-label="Search"
        className="w-full bg-white/60 border border-[color:var(--hairline)] rounded-sm pl-9 pr-3 py-1.5 text-sm placeholder:text-[color:var(--steel-500)] focus:outline-none focus:border-[color:var(--signal)]"
      />
      {debounced.length >= 2 && q && data && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[color:var(--hairline)] rounded-sm shadow-lg z-20 max-h-80 overflow-auto">
          {data.assets.map((a) => (
            <Link key={a.id} to="/assets/$id" params={{ id: a.id }} className={hit}>
              <span className="font-mono-tag text-[10px] text-[color:var(--steel-500)] mr-2">{a.assetTag}</span>{a.name}
            </Link>
          ))}
          {data.tickets.map((t) => (
            <Link key={t.id} to="/tickets" className={hit}>
              <span className="font-mono-tag text-[10px] text-[color:var(--steel-500)] mr-2">#{t.ticketNo}</span>{t.title}
            </Link>
          ))}
          {data.licenses.map((l) => (
            <Link key={l.id} to="/licenses" className={hit}>{l.product}</Link>
          ))}
          {none && <p className="px-3 py-3 text-sm text-[color:var(--steel-500)]">No matches.</p>}
        </div>
      )}
    </label>
  );
}

export function ItamLayout({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-[color:var(--paper)]">
      <ItamSidebar />
      <main className="flex-1 min-h-screen flex flex-col min-w-0">
        {/* Top command bar */}
        <div className="sticky top-0 z-10 backdrop-blur-md bg-[color:var(--paper)]/85 border-b border-[color:var(--hairline)]">
          <div className="flex items-center gap-4 px-8 h-14">
            <div className="flex-1 max-w-md">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8">
          <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
            <div className="min-w-0">
              <p className="font-mono-tag text-[11px] tracking-widest text-[color:var(--signal-dark)] uppercase">
                {eyebrow}
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-[color:var(--ink)] uppercase leading-tight truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-sm text-[color:var(--steel-600)] max-w-xl">{subtitle}</p>
              )}
              <div className="barcode-strip text-[color:var(--steel-300)] mt-3 w-40" />
            </div>
            <div className="shrink-0">{actions}</div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}