import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMe } from "@/api/me";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const me = await getMe();
    if (!me.user) throw redirect({ to: "/signin" });
    return { me };
  },
  component: Gate,
});

function Gate() {
  const { me } = Route.useRouteContext();
  if (!me.user?.role) {
    return (
      <div className="min-h-screen grid place-items-center bg-[color:var(--paper)] p-6">
        <div className="max-w-md bg-white border border-[color:var(--hairline)] rounded-sm p-8 tag-card text-center">
          <h1 className="font-display uppercase text-2xl font-semibold">No role assigned</h1>
          <p className="mt-3 text-sm text-[color:var(--steel-600)]">
            You are signed in as <strong>{me.user?.email}</strong>, but your account is not in a role group yet.
            Ask an administrator to add you to <code>viewer</code>, <code>technician</code> or <code>admin</code>.
          </p>
          <form method="post" action="/auth/logout" className="mt-6">
            <button type="submit" className="bg-[color:var(--ink-950)] text-[color:var(--paper)] text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-sm">Sign out</button>
          </form>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
