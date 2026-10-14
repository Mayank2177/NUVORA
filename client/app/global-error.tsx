"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-white p-6 text-slate-900">
        <main className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-slate-600">Try loading the page again.</p>
          <button onClick={reset} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white">Try again</button>
        </main>
      </body>
    </html>
  );
}
