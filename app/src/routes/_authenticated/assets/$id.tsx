import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, Download, Paperclip, Trash2 } from "lucide-react";
import { deleteAsset, getAsset, updateAsset } from "@/api/assets";
import { confirmUpload, deleteAttachment, getDownloadUrl, requestUpload } from "@/api/attachments";
import { ItamLayout } from "@/components/itam-layout";
import { ErrorLine, Field, StatusTag, btnDark, btnGhost, btnSignal, fmtDate, inputCls } from "@/components/ui-kit";
import { ASSET_STATUSES, CATEGORIES } from "@/lib/constants";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  head: () => ({ meta: [{ title: "Asset — ITAM Console" }] }),
  component: AssetDetail,
});

const MAX = 10 * 1024 * 1024;

function AssetDetail() {
  const { id } = Route.useParams();
  const { can } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, error } = useQuery({ queryKey: ["asset", id], queryFn: () => getAsset({ data: { id } }) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["asset", id] });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: () => updateAsset({ data: { id, data: form as never } }),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const remove = useMutation({
    mutationFn: () => deleteAsset({ data: { id } }),
    onSuccess: () => { refresh(); navigate({ to: "/assets" }); },
  });
  const removeFile = useMutation({ mutationFn: (fid: string) => deleteAttachment({ data: { id: fid } }), onSuccess: refresh });

  async function download(fid: string) {
    const { url } = await getDownloadUrl({ data: { id: fid } });
    window.location.assign(url);
  }

  async function upload(file: File) {
    setUploadErr(null);
    if (file.size > MAX) return setUploadErr("File exceeds the 10 MB limit.");
    setUploading(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const req = await requestUpload({ data: { assetId: id, filename: file.name, contentType, sizeBytes: file.size } });
      const fd = new FormData();
      Object.entries(req.fields).forEach(([k, v]) => fd.append(k, v as string));
      fd.append("file", file); // must be the last field in an S3 POST form
      const res = await fetch(req.url, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Storage rejected the upload (${res.status}).`);
      await confirmUpload({ data: { assetId: id, key: req.key, filename: file.name, contentType } });
      refresh();
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (isLoading) return <ItamLayout eyebrow="Inventory" title="Asset"><p className="text-sm text-[color:var(--steel-500)]">Loading…</p></ItamLayout>;
  if (error || !data) return <ItamLayout eyebrow="Inventory" title="Asset"><p role="alert" className="text-sm text-[color:var(--alert)]">{(error as Error)?.message ?? "Not found"}</p></ItamLayout>;

  const a = data.asset;
  const startEdit = () => {
    setForm({
      name: a.name, category: a.category, status: a.status, serial: a.serial ?? "", assignedTo: a.assignedTo ?? "",
      location: a.location ?? "", purchaseDate: a.purchaseDate ?? "", warrantyEnd: a.warrantyEnd ?? "", notes: a.notes ?? "",
    });
    setEditing(true);
  };
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const rows: [string, React.ReactNode][] = [
    ["Tag", a.assetTag], ["Serial", a.serial ?? "—"], ["Category", a.category], ["Status", <StatusTag status={a.status} />],
    ["Assigned to", a.assignedTo ?? "—"], ["Location", a.location ?? "—"], ["Purchased", fmtDate(a.purchaseDate)],
    ["Warranty ends", fmtDate(a.warrantyEnd)], ["Source", a.source],
  ];

  return (
    <ItamLayout
      eyebrow={a.assetTag}
      title={a.name}
      actions={
        <div className="flex gap-2">
          {can("asset:write") && !editing && <button onClick={startEdit} className={btnDark}>Edit</button>}
          {can("asset:delete") && (
            <button onClick={() => { if (confirm(`Delete ${a.name}? This cannot be undone.`)) remove.mutate(); }} className={btnGhost}>
              <Trash2 className="h-3.5 w-3.5 inline mr-1" />Delete
            </button>
          )}
        </div>
      }
    >
      <Link to="/assets" className="inline-flex items-center gap-1 text-xs font-mono-tag uppercase tracking-widest text-[color:var(--steel-500)] mb-4 hover:text-[color:var(--ink)]">
        <ArrowLeft className="h-3.5 w-3.5" /> All assets
      </Link>

      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="bg-white rounded-sm border border-[color:var(--steel-200)] p-4 grid md:grid-cols-4 gap-3 items-end mb-6">
          <Field label="Name"><input required value={form.name} onChange={set("name")} className={inputCls} /></Field>
          <Field label="Serial"><input value={form.serial} onChange={set("serial")} className={inputCls} /></Field>
          <Field label="Category"><select value={form.category} onChange={set("category")} className={inputCls}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={set("status")} className={inputCls}>{ASSET_STATUSES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select></Field>
          <Field label="Assigned to"><input value={form.assignedTo} onChange={set("assignedTo")} className={inputCls} /></Field>
          <Field label="Location"><input value={form.location} onChange={set("location")} className={inputCls} /></Field>
          <Field label="Purchased"><input type="date" value={form.purchaseDate} onChange={set("purchaseDate")} className={inputCls} /></Field>
          <Field label="Warranty ends"><input type="date" value={form.warrantyEnd} onChange={set("warrantyEnd")} className={inputCls} /></Field>
          <Field label="Notes" className="md:col-span-3"><input value={form.notes} onChange={set("notes")} className={inputCls} /></Field>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className={btnSignal}>{save.isPending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
          </div>
          <ErrorLine error={save.error} />
        </form>
      ) : (
        <dl className="bg-white rounded-sm border border-[color:var(--hairline)] tag-card grid sm:grid-cols-3 gap-px bg-[color:var(--hairline)] mb-6">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-white p-4">
              <dt className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">{k}</dt>
              <dd className="mt-1 text-sm text-[color:var(--ink)] capitalize">{v}</dd>
            </div>
          ))}
          {a.notes && <div className="bg-white p-4 sm:col-span-3"><dt className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">Notes</dt><dd className="mt-1 text-sm whitespace-pre-wrap">{a.notes}</dd></div>}
        </dl>
      )}

      <section className="bg-white rounded-sm border border-[color:var(--hairline)] tag-card">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--hairline)]">
          <h3 className="font-display uppercase text-sm font-semibold flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attachments</h3>
          {can("attachment:upload") && (
            <>
              <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button disabled={uploading} onClick={() => fileRef.current?.click()} className={btnDark}>{uploading ? "Uploading…" : "Upload file"}</button>
            </>
          )}
        </header>
        {uploadErr && <p role="alert" className="px-4 pt-3 text-xs text-[color:var(--alert)]">{uploadErr}</p>}
        <ul className="divide-y divide-[color:var(--hairline)]">
          {data.attachments.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1 truncate">{f.filename}</span>
              <span className="font-mono-tag text-[10px] text-[color:var(--steel-500)]">{(f.sizeBytes / 1024).toFixed(0)} KB</span>
              <button onClick={() => download(f.id)} className={btnGhost} aria-label={`Download ${f.filename}`}><Download className="h-3.5 w-3.5" /></button>
              {can("asset:delete") && <button onClick={() => removeFile.mutate(f.id)} className={btnGhost} aria-label={`Delete ${f.filename}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
          {data.attachments.length === 0 && <li className="px-4 py-8 text-center text-sm text-[color:var(--steel-500)]">No attachments. Invoices, warranty PDFs and photos go here (10 MB max).</li>}
        </ul>
      </section>
    </ItamLayout>
  );
}
