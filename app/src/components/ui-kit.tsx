import type { ReactNode } from "react";

export const inputCls =
  "mt-1 w-full border border-[color:var(--steel-300)] rounded-sm px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[color:var(--signal)]";
export const labelCls = "text-xs font-mono-tag uppercase tracking-wide text-[color:var(--steel-500)]";
export const btnDark =
  "inline-flex items-center gap-2 bg-[color:var(--ink-950)] text-[color:var(--paper)] text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-sm hover:bg-[color:var(--ink-900)] transition disabled:opacity-50";
export const btnSignal =
  "bg-[color:var(--signal)] text-[color:var(--ink-950)] text-sm font-semibold uppercase tracking-wide px-4 py-2 rounded-sm disabled:opacity-50";
export const btnGhost =
  "text-xs font-mono-tag uppercase tracking-widest px-2.5 py-1.5 rounded-sm border border-[color:var(--hairline)] bg-white text-[color:var(--steel-600)] hover:border-[color:var(--steel-300)] disabled:opacity-50";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-[color:var(--alert)] md:col-span-4">
      {(error as Error).message ?? "Something went wrong"}
    </p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  in_stock: "bg-green-50 text-[color:var(--ok)] border-green-200",
  assigned: "bg-amber-50 text-[color:var(--signal-dark)] border-amber-200",
  in_repair: "bg-orange-50 text-[color:var(--warn)] border-orange-200",
  retired: "bg-[color:var(--steel-100)] text-[color:var(--steel-500)] border-[color:var(--steel-200)]",
};

export function StatusTag({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono-tag text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-sm border ${STATUS_STYLES[status] || ""}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replace("_", " ")}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-[color:var(--steel-100)] text-[color:var(--steel-600)] border-[color:var(--steel-200)]",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  high: "bg-orange-50 text-[color:var(--warn)] border-orange-200",
  critical: "bg-red-50 text-[color:var(--alert)] border-red-200",
};

export function PriorityTag({ priority }: { priority: string }) {
  return (
    <span className={`font-mono-tag text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm border ${PRIORITY_STYLES[priority] || ""}`}>
      {priority}
    </span>
  );
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v + (v.length === 10 ? "T00:00:00" : "")) : v;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function daysUntil(v: string | null | undefined): number | null {
  if (!v) return null;
  const end = new Date(v + "T00:00:00").getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}

export function Empty({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-sm text-[color:var(--steel-500)]">{children}</td>
    </tr>
  );
}
