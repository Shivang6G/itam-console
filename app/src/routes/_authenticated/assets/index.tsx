import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Laptop, Server, Network, Printer, Monitor, Smartphone, Keyboard, Package, Plus } from "lucide-react";
import { createAsset, listAssets } from "@/api/assets";
import { ItamLayout } from "@/components/itam-layout";
import { Empty, ErrorLine, Field, StatusTag, btnDark, btnSignal, inputCls } from "@/components/ui-kit";
import { ASSET_STATUSES, CATEGORIES } from "@/lib/constants";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/assets/")({
  head: () => ({ meta: [{ title: "Assets — ITAM Console" }] }),
  component: AssetsPage,
});

const CATEGORY_ICONS: Record<string, typeof Laptop> = {
  laptop: Laptop, server: Server, switch: Network, printer: Printer,
  monitor: Monitor, mobile: Smartphone, keyboard: Keyboard, other: Package,
};

const EMPTY = { name: "", serial: "", category: "laptop", status: "in_stock", assignedTo: "", location: "", warrantyEnd: "" };

function AssetsPage() {
  const { can } = useMe();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState(EMPTY);

  const { data: assets = [], isLoading } = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });

  const add = useMutation({
    mutationFn: () => createAsset({ data: form as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setShowForm(false);
      setForm(EMPTY);
    },
  });

  const filtered = assets.filter((a) => {
    const hay = `${a.name} ${a.serial ?? ""} ${a.assetTag} ${a.category} ${a.assignedTo ?? ""}`.toLowerCase();
    return (!query || hay.includes(query.toLowerCase())) && (filter === "all" || a.status === filter);
  });
  const counts = ["all", ...ASSET_STATUSES].map((k) => ({ k, n: k === "all" ? assets.length : assets.filter((a) => a.status === k).length }));
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <ItamLayout
      eyebrow="Inventory"
      title="Assets"
      subtitle="Every serial-tagged device under your organization's control."
      actions={
        can("asset:write") && (
          <button onClick={() => setShowForm((s) => !s)} className={btnDark}>
            {showForm ? "Cancel" : (<><Plus className="h-4 w-4" /> Add Asset</>)}
          </button>
        )
      }
    >
      {showForm && can("asset:write") && (
        <form
          onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
          className="mb-6 bg-white rounded-sm border border-[color:var(--steel-200)] p-4 grid md:grid-cols-4 gap-3 items-end"
        >
          <Field label="Name"><input required value={form.name} onChange={set("name")} className={inputCls} /></Field>
          <Field label="Serial"><input value={form.serial} onChange={set("serial")} className={inputCls} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={set("category")} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set("status")} className={inputCls}>
              {ASSET_STATUSES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Assigned to"><input value={form.assignedTo} onChange={set("assignedTo")} className={inputCls} /></Field>
          <Field label="Location"><input value={form.location} onChange={set("location")} className={inputCls} /></Field>
          <Field label="Warranty ends"><input type="date" value={form.warrantyEnd} onChange={set("warrantyEnd")} className={inputCls} /></Field>
          <button type="submit" disabled={add.isPending} className={btnSignal}>{add.isPending ? "Saving…" : "Save"}</button>
          <ErrorLine error={add.error} />
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--steel-500)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, tag, serial, owner…"
            className="w-full bg-white border border-[color:var(--hairline)] rounded-sm pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[color:var(--signal)]"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {counts.map(({ k, n }) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`font-mono-tag text-[10px] uppercase tracking-widest px-2.5 py-1.5 rounded-sm border transition ${
                filter === k
                  ? "bg-[color:var(--ink-950)] text-[color:var(--paper)] border-[color:var(--ink-950)]"
                  : "bg-white text-[color:var(--steel-600)] border-[color:var(--hairline)] hover:border-[color:var(--steel-300)]"
              }`}
            >
              {k.replace("_", " ")} <span className="opacity-60 ml-1">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-sm border border-[color:var(--hairline)] overflow-x-auto tag-card">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--steel-50)] text-left text-[10px] uppercase tracking-widest text-[color:var(--steel-500)] font-mono-tag border-b border-[color:var(--hairline)]">
            <tr>
              <th className="px-4 py-3">Tag</th><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const Icon = CATEGORY_ICONS[a.category] || Package;
              return (
                <tr key={a.id} className="border-t border-[color:var(--hairline)] hover:bg-[color:var(--steel-50)]/60 transition">
                  <td className="px-4 py-3 font-mono-tag text-[11px] text-[color:var(--steel-500)] tabular">{a.assetTag}</td>
                  <td className="px-4 py-3">
                    <Link to="/assets/$id" params={{ id: a.id }} className="flex items-center gap-3 group">
                      <div className="h-9 w-9 grid place-items-center rounded-sm bg-[color:var(--steel-50)] border border-[color:var(--hairline)] text-[color:var(--ink)]"><Icon className="h-4 w-4" /></div>
                      <span className="font-medium text-[color:var(--ink)] group-hover:underline">{a.name}</span>
                      {a.source !== "manual" && <span className="font-mono-tag text-[9px] uppercase tracking-widest text-[color:var(--steel-500)] border border-[color:var(--hairline)] px-1.5 rounded-sm">{a.source}</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono-tag text-[color:var(--steel-500)] tabular">{a.serial ?? "—"}</td>
                  <td className="px-4 py-3 text-[color:var(--steel-600)] capitalize">{a.category}</td>
                  <td className="px-4 py-3"><StatusTag status={a.status} /></td>
                  <td className="px-4 py-3 text-[color:var(--steel-600)]">{a.assignedTo || "—"}</td>
                </tr>
              );
            })}
            {!isLoading && filtered.length === 0 && <Empty cols={6}>No assets match this filter.</Empty>}
          </tbody>
        </table>
      </div>
    </ItamLayout>
  );
}
