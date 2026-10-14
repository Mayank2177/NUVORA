"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { completeGitHubSignIn, AuthError } from "@/lib/auth";
import { homeFor } from "@/lib/market";

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<LoadingView />}>
      <GitHubCallback />
    </Suspense>
  );
}

function GitHubCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(() => errorParam ? "GitHub authentication was cancelled or failed. Please try again." : null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (callback: () => void) => timers.push(setTimeout(callback, 3000));
    const showError = (message: string) => timers.push(setTimeout(() => setError(message), 0));
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    // Check for OAuth errors
    if (errorParam) {
      schedule(() => {
        const returnTo = sessionStorage.getItem("github-return-to") || "/login";
        router.push(returnTo);
      });
      return;
    }

    // Validate state (CSRF protection)
    const savedState = sessionStorage.getItem("github-oauth-state");
    if (!state || !savedState || state !== savedState) {
      showError("Invalid authentication state. Please try again.");
      schedule(() => router.push("/login"));
      return;
    }

    if (!code) {
      showError("No authorization code received. Please try again.");
      schedule(() => router.push("/login"));
      return;
    }

    // Complete the OAuth flow
    completeGitHubSignIn(code, state)
      .then((user) => {
        // Clean up
        sessionStorage.removeItem("github-oauth-state");
        sessionStorage.removeItem("github-return-to");
        
        // Redirect to appropriate page
        homeFor(user).then((route) => router.push(route));
      })
      .catch((err) => {
        if (err instanceof AuthError && err.code === "mfa") {
          sessionStorage.removeItem("github-oauth-state");
          sessionStorage.removeItem("github-return-to");
          router.replace("/login/mfa");
          return;
        }
        const message = err instanceof AuthError 
          ? err.message 
          : "Authentication failed. Please try again.";
        setError(message);
        schedule(() => {
          const returnTo = sessionStorage.getItem("github-return-to") || "/login";
          router.push(returnTo);
        });
      });
    return () => timers.forEach(clearTimeout);
  }, [searchParams, router, errorParam]);

  if (error) {
    return <ErrorView message={error} />;
  }

  return <LoadingView />;
}

function LoadingView() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 size={40} className="mx-auto animate-spin text-brand-600" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Completing authentication...
        </h1>
        <p className="mt-2 text-slate-600">
          Please wait while we sign you in with GitHub.
        </p>
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle size={32} />
        </div>
        <h1 className="mt-6 text-xl font-semibold text-slate-900">
          Authentication failed
        </h1>
        <p className="mt-2 text-slate-600">{message}</p>
        <p className="mt-4 text-sm text-slate-500">
          Redirecting you back...
        </p>
      </div>
    </div>
  );
}
