"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";

const REASONS: Record<string, string> = {
  denied: "You cancelled the GitHub authorization.",
  invalid_state: "That connection link expired. Please try again.",
  exchange_failed: "GitHub did not complete the connection. Please try again.",
};

function Notice() {
  const params = useSearchParams();
  const status = params.get("github");
  if (status !== "connected" && status !== "error") return null;

  const ok = status === "connected";
  const text = ok ? "GitHub connected." : REASONS[params.get("reason") ?? ""] ?? "Could not connect GitHub.";

  return (
    <div role={ok ? "status" : "alert"}
      className={`flex items-center gap-2.5 rounded-2xl p-4 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
      {ok ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="flex-1">{text}</span>
      <Link href="/build" className="font-semibold hover:underline">Dismiss</Link>
    </div>
  );
}

export function GithubNotice() {
  return <Suspense fallback={null}><Notice /></Suspense>;
}