"use client";

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Previous</button>
      <span className="text-sm text-slate-600" aria-live="polite">Page {page} of {pages}</span>
      <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Next</button>
    </nav>
  );
}
