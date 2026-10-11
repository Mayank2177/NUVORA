"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Eye, EyeOff, Globe, Lock, Pencil, Trash2, } from "lucide-react";
import { useSession } from "@/lib/auth";
import { removeTask, upsertTask, useMarketTasks, type Task } from "@/lib/market";
import { StatusBadge, TaskEditor, type Intent, type TaskFields } from "@/components/task-ui";
import { ReviewPanel } from "@/components/review-panel";
import { Candidates } from "@/components/candidates";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-7"><h2 className="font-semibold">{title}</h2><div className="mt-2 text-slate-700">{children}</div></section>;
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession();
  const tasks = useMarketTasks();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  if (!tasks || !user) return <div className="h-96 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading task" />;

  const task = tasks.find((t) => t.id === id && t.employerId === user.id);
  if (!task) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold">This task isn&apos;t available</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">It may have been deleted, or it belongs to another account.</p>
        <Link href="/employer" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Back to dashboard</Link>
      </div>
    );
  }

  const locked = !["draft", "open"].includes(task.status); // once someone is assigned, the task is fixed
  const put = (next: Task, msg: string) => { if (upsertTask(next)) setFlash(msg); else setFlash("Couldn't save. Your browser storage is full."); };

  function save(f: TaskFields, _intent: Intent) {
    put({ ...task!, ...f }, "Changes saved.");
    setEditing(false);
  }
  const publish = () => put({ ...task, status: "open", publishedAt: task.publishedAt ?? new Date().toISOString() }, "Published. Matching developers can now see it.");
  const unpublish = () => put({ ...task, status: "draft" }, "Unpublished. It's a private draft again.");
  const remove = () => { removeTask(task.id); router.push("/employer"); };

  const fields: TaskFields = { title: task.title, summary: task.summary, requirements: task.requirements, skills: task.skills, complexity: task.complexity, scope: task.scope, acceptance: task.acceptance };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/employer" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Dashboard</Link>

      <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{task.complexity}</span>
          <span className="text-xs text-slate-500">Created {date(task.createdAt)}{task.publishedAt ? ` · published ${date(task.publishedAt)}` : ""}</span>
        </div>

        {editing ? (
          <div className="mt-6">
            <TaskEditor key={task.id} initial={fields} onSave={save} onCancel={() => setEditing(false)} actions={[{ label: "Save changes", intent: "save" }]} />
          </div>
        ) : (
          <>
            <h1 className="mt-4 break-words text-3xl font-semibold">{task.title}</h1>
            <p className="mt-2 text-sm text-slate-500">You wrote &ldquo;{task.rawNeed}&rdquo;</p>
            <p className="mt-5 text-lg leading-relaxed text-slate-700">{task.summary}</p>

            <Block title="Requirements"><ul className="list-disc space-y-1.5 pl-5">{task.requirements.map((r) => <li key={r}>{r}</li>)}</ul></Block>
            <Block title="Skills needed"><ul className="flex flex-wrap gap-2">{task.skills.map((s) => <li key={s} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">{s}</li>)}</ul></Block>
            <Block title="Scope"><p>{task.scope}</p></Block>
            <Block title="Acceptance criteria"><ul className="space-y-2">{task.acceptance.map((a) => <li key={a} className="flex gap-2.5"><Check size={17} className="mt-0.5 shrink-0 text-brand-600" /> {a}</li>)}</ul></Block>

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-6">
              {task.status === "draft" && (
                <button onClick={publish} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"><Globe size={16} /> Publish task</button>
              )}
              {task.status === "open" && (
                <button onClick={unpublish} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><EyeOff size={16} /> Unpublish</button>
              )}
              {!locked && (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><Pencil size={16} /> Edit</button>
              )}
              {!locked && (
                confirmDel ? (
                  <span className="ml-auto flex items-center gap-2 text-sm">
                    <button onClick={remove} className="rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white hover:bg-rose-700">Delete task</button>
                    <button onClick={() => setConfirmDel(false)} className="px-2 py-2 font-medium text-slate-600">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /> Delete</button>
                )
              )}
            </div>
            {locked && <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Lock size={15} /> This task can&apos;t be edited once work has started.</p>}
          </>
        )}
      </motion.article>

      {!editing && task.assigneeId && <ReviewPanel task={task} />}
      {!editing && <Candidates task={task} />}

      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Eye size={16} className="text-emerald-400" /> {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}