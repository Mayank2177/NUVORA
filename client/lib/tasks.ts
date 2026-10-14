"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
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

type ApiTask = {
  id: string;
  project_id: string;
  title: string;
  stage: Stage;
  done: boolean;
  created_at: string;
  done_at?: string;
};

type TaskListResponse = {
  tasks: ApiTask[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

function toFrontendTask(apiTask: ApiTask): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    stage: apiTask.stage,
    done: apiTask.done,
    createdAt: apiTask.created_at,
    doneAt: apiTask.done_at,
  };
}

const EVENT = "nuvora:tasks";

function notifyChange() {
  window.dispatchEvent(new Event(EVENT));
}

export function useTasks(pid: string | undefined, stage: Stage | undefined) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!pid) {
      setTasks(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get<TaskListResponse>(`/api/projects/${pid}/tasks?limit=100&order=desc`);
      const fetchedTasks = response.tasks.map(toFrontendTask);
      
      // Auto-seed with suggested tasks if empty and we have a stage
      if (fetchedTasks.length === 0 && stage) {
        const suggested = STAGE_INFO[stage].tasks;
        for (const title of suggested) {
          await api.post(`/api/projects/${pid}/tasks`, { title, stage });
        }
        // Refetch after seeding
        const refetch = await api.get<TaskListResponse>(`/api/projects/${pid}/tasks?limit=100&order=desc`);
        setTasks(refetch.tasks.map(toFrontendTask));
      } else {
        setTasks(fetchedTasks);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [pid, stage]);

  useEffect(() => {
    void Promise.resolve().then(fetchTasks);
    
    const handleEvent = () => {
      fetchTasks();
    };

    window.addEventListener(EVENT, handleEvent);
    return () => {
      window.removeEventListener(EVENT, handleEvent);
    };
  }, [fetchTasks]);

  const addTask = useCallback(
    async (title: string, s: Stage) => {
      if (!pid) return;

      const tempTask: Task = {
        id: crypto.randomUUID(),
        title,
        stage: s,
        done: false,
        createdAt: new Date().toISOString(),
      };

      setTasks(prev => prev ? [...prev, tempTask] : [tempTask]);

      try {
        const response = await api.post<{ task: ApiTask }>(`/api/projects/${pid}/tasks`, { title, stage: s });
        setTasks(prev => prev ? prev.map(t => t.id === tempTask.id ? toFrontendTask(response.task) : t) : [toFrontendTask(response.task)]);
        notifyChange();
      } catch (error) {
        console.error("Failed to add task:", error);
        fetchTasks();
      }
    },
    [pid, fetchTasks],
  );

  const toggleTask = useCallback(
    async (id: string) => {
      if (!pid) return;

      setTasks(prev => prev ? prev.map(x => 
        x.id === id ? { ...x, done: !x.done, doneAt: x.done ? undefined : new Date().toISOString() } : x
      ) : null);

      try {
        await api.patch(`/api/tasks/${id}/toggle`, {});
        notifyChange();
      } catch (error) {
        console.error("Failed to toggle task:", error);
        fetchTasks();
      }
    },
    [pid, fetchTasks],
  );

  const removeTask = useCallback(
    async (id: string) => {
      if (!pid) return;

      setTasks(prev => prev ? prev.filter(x => x.id !== id) : null);

      try {
        await api.delete(`/api/projects/${pid}/tasks/${id}`);
        notifyChange();
      } catch (error) {
        console.error("Failed to remove task:", error);
        fetchTasks();
      }
    },
    [pid, fetchTasks],
  );

  return {
    tasks,
    loading,
    addTask,
    toggleTask,
    removeTask,
    refresh: fetchTasks,
  };
}
