"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Opened from the team-invite and password-reset emails
// (/set-password?token_hash=…&type=invite|recovery|magiclink). Verifies the
// one-time token, then lets the person choose a password (and, when joining,
// their name), and sends them into the operator app.

type LinkType = "invite" | "recovery" | "magiclink";

function SetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tokenHash = params.get("token_hash") ?? "";
  const rawType = params.get("type");
  const type: LinkType | null = rawType === "invite" || rawType === "recovery" || rawType === "magiclink" ? rawType : null;

  const [stage, setStage] = useState<"verifying" | "form" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenHash || !type) {
        setError("This link is incomplete. Open it again from the email, or ask for a new one.");
        setStage("error");
        return;
      }
      const { data, error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (cancelled) return;
      if (err || !data.session) {
        setError("This link has expired or has already been used. Ask your admin to resend the invite, or use \"Forgot password?\" on the sign-in screen.");
        setStage("error");
        return;
      }
      if (type === "magiclink") {
        router.replace("/operator/today");
        return;
      }
      const meta = (data.user?.user_metadata ?? {}) as Record<string, string>;
      setNeedsName(!(meta.full_name || meta.name));
      setStage("form");
    })();
    return () => { cancelled = true; };
  }, [tokenHash, type, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return setError("Use at least 8 characters, with a letter and a number.");
    if (pw !== pw2) return setError("The passwords don't match.");
    setBusy(true);
    const update: { password: string; data?: Record<string, string> } = { password: pw };
    if (needsName && name.trim()) update.data = { full_name: name.trim().slice(0, 80) };
    const { error: err } = await supabase.auth.updateUser(update);
    setBusy(false);
    if (err) return setError(err.message);
    router.replace("/operator/today");
  }

  const input = "mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33] outline-none focus:border-amber-400/60";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020813] px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Operator app</p>
        {stage === "verifying" && <p className="mt-4 text-sm text-slate-600">Checking your link…</p>}
        {stage === "error" && (
          <>
            <h1 className="mt-2 text-xl font-semibold text-[#0F1B33]">Link not valid</h1>
            <p role="alert" className="mt-3 text-sm text-slate-600">{error}</p>
            <a href="/operator/today" className="mt-5 block rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-medium text-slate-700">Go to sign in</a>
          </>
        )}
        {stage === "form" && (
          <form onSubmit={submit} className="mt-2 space-y-4">
            <h1 className="text-xl font-semibold text-[#0F1B33]">{type === "invite" ? "Welcome — set your password" : "Choose a new password"}</h1>
            {needsName && (
              <label className="block text-xs font-medium text-slate-600">Your name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
              </label>
            )}
            <label className="block text-xs font-medium text-slate-600">New password
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters, a letter and a number" className={input} />
            </label>
            <label className="block text-xs font-medium text-slate-600">Confirm password
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className={input} />
            </label>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50">
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return <Suspense fallback={null}><SetPasswordContent /></Suspense>;
}
