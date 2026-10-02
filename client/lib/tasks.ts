"use client";

import { useEffect, useState } from "react";
import type { Stage } from "@/lib/store";
import { api, fromApiStage } from "@/lib/api-client";

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

const fromApiTask = (raw: unknown): Task => {
  const t = raw as Record<string, unknown>;
  return { id: String(t.id ?? ""), title: String(t.title ?? ""), stage: fromApiStage(String(t.stage ?? "Idea")) as Stage,
    done: Boolean(t.done), createdAt: String(t.created_at ?? t.createdAt ?? ""), doneAt: typeof (t.done_at ?? t.doneAt) === "string" ? String(t.done_at ?? t.doneAt) : undefined };
};

export function useTasks(pid: string | undefined, stage: Stage | undefined) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!pid || !stage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasks(null);
      return;
    }
    let cancelled = false;
    setTasks(null);
    api.tasks.list(pid).then(({ tasks }) => {
      if (!cancelled) setTasks(tasks.map(fromApiTask));
    }).catch((error) => { console.error("Could not load tasks from the API", error); if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [pid, stage, reload]);

  const mutate = async (fn: () => Promise<unknown>) => { await fn(); setReload((r) => r + 1); };

  return {
    tasks,
    addTask: (title: string, s: Stage) => mutate(() => api.tasks.create(pid!, { title, stage: s })),
    toggleTask: (id: string) => mutate(() => api.tasks.toggle(id)),
    removeTask: (id: string) => mutate(() => api.tasks.delete(id)),
  };
}


