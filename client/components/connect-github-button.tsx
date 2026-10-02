"use client";

import { useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

const AUTHORIZE_PREFIX = "https://github.com/login/oauth/authorize?";

export function ConnectGithubButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { authorizeUrl } = await api.github.authorize();
      // Defensive: only ever navigate to GitHub's authorize endpoint
      if (!authorizeUrl.startsWith(AUTHORIZE_PREFIX)) throw new Error("Unexpected authorization URL.");
      window.location.assign(authorizeUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start GitHub connection.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={connect} disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />} Connect GitHub
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
