import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listAudit } from "@/api/audit";
import { ItamLayout } from "@/components/itam-layout";
import { Empty } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/audit")({
  beforeLoad: ({ context }) => {
    if (!context.me.can["audit:view"]) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Audit log — ITAM Console" }] }),
  component: AuditPage,
});

function AuditPage() {
  const { data = [], isLoading, error } = useQuery({ queryKey: ["audit"], queryFn: () => listAudit() });
  return (
    <ItamLayout eyebrow="Compliance" title="Audit log" subtitle="Who changed what, and when. Written in the same transaction as the change.">
      <div className="bg-white rounded-sm border border-[color:var(--hairline)] overflow-x-auto tag-card">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--steel-50)] text-left text-[10px] uppercase tracking-widest text-[color:var(--steel-500)] font-mono-tag border-b border-[color:var(--hairline)]">
            <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Detail</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t border-[color:var(--hairline)] align-top">
                <td className="px-4 py-2 font-mono-tag text-[11px] text-[color:var(--steel-500)] whitespace-nowrap">{new Date(r.at).toLocaleString()}</td>
                <td className="px-4 py-2">{r.actorEmail ?? r.actorSub}</td>
                <td className="px-4 py-2 font-mono-tag text-[11px]">{r.action}</td>
                <td className="px-4 py-2 font-mono-tag text-[11px] text-[color:var(--steel-500)]">{r.entity}:{r.entityId.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs text-[color:var(--steel-600)] max-w-md truncate" title={r.diff ?? ""}>{r.diff ?? ""}</td>
              </tr>
            ))}
            {!isLoading && data.length === 0 && <Empty cols={5}>No activity yet.</Empty>}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[color:var(--alert)]">{(error as Error).message}</p>}
    </ItamLayout>
  );
}
