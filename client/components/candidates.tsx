"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Info, Users } from "lucide-react";
import { assignFromInterest, cancelInvite, inviteDeveloper, latestOffer, useOffers, type Offer } from "@/lib/offers";
import { listDevelopers, loadPrep, matchTask, type Dev, type Match } from "@/lib/matching";
import type { Task } from "@/lib/market";
import { LABEL_STYLE, ScoreRing } from "@/components/match-ui";

export function OfferAction({ taskId, dev, offer, open }: { taskId: string; dev: { id: string; name: string }; offer?: Offer; open: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const run = async (fn: () => Promise<string | null>) => {
    setError((await fn()) ?? "");
    setConfirm(false);
  };
  const dark = "rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600";

  let body: React.ReactNode;
  if (offer?.status === "accepted") {
    body = <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">Assigned</span>;
  } else if (offer?.status === "pending" && offer.origin === "interest") {
    body = confirm ? (
      <>
        <button onClick={() => run(() => assignFromInterest(offer.id))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Confirm assign</button>
        <button onClick={() => setConfirm(false)} className="px-2 py-2 text-sm font-medium text-slate-600">Cancel</button>
      </>
    ) : (
      <button onClick={() => setConfirm(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">Assign</button>
    );
  } else if (offer?.status === "pending" && offer.origin === "invite") {
    body = (
      <>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">Invited</span>
        <button onClick={() => run(() => cancelInvite(offer.id))} className="px-2 py-2 text-sm font-medium text-slate-600 hover:text-rose-600">Cancel invite</button>
      </>
    );
  } else {
    body = <button onClick={() => run(() => inviteDeveloper(taskId, dev))} className={dark}>{offer?.status === "declined" ? "Invite again" : "Invite"}</button>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">{body}</div>
      {error && <p role="alert" className="flex items-center gap-1 text-xs text-rose-600"><AlertCircle size={12} /> {error}</p>}
    </div>
  );
}

export function Candidates({ task }: { task: Task }) {
  const offers = useOffers();
  type Row = { dev: Dev; m: Match; offer?: Offer };
  const [rows, setRows] = useState<Row[] | null>(null);
  const currentRows = offers === undefined ? null : rows;

  useEffect(() => {
    if (!offers) return;
    let active = true;
    void (async () => {
      const taskOffers = offers.filter((o) => o.taskId === task.id);
      const developers = await listDevelopers(task.id);
      const eligible = developers.filter((d) => d.rec.openToWork || taskOffers.some((o) => o.devId === d.userId && (o.status === "pending" || o.status === "accepted")));
      const candidates = await Promise.all(eligible.map(async (dev) => ({
        dev,
        m: matchTask(task, await loadPrep(dev.userId), dev.rec.skills.map((s) => s.name), true),
        offer: latestOffer(offers, task.id, dev.userId),
      })));
      if (active) setRows(candidates.filter((r) => r.m.score > 0 || r.offer)
        .sort((a, b) => Number(b.offer?.origin === "interest" && b.offer.status === "pending") - Number(a.offer?.origin === "interest" && a.offer.status === "pending") || b.m.score - a.m.score));
    })();
    return () => { active = false; };
  }, [offers, task]);

  const open = task.status === "open";
  const assignee = task.assigneeId ? currentRows?.find((r) => r.dev.userId === task.assigneeId) : undefined;

  return (
    <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8" aria-label="Candidates">
      <h2 className="flex items-center gap-2 font-semibold"><Users size={18} className="text-brand-600" /> {task.assigneeId ? "Assigned developer" : "Candidates"}</h2>

      {task.status === "draft" && <p className="mt-3 text-sm text-slate-600">Publish this task to find matching developers.</p>}

            {task.assigneeId && (
        <p className="mt-3 text-sm text-slate-700">
          {assignee ? <>Assigned to <span className="font-semibold">{assignee.dev.name}</span>.</> : "A developer is assigned."}{" "}
          Their submission and your review appear above.
        </p>
      )}

      {open && !currentRows && <p className="mt-3 text-sm text-slate-500">Loading candidates…</p>}
      {open && currentRows && currentRows.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No developers match yet. Only developers who chose to be discoverable appear here, and anyone can show interest in an open task.</p>
      )}

      {open && currentRows && currentRows.length > 0 && (
        <>
          <ul className="mt-4 space-y-3">
            {currentRows.map(({ dev, m, offer }) => {
              const initials = dev.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
              const interested = offer?.origin === "interest" && offer.status === "pending";
              return (
                <li key={dev.userId} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 p-4">
                  <ScoreRing score={m.score} size={56} />
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-hidden>{initials}</span>
                      <span className="font-semibold">{dev.name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLE[m.label]}`}>{m.label} match</span>
                      {interested && <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">Interested</span>}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">
                      {m.strong.length ? `Strong in ${m.strong.join(", ")}` : "No skill at L3 yet"}
                      {m.gaps.length ? ` · gaps: ${m.gaps.join(", ")}` : ""}
                    </p>
                    <Link href={`/employer/developers/${dev.userId}?task=${task.id}`} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">View developer <ArrowRight size={13} /></Link>
                  </div>
                  <OfferAction taskId={task.id} dev={{ id: dev.userId, name: dev.name }} offer={offer} open={open} />
                </li>
              );
            })}
          </ul>
          <p className="mt-4 flex gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <Info size={15} className="mt-0.5 shrink-0" />
            Scores come from evidence each developer chose to make public, using a transparent rule, not an AI. Developers who aren&apos;t discoverable only appear if they show interest in this task.
          </p>
        </>
      )}
    </section>
  );
}
