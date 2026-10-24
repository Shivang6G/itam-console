import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getMe } from "@/api/me";
import { Boxes, LifeBuoy, KeyRound, ShieldCheck, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ITAM Console — IT Asset Management" },
      { name: "description", content: "Track laptops, servers, tickets, and software licenses in one asset-tag inspired console." },
      { property: "og:title", content: "ITAM Console — IT Asset Management" },
      { property: "og:description", content: "Track laptops, servers, tickets, and software licenses in one asset-tag inspired console." },
    ],
  }),
  beforeLoad: async () => {
    const me = await getMe();
    if (me.user) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[color:var(--paper)] flex flex-col">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between border-b border-[color:var(--hairline)] backdrop-blur bg-[color:var(--paper)]/90 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-sm bg-[color:var(--ink-950)] grid place-items-center text-[color:var(--signal)] font-display font-bold text-sm">IT</div>
          <div>
            <p className="font-mono-tag text-[10px] tracking-widest text-[color:var(--signal-dark)] uppercase">Tag · 000001</p>
            <h1 className="font-display text-base font-semibold text-[color:var(--ink)] uppercase leading-none">ITAM Console</h1>
          </div>
        </div>
        <Link to="/signin" className="bg-[color:var(--ink-950)] text-[color:var(--paper)] text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-sm hover:bg-[color:var(--ink-900)]">
          Sign in →
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-paper absolute inset-0 opacity-40 pointer-events-none" />
          <div className="caution-stripe absolute inset-x-0 top-0 h-1 opacity-60" />
          <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24 grid md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-sm border border-[color:var(--hairline-strong)] bg-white/60 px-3 py-1 font-mono-tag text-[11px] uppercase tracking-widest text-[color:var(--ink)]">
                <ShieldCheck className="h-3 w-3 text-[color:var(--ok)]" /> Inventory · Tickets · Licenses
              </span>
              <h2 className="font-display text-5xl md:text-7xl font-bold text-[color:var(--ink)] uppercase leading-[0.95] mt-5">
                Every asset<br/>tagged,<br/>tracked,<br/><span className="text-[color:var(--signal-dark)]">accounted for.</span>
              </h2>
              <div className="barcode-strip text-[color:var(--steel-300)] mt-6 w-56" />
              <p className="mt-6 text-[color:var(--steel-600)] max-w-lg text-base">
                A single console for your organization's laptops, servers, network gear, and software licenses — with support tickets welded to the hardware they run on.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/signin" className="inline-flex items-center gap-2 bg-[color:var(--ink-950)] text-[color:var(--paper)] text-sm font-semibold uppercase tracking-widest px-5 py-3 rounded-sm hover:bg-[color:var(--ink-900)]">
                  Get started <ArrowUpRight className="h-4 w-4" />
                </Link>
                <a href="#features" className="inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] text-[color:var(--ink)] text-sm font-semibold uppercase tracking-widest px-5 py-3 rounded-sm hover:bg-white">
                  See what's inside
                </a>
              </div>
            </div>

            {/* Mock asset tag */}
            <div className="md:col-span-5">
              <div className="relative bg-[color:var(--ink-950)] text-[color:var(--paper)] rounded-sm p-6 tag-card-lift overflow-hidden">
                <div className="caution-stripe absolute top-0 inset-x-0 h-1.5 opacity-80" />
                <div className="grid-paper absolute inset-0 opacity-10" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <p className="font-mono-tag text-[10px] tracking-widest text-[color:var(--signal)] uppercase">Asset Tag · 000248</p>
                    <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--ok)]/15 text-[color:var(--ok)] px-2 py-0.5 font-mono-tag text-[10px] uppercase tracking-widest">
                      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ok)] animate-pulse" /> Assigned
                    </span>
                  </div>
                  <h3 className="font-display text-2xl uppercase mt-3">MacBook Pro 16"</h3>
                  <p className="font-mono-tag text-xs text-[color:var(--steel-400)]">SN · C02XJ4Q1JGH7</p>
                  <div className="barcode-strip text-[color:var(--signal)]/70 mt-3 w-full" />
                  <div className="grid grid-cols-3 gap-3 mt-5">
                    {[{k:"Owner",v:"J. Rivera"},{k:"Site",v:"HQ · 4F"},{k:"Warranty",v:"18mo"}].map(s => (
                      <div key={s.k} className="border border-white/10 rounded-sm p-2">
                        <p className="font-mono-tag text-[9px] uppercase tracking-widest text-[color:var(--steel-500)]">{s.k}</p>
                        <p className="text-sm font-medium text-[color:var(--paper)] truncate">{s.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section className="border-y border-[color:var(--hairline)] bg-white/40">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { k: "Assets tracked", v: "248" },
              { k: "Open tickets", v: "9" },
              { k: "License seats", v: "512" },
              { k: "Uptime", v: "99.9%" },
            ].map((s) => (
              <div key={s.k}>
                <p className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">{s.k}</p>
                <p className="font-display text-3xl md:text-4xl font-bold text-[color:var(--ink)] tabular mt-1">{s.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature triptych */}
        <section id="features" className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20 grid md:grid-cols-3 gap-4">
          {[
            { Icon: Boxes, k: "01", t: "Inventory", d: "One record per device. Serial, warranty, assignee, location — bolted to a scannable tag." },
            { Icon: LifeBuoy, k: "02", t: "Tickets", d: "Raise support against a specific asset. Priority queues, status transitions, full audit trail." },
            { Icon: KeyRound, k: "03", t: "Licenses", d: "Seats used vs owned, renewal timeline, vendor grouping. Never miss a renewal again." },
          ].map((f) => (
            <div key={f.k} className="bg-white border border-[color:var(--hairline)] rounded-sm p-6 tag-card">
              <div className="flex items-center justify-between">
                <f.Icon className="h-5 w-5 text-[color:var(--signal-dark)]" />
                <span className="font-mono-tag text-[10px] uppercase tracking-widest text-[color:var(--steel-500)]">{f.k}</span>
              </div>
              <h3 className="font-display text-2xl uppercase mt-4 text-[color:var(--ink)]">{f.t}</h3>
              <div className="barcode-strip text-[color:var(--steel-300)] mt-2 w-16" />
              <p className="mt-3 text-sm text-[color:var(--steel-600)]">{f.d}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-[color:var(--hairline)] px-6 md:px-10 py-6 flex items-center justify-between text-[11px] font-mono-tag uppercase tracking-widest text-[color:var(--steel-500)]">
          <span>© {new Date().getFullYear()} ITAM Console</span>
          <span>Tag · 000001 · Rev A</span>
        </footer>
      </main>
    </div>
  );
}