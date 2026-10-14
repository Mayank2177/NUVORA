export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Loading page">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="h-32 rounded-2xl bg-slate-100" />
      <div className="h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}
