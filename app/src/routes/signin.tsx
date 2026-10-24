import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldCheck, Boxes, LifeBuoy, KeyRound } from "lucide-react";
import { getMe } from "@/api/me";

export const Route = createFileRoute("/signin")({
  validateSearch: (s: Record<string, unknown>): { error?: string } => (typeof s.error === "string" ? { error: s.error } : {}),
  beforeLoad: async () => {
    const me = await getMe();
    if (me.user) throw redirect({ to: "/dashboard" });
    return { devAuth: me.devAuth };
  },
  head: () => ({ meta: [{ title: "Sign in — ITAM Console" }] }),
  component: SignIn,
});

function SignIn() {
  const { error } = Route.useSearch();
  const { devAuth } = Route.useRouteContext();
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[color:var(--paper)]">
      <aside className="hidden lg:flex flex-col justify-between bg-[color:var(--ink-950)] text-[color:var(--paper)] p-12 relative">
        <div className="caution-stripe absolute inset-x-0 top-0 h-1.5 opacity-80" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-sm bg-[color:var(--signal)] grid place-items-center text-[color:var(--ink-950)] font-display font-bold">IT</div>
          <h1 className="font-display uppercase text-lg font-semibold">ITAM Console</h1>
        </div>
        <div>
          <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal)]">Secure access · authorized personnel</p>
          <h2 className="font-display uppercase text-5xl font-semibold leading-tight mt-3">Every asset tagged.<br />Every ticket tracked.</h2>
          <ul className="mt-8 space-y-3 text-sm text-[color:var(--steel-300)]">
            <li className="flex items-center gap-3"><Boxes className="h-4 w-4 text-[color:var(--signal)]" /> Live inventory across sites, sealed by asset tag.</li>
            <li className="flex items-center gap-3"><LifeBuoy className="h-4 w-4 text-[color:var(--signal)]" /> Support tickets attached directly to hardware.</li>
            <li className="flex items-center gap-3"><KeyRound className="h-4 w-4 text-[color:var(--signal)]" /> License seats and renewals under one ledger.</li>
          </ul>
        </div>
        <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--steel-500)] flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--ok)]" /> Encrypted · role-based access · audited · v3.0
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-[color:var(--hairline)] rounded-sm p-8 tag-card">
          <p className="font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--signal-dark)]">Access request</p>
          <h2 className="font-display uppercase text-3xl font-semibold text-[color:var(--ink)] mt-1">Sign in</h2>
          <div className="barcode-strip text-[color:var(--steel-300)] mt-3 w-32" />

          {error && <p role="alert" className="mt-5 text-sm text-[color:var(--alert)] bg-red-50 border border-red-200 rounded-sm px-3 py-2">{error}</p>}

          <a
            href="/auth/login"
            className="mt-6 block text-center bg-[color:var(--ink-950)] text-[color:var(--paper)] text-sm font-semibold uppercase tracking-widest px-4 py-3 rounded-sm hover:bg-[color:var(--ink-900)] transition"
          >
            Continue with company sign-in
          </a>
          <p className="mt-3 text-xs text-[color:var(--steel-500)]">You will be redirected to the secure sign-in page. Multi-factor authentication may be required for administrators.</p>

          {devAuth && (
            <form method="post" action="/auth/dev-login" className="mt-8 pt-6 border-t border-dashed border-[color:var(--steel-300)] space-y-3">
              <p className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--warn)]">Local development only</p>
              <input name="name" defaultValue="Dev Admin" className="w-full border border-[color:var(--steel-300)] rounded-sm px-2 py-1.5 text-sm" aria-label="Name" />
              <input name="email" defaultValue="dev@example.com" className="w-full border border-[color:var(--steel-300)] rounded-sm px-2 py-1.5 text-sm" aria-label="Email" />
              <select name="role" defaultValue="admin" className="w-full border border-[color:var(--steel-300)] rounded-sm px-2 py-1.5 text-sm bg-white" aria-label="Role">
                <option value="admin">admin</option>
                <option value="technician">technician</option>
                <option value="viewer">viewer</option>
                <option value="none">no role</option>
              </select>
              <button type="submit" className="w-full bg-[color:var(--signal)] text-[color:var(--ink-950)] text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-sm">Dev sign-in</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
