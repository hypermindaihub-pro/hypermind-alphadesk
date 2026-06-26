import { getAccessConfig } from "@/lib/access-control";
import { StatusChip } from "@/components/status-chip";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    logged_out?: string;
    next?: string;
    setup?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const access = getAccessConfig();
  const setupRequired = params.setup === "required" || !access.ready;
  const invalid = params.error === "invalid";
  const loggedOut = params.logged_out === "1";
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0d0b] px-4 py-12 text-zinc-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-[#111511] p-6 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Hypermind AlphaDesk
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Private access gate for the trading command center.
            </p>
          </div>
          <StatusChip
            label={setupRequired ? "Setup required" : "Private"}
            tone={setupRequired ? "amber" : "green"}
          />
        </div>

        {setupRequired ? (
          <div className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
            Configure `ALPHADESK_ACCESS_CODE` and `ALPHADESK_SESSION_SECRET` in
            `.env.local`, then restart the dev server. No secret values are shown here.
          </div>
        ) : null}

        {invalid ? (
          <div className="mt-6 rounded-md border border-red-300/25 bg-red-400/10 p-4 text-sm leading-6 text-red-100">
            Invalid access code. The session was not created.
          </div>
        ) : null}

        {loggedOut ? (
          <div className="mt-6 rounded-md border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm leading-6 text-emerald-100">
            Private session closed.
          </div>
        ) : null}

        <form action="/api/auth/login" className="mt-6 space-y-4" method="post">
          <input name="next" type="hidden" value={nextPath} />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Access code
            </span>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none ring-emerald-300/30 transition focus:border-emerald-300/50 focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={setupRequired}
              name="access_code"
              placeholder="Enter private access code"
              type="password"
            />
          </label>
          <button
            className="flex w-full items-center justify-center rounded-md bg-emerald-300 px-4 py-3 text-sm font-bold text-[#07100a] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={setupRequired}
            type="submit"
          >
            Enter private desk
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-zinc-500">
          AlphaDesk stores the session in an HttpOnly cookie. MEXC and OpenAI secrets remain server-side.
        </p>
      </section>
    </main>
  );
}
