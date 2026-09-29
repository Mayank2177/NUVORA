"use client";

import { useEffect, useState } from "react";
import type { Stage } from "@/lib/store";

export type Task = {
  id: string;
  title: string;
  stage: Stage;
  done: boolean;
  createdAt: string;
  doneAt?: string;
};

/** Entry question, suggested tasks and exit condition for every journey stage. */
export const STAGE_INFO: Record<Stage, { question: string; tasks: string[]; exit: string }> = {
  Think: { question: "What am I trying to build, and for whom?", tasks: ["Write the project goal", "List your constraints", "Name your target users"], exit: "Goal and users are written down." },
  Learn: { question: "What do I need to understand first?", tasks: ["Pick one course or doc to follow", "Write down the key takeaways"], exit: "You can explain the concept in your own words." },
  Practice: { question: "Can I use it on a small problem?", tasks: ["Complete one practice exercise", "Save your solution"], exit: "One working practice solution is on record." },
  "Get unstuck": { question: "What is blocking me, and what have I tried?", tasks: ["Log the blocker", "Record what you have tried", "Write down the fix"], exit: "The blocker is resolved and the fix is recorded." },
  Prototype: { question: "What is the simplest version I can show?", tasks: ["Sketch the main flow", "Record one design decision"], exit: "A prototype or design exists." },
  Build: { question: "Is the real thing taking shape?", tasks: ["Commit your work regularly", "Open a pull request", "Add tests for the core feature"], exit: "A working feature is merged." },
  Validate: { question: "Does it actually work?", tasks: ["Run your tests", "Ask someone to try it"], exit: "Tests pass or feedback is attached." },
  Document: { question: "Can someone else follow what I did?", tasks: ["Capture screenshots", "Write a short README"], exit: "Visuals and notes are attached." },
  Publish: { question: "What am I ready to share?", tasks: ["Choose which evidence goes public", "Review your project story", "Publish the page"], exit: "The project page is live." },
  Demonstrate: { question: "How do I show it to others?", tasks: ["Share your project page", "Record a short walkthrough"], exit: "Someone outside the team has seen it." },
  Opportunity: { question: "Where can this evidence help me?", tasks: ["Pick an application or opportunity", "Adapt your story for it"], exit: "Your evidence is used in an application." },
  Contribution: { question: "What can I give back?", tasks: ["Share what you learned", "Help someone starting out"], exit: "A contribution is credited to you." },
};

const EVENT = "nuvora:tasks";
const key = (pid: string) => `nuvora:tasks:${pid}`;
const uid = () => crypto.randomUUID();

function read(pid: string): Task[] | null {
  try {
    const raw = localStorage.getItem(key(pid));
    return raw ? (JSON.parse(raw) as Task[]) : null;
  } catch {
    return null;
  }
}

function write(pid: string, tasks: Task[]) {
  localStorage.setItem(key(pid), JSON.stringify(tasks));
  window.dispatchEvent(new Event(EVENT));
}

const make = (title: string, stage: Stage): Task => ({ id: uid(), title, stage, done: false, createdAt: new Date().toISOString() });

export function useTasks(pid: string | undefined, stage: Stage | undefined) {
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    if (!pid || !stage) {
      setTasks(null);
      return;
    }
    const sync = () => {
      let t = read(pid);
      if (!t) {
        t = STAGE_INFO[stage].tasks.map((title) => make(title, stage)); // first visit: start with this stage's suggestions
        write(pid, t);
      }
      setTasks(t);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [pid, stage]);

  const mutate = (fn: (t: Task[]) => Task[]) => {
    if (pid) write(pid, fn(read(pid) ?? []));
  };

  return {
    tasks,
    addTask: (title: string, s: Stage) => mutate((t) => [...t, make(title, s)]),
    toggleTask: (id: string) =>
      mutate((t) =>
        t.map((x) => (x.id === id ? { ...x, done: !x.done, doneAt: x.done ? undefined : new Date().toISOString() } : x)),
      ),
    removeTask: (id: string) => mutate((t) => t.filter((x) => x.id !== id)),
  };
}