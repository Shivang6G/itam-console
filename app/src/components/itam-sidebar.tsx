import { Link, useRouterState } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import {
  LayoutDashboard,
  Boxes,
  LifeBuoy,
  KeyRound,
  LogOut,
  Radio,
  ScrollText,
} from "lucide-react";

const links = [
  { to: "/dashboard", label: "Dashboard", code: "00", Icon: LayoutDashboard },
  { to: "/assets", label: "Assets", code: "01", Icon: Boxes },
  { to: "/tickets", label: "Tickets", code: "02", Icon: LifeBuoy },
  { to: "/licenses", label: "Licenses", code: "03", Icon: KeyRound },
  { to: "/audit", label: "Audit log", code: "04", Icon: ScrollText, admin: true },
] as const;

export function ItamSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { me, can } = useMe();
  const display = me?.name ?? me?.email ?? "Signed out";

  const initials = (display)
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="w-64 shrink-0 bg-[color:var(--ink-950)] text-[color:var(--steel-300)] flex flex-col min-h-screen sticky top-0 border-r border-white/5">
      {/* Brand block — treats the top of the sidebar like the head of an asset tag */}
      <div className="relative px-5 pt-6 pb-5">
        <div className="caution-stripe absolute inset-x-0 top-0 h-1 opacity-70" />
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-sm bg-[color:var(--signal)] grid place-items-center text-[color:var(--ink-950)] font-display font-bold">
              IT
            </div>
            <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-[color:var(--ok)] ring-2 ring-[color:var(--ink-950)]" />
          </div>
          <div className="min-w-0">
            <p className="font-mono-tag text-[10px] tracking-widest text-[color:var(--signal)] uppercase truncate">
              Tag · 000001
            </p>
            <h1 className="font-display text-base font-semibold text-[color:var(--paper)] leading-tight uppercase truncate">
              ITAM Console
            </h1>
          </div>
        </div>
        <div className="barcode-strip text-[color:var(--signal)]/70 mt-4 w-full" />
      </div>

      {/* Realtime status pill */}
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-sm bg-white/5 px-3 py-2 text-[11px] font-mono-tag uppercase tracking-widest text-[color:var(--steel-300)]">
        <Radio className="h-3 w-3 text-[color:var(--ok)] animate-pulse" />
        All systems nominal
      </div>

      <p className="px-5 pb-2 font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">
        Operations
      </p>
      <nav className="flex-1 px-3 space-y-1">
        {links.filter((l) => !("admin" in l) || can("audit:view")).map(({ to, label, code, Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`group flex items-center gap-3 rounded-sm pl-2 pr-3 py-2 text-sm font-medium transition relative ${
                active
                  ? "bg-[color:var(--signal)] text-[color:var(--ink-950)]"
                  : "text-[color:var(--steel-400)] hover:bg-white/5 hover:text-[color:var(--paper)]"
              }`}
            >
              <span
                className={`h-8 w-1 rounded-sm shrink-0 ${
                  active ? "bg-[color:var(--ink-950)]" : "bg-transparent group-hover:bg-[color:var(--signal)]/40"
                }`}
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              <span className={`font-mono-tag text-[10px] ${active ? "opacity-60" : "opacity-40"}`}>{code}</span>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="m-3 rounded-sm border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--steel-600)] grid place-items-center text-[color:var(--paper)] text-xs font-semibold">
            {initials || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[color:var(--paper)] text-sm font-medium truncate">
              {display}
            </p>
            <p className="text-[color:var(--signal)] text-[10px] uppercase tracking-widest font-mono-tag">
              {me?.role ?? "no role"}
            </p>
          </div>
          <form method="post" action="/auth/logout">
            <button type="submit" title="Sign out" aria-label="Sign out" className="h-8 w-8 grid place-items-center rounded-sm text-[color:var(--steel-400)] hover:bg-white/5 hover:text-[color:var(--alert)] transition">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}