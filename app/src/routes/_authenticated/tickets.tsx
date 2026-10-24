import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { listAssets } from "@/api/assets";
import { createTicket, listTickets, updateTicket } from "@/api/tickets";
import { ItamLayout } from "@/components/itam-layout";
import { Empty, ErrorLine, Field, PriorityTag, btnDark, btnSignal, inputCls } from "@/components/ui-kit";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/constants";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/tickets")({
  head: () => ({ meta: [{ title: "Tickets — ITAM Console" }] }),
  component: TicketsPage,
});

const STATUS_COLOR: Record<string, string> = {
  open: "text-[color:var(--alert)]", in_progress: "text-[color:var(--warn)]",
  resolved: "text-[color:var(--ok)]", closed: "text-[color:var(--steel-500)]",
};
const EMPTY = { title: "", description: "", priority: "medium", assetId: "" };

function TicketsPage() {
  const { can } = useMe();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: tickets = [], isLoading } = useQuery({ queryKey: ["tickets"], queryFn: () => listTickets() });
  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const add = useMutation({
    mutationFn: () => createTicket({ data: { ...form, assetId: form.assetId || null } as never }),
    onSuccess: () => { refresh(); setShowForm(false); setForm(EMPTY); },
  });
  const patch = useMutation({
    mutationFn: (p: { id: string; status?: string; assignedTo?: string }) => updateTicket({ data: p as never }),
    onSuccess: refresh,
  });

  return (
    <ItamLayout
      eyebrow="Support"
      title="Tickets"
      subtitle="Issues raised against specific hardware, with a full audit trail."
      actions={can("ticket:create") && (
        <button onClick={() => setShowForm((s) => !s)} className={btnDark}>
          {showForm ? "Cancel" : (<><Plus className="h-4 w-4" /> Raise Ticket</>)}
        </button>
      )}
    >
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="mb-6 bg-white rounded-sm border border-[color:var(--steel-200)] p-4 grid md:grid-cols-4 gap-3 items-end">
          <Field label="Title" className="md:col-span-2"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} /></Field>
          <Field label="Asset">
            <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} className={inputCls}>
              <option value="">— none —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputCls}>
              {TICKET_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Description" className="md:col-span-3"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} /></Field>
          <button type="submit" disabled={add.isPending} className={btnSignal}>{add.isPending ? "Saving…" : "Submit"}</button>
          <ErrorLine error={add.error} />
        </form>
      )}

      <div className="bg-white rounded-sm border border-[color:var(--hairline)] overflow-x-auto tag-card">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--steel-50)] text-left text-[10px] uppercase tracking-widest text-[color:var(--steel-500)] font-mono-tag border-b border-[color:var(--hairline)]">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Issue</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Raised by</th></tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-[color:var(--hairline)] hover:bg-[color:var(--steel-50)]/60">
                <td className="px-4 py-3 font-mono-tag text-[11px] text-[color:var(--steel-500)] tabular">#{t.ticketNo}</td>
                <td className="px-4 py-3 font-medium">{t.assetName ?? "—"}</td>
                <td className="px-4 py-3 text-[color:var(--steel-600)]">{t.title}</td>
                <td className="px-4 py-3"><PriorityTag priority={t.priority} /></td>
                <td className="px-4 py-3">
                  {can("ticket:update") ? (
                    <select
                      value={t.status}
                      onChange={(e) => patch.mutate({ id: t.id, status: e.target.value })}
                      className={`font-mono-tag text-[11px] uppercase tracking-widest border border-[color:var(--hairline)] rounded-sm px-1.5 py-1 bg-white ${STATUS_COLOR[t.status]}`}
                      aria-label={`Status of ticket ${t.ticketNo}`}
                    >
                      {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  ) : (
                    <span className={`font-mono-tag text-[11px] uppercase tracking-widest ${STATUS_COLOR[t.status]}`}>{t.status.replace("_", " ")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[color:var(--steel-600)]">{t.raisedByName ?? "—"}</td>
              </tr>
            ))}
            {!isLoading && tickets.length === 0 && <Empty cols={6}>No tickets yet.</Empty>}
          </tbody>
        </table>
      </div>
      {patch.error && <p role="alert" className="mt-2 text-xs text-[color:var(--alert)]">{(patch.error as Error).message}</p>}
    </ItamLayout>
  );
}
