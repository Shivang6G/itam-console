import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createLicense, deleteLicense, listLicenses } from "@/api/licenses";
import { ItamLayout } from "@/components/itam-layout";
import { Empty, ErrorLine, Field, btnDark, btnGhost, btnSignal, daysUntil, fmtDate, inputCls } from "@/components/ui-kit";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/licenses")({
  head: () => ({ meta: [{ title: "Licenses — ITAM Console" }] }),
  component: LicensesPage,
});

const EMPTY = { product: "", vendor: "", seatsTotal: "1", seatsUsed: "0", cost: "", expiresOn: "" };

function LicensesPage() {
  const { can } = useMe();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { data: licenses = [], isLoading } = useQuery({ queryKey: ["licenses"], queryFn: () => listLicenses() });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["licenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const add = useMutation({
    mutationFn: () => createLicense({ data: form as never }),
    onSuccess: () => { refresh(); setShowForm(false); setForm(EMPTY); },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteLicense({ data: { id } }), onSuccess: refresh });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <ItamLayout
      eyebrow="Software"
      title="Licenses"
      subtitle="Seats used against seats owned, with renewal dates."
      actions={can("license:manage") && (
        <button onClick={() => setShowForm((s) => !s)} className={btnDark}>
          {showForm ? "Cancel" : (<><Plus className="h-4 w-4" /> Add License</>)}
        </button>
      )}
    >
      {showForm && can("license:manage") && (
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="mb-6 bg-white rounded-sm border border-[color:var(--steel-200)] p-4 grid md:grid-cols-4 gap-3 items-end">
          <Field label="Product"><input required value={form.product} onChange={set("product")} className={inputCls} /></Field>
          <Field label="Vendor"><input value={form.vendor} onChange={set("vendor")} className={inputCls} /></Field>
          <Field label="Seats total"><input type="number" min={0} value={form.seatsTotal} onChange={set("seatsTotal")} className={inputCls} /></Field>
          <Field label="Seats used"><input type="number" min={0} value={form.seatsUsed} onChange={set("seatsUsed")} className={inputCls} /></Field>
          <Field label="Annual cost"><input inputMode="decimal" value={form.cost} onChange={set("cost")} className={inputCls} /></Field>
          <Field label="Expires on"><input type="date" value={form.expiresOn} onChange={set("expiresOn")} className={inputCls} /></Field>
          <button type="submit" disabled={add.isPending} className={btnSignal}>{add.isPending ? "Saving…" : "Save"}</button>
          <ErrorLine error={add.error} />
        </form>
      )}

      <div className="bg-white rounded-sm border border-[color:var(--hairline)] overflow-x-auto tag-card">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--steel-50)] text-left text-[10px] uppercase tracking-widest text-[color:var(--steel-500)] font-mono-tag border-b border-[color:var(--hairline)]">
            <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 w-56">Seats</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {licenses.map((l) => {
              const pct = l.seatsTotal ? Math.min(100, Math.round((l.seatsUsed / l.seatsTotal) * 100)) : 0;
              const d = daysUntil(l.expiresOn);
              const soon = d !== null && d <= 30;
              return (
                <tr key={l.id} className="border-t border-[color:var(--hairline)]">
                  <td className="px-4 py-3 font-medium">{l.product}</td>
                  <td className="px-4 py-3 text-[color:var(--steel-600)]">{l.vendor ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-[color:var(--steel-100)] rounded-full overflow-hidden"><div className={`h-full ${pct > 90 ? "bg-[color:var(--alert)]" : "bg-[color:var(--signal)]"}`} style={{ width: `${pct}%` }} /></div>
                      <span className="font-mono-tag text-[11px] tabular text-[color:var(--steel-600)]">{l.seatsUsed}/{l.seatsTotal}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-xs ${soon ? "text-[color:var(--alert)] font-semibold" : "text-[color:var(--steel-600)]"}`}>
                    {fmtDate(l.expiresOn)}{d !== null && d >= 0 && d <= 30 ? ` · ${d}d` : ""}{d !== null && d < 0 ? " · expired" : ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {can("license:manage") && (
                      <button onClick={() => { if (confirm(`Delete ${l.product}?`)) remove.mutate(l.id); }} className={btnGhost} aria-label={`Delete ${l.product}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && licenses.length === 0 && <Empty cols={5}>No licenses recorded.</Empty>}
          </tbody>
        </table>
      </div>
    </ItamLayout>
  );
}
