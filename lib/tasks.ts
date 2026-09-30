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
export const STAGE_INFO: Record<Stage, { question: string; tasks: string[]; exit: string; tool: string }> = {
  Idea: { question: "What problem am I solving, and for whom?", tasks: ["Write the problem in one sentence", "Name who has it", "List your constraints"], exit: "The problem and the people are written down.", tool: "Nuvora" },
  "Problem solving": { question: "Can I break this into parts I can solve?", tasks: ["Split the problem into sub-problems", "Solve one similar puzzle"], exit: "You have a plan you can explain.", tool: "AoPS" },
  Research: { question: "What already exists, and what can I learn from it?", tasks: ["Read about the problem area", "Find two similar projects", "Note what you'll do differently"], exit: "You can describe the landscape in a paragraph.", tool: "Wikipedia, GitHub" },
  Learn: { question: "What do I need to understand first?", tasks: ["Pick one course to follow", "Write down the key takeaways"], exit: "You can explain the concept in your own words.", tool: "freeCodeCamp" },
  Practice: { question: "Can I apply it on a small exercise?", tasks: ["Complete one guided challenge", "Save your solution"], exit: "One working practice solution is on record.", tool: "CodeCrafters" },
  Prototype: { question: "What is the simplest version I can show?", tasks: ["Sketch the main flow", "Record one design decision"], exit: "A prototype or wireframe exists.", tool: "Balsamiq" },
  Build: { question: "Is the real thing taking shape?", tasks: ["Commit your work regularly", "Open a pull request", "Add tests for the core feature"], exit: "A working feature is merged.", tool: "DevSwarm" },
  Validate: { question: "Does it actually work?", tasks: ["Run your tests", "Test your API", "Ask someone to try it"], exit: "Tests pass or feedback is attached.", tool: "GitHub, Postman" },
  Document: { question: "Can someone else follow what I did?", tasks: ["Capture screenshots", "Write a short README"], exit: "Visuals and notes are attached.", tool: "CleanShot X" },
  Publish: { question: "What am I ready to share?", tasks: ["Choose which evidence goes public", "Review your project story", "Publish the page"], exit: "The project page is live.", tool: ".xyz domain" },
  Portfolio: { question: "Is my best work easy to find in one place?", tasks: ["Pin the project on your profile", "Write a short summary"], exit: "The project is in your portfolio.", tool: "GitHub" },
  Demonstrate: { question: "Can I show what I can do?", tasks: ["Walk someone through the project", "Practise explaining your decisions"], exit: "Someone outside the team has seen it.", tool: "InterviewBuddy" },
  Opportunity: { question: "Where can this evidence help me?", tasks: ["Pick a role or opportunity", "Adapt your story for it"], exit: "Your evidence is used in an application.", tool: "LinkedIn, Wellfound" },
  Contribution: { question: "What can I give back?", tasks: ["Share what you learned", "Help someone starting out"], exit: "A contribution is credited to you.", tool: "Open source, community" },
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