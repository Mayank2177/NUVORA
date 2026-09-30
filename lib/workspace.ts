export type Challenge = {
  id: string;
  title: string;
  brief: string;
  files: Record<string, string>;
  solution: Record<string, string>;
  hints: string[];
};

export type RunResult = {
  logs: string[];
  results: { name: string; ok: boolean; error?: string }[];
  fatal?: string;
};

export const CHALLENGES: Challenge[] = [
  {
    id: "slugify",
    title: "Build a slugify function",
    brief: "Turn a title like \"Hello, World!\" into a URL-friendly slug like \"hello-world\". Make all the tests pass.",
    files: {
      "slugify.js": "// Turn \"Hello, World!\" into \"hello-world\"\nfunction slugify(text) {\n  // TODO\n  return text;\n}\n",
      "slugify.test.js": `test("lowercases text", () => {
  expect(slugify("Hello")).toBe("hello");
});

test("replaces spaces with hyphens", () => {
  expect(slugify("hello world")).toBe("hello-world");
});

test("removes punctuation", () => {
  expect(slugify("Hello, World!")).toBe("hello-world");
});

test("trims extra separators", () => {
  expect(slugify("  --Hi there--  ")).toBe("hi-there");
});
`,
    },
    solution: {
      "slugify.js": `// Turn "Hello, World!" into "hello-world"
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
`,
    },
    hints: [
      "Start with the easy part: make the text lowercase and see which tests still fail.",
      "Punctuation and spaces are both \"not letters or numbers\". One regular expression can replace runs of them with a single hyphen.",
      "After replacing, hyphens can be left at the start or end. Strip those with a second replace.",
    ],
  },
  {
    id: "emitter",
    title: "Build a tiny event emitter",
    brief: "Implement on, off and emit so listeners can subscribe to named events.",
    files: {
      "emitter.js": "// Build your own event emitter\nclass Emitter {\n  // TODO: on(event, fn), off(event, fn), emit(event, ...args)\n}\n",
      "emitter.test.js": `test("calls a listener on emit", () => {
  const e = new Emitter();
  let n = 0;
  e.on("hit", () => n++);
  e.emit("hit");
  expect(n).toBe(1);
});

test("passes arguments to listeners", () => {
  const e = new Emitter();
  let got;
  e.on("say", (x) => { got = x; });
  e.emit("say", "hi");
  expect(got).toBe("hi");
});

test("stops calling a listener after off", () => {
  const e = new Emitter();
  let n = 0;
  const f = () => n++;
  e.on("a", f);
  e.off("a", f);
  e.emit("a");
  expect(n).toBe(0);
});

test("emit with no listeners is safe", () => {
  const e = new Emitter();
  e.emit("nothing");
  expect(true).toBe(true);
});
`,
    },
    solution: {
      "emitter.js": `// Build your own event emitter
class Emitter {
  constructor() {
    this.map = {};
  }
  on(event, fn) {
    if (!this.map[event]) this.map[event] = [];
    this.map[event].push(fn);
  }
  off(event, fn) {
    this.map[event] = (this.map[event] || []).filter((f) => f !== fn);
  }
  emit(event, ...args) {
    (this.map[event] || []).forEach((f) => f(...args));
  }
}
`,
    },
    hints: [
      "You need somewhere to keep listeners for each event name. An object of arrays works well.",
      "emit should loop over the listeners for that event, and do nothing if there are none.",
      "off can rebuild the array without the listener you were given.",
    ],
  },
  {
    id: "scratch",
    title: "Scratchpad",
    brief: "Free space to try ideas. Anything you log appears in the output below.",
    files: { "scratch.js": "// Try anything here\nconsole.log(\"Hello from Nuvora\");\n" },
    solution: {},
    hints: [],
  },
];

/* ---------- runner: user code runs in a Web Worker so an infinite loop can be stopped ---------- */

const WORKER = `
self.onmessage = function (e) {
  var logs = [], results = [], tests = [];
  var fmt = function (a) {
    return a.map(function (x) {
      try { return typeof x === "string" ? x : JSON.stringify(x); } catch (err) { return String(x); }
    }).join(" ");
  };
  var fakeConsole = {
    log: function () { logs.push(fmt([].slice.call(arguments))); },
    warn: function () { logs.push(fmt([].slice.call(arguments))); },
    error: function () { logs.push("Error: " + fmt([].slice.call(arguments))); }
  };
  var test = function (name, fn) { tests.push({ name: name, fn: fn }); };
  var show = function (v) { try { return JSON.stringify(v); } catch (err) { return String(v); } };
  var expect = function (v) {
    return {
      toBe: function (x) { if (v !== x) throw new Error("Expected " + show(x) + " but got " + show(v)); },
      toEqual: function (x) { if (show(v) !== show(x)) throw new Error("Expected " + show(x) + " but got " + show(v)); }
    };
  };
  try {
    new Function("console", "test", "expect", e.data.code)(fakeConsole, test, expect);
  } catch (err) {
    self.postMessage({ fatal: String(err && err.message ? err.message : err), logs: logs, results: results });
    return;
  }
  tests.forEach(function (t) {
    try { t.fn(); results.push({ name: t.name, ok: true }); }
    catch (err) { results.push({ name: t.name, ok: false, error: String(err && err.message ? err.message : err) }); }
  });
  self.postMessage({ logs: logs, results: results });
};
`;

/** Solution files first, test files last, so tests can see the code. */
export const bundle = (files: Record<string, string>) =>
  Object.entries(files)
    .sort(([a], [b]) => Number(a.endsWith(".test.js")) - Number(b.endsWith(".test.js")))
    .map(([, code]) => code)
    .join("\n\n");

export function runCode(code: string, ms = 3000): Promise<RunResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    const worker = new Worker(url);
    let timer: ReturnType<typeof setTimeout>;
    const finish = (r: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    timer = setTimeout(() => finish({ logs: [], results: [], fatal: "Timed out after 3 seconds. Check for an infinite loop." }), ms);
    worker.onmessage = (e) => finish(e.data as RunResult);
    worker.onerror = (e) => finish({ logs: [], results: [], fatal: e.message || "The code could not run." });
    worker.postMessage({ code });
  });
}

/* ---------- assistant: a scripted demo. Swap the body for a real model call later. ---------- */

export type AIReply = { text: string; patch?: { file: string; code: string }; hint?: boolean };

export async function askAI(
  prompt: string,
  ctx: { challenge: Challenge; failing: string[]; hintIndex: number },
): Promise<AIReply> {
  await new Promise((r) => setTimeout(r, 600));
  const q = prompt.toLowerCase();
  const { challenge: c, failing, hintIndex } = ctx;

  if (/solution|fix it|write it|answer|implement/.test(q)) {
    const entry = Object.entries(c.solution)[0];
    if (!entry) return { text: "There is no reference solution for this one. Ask me for a hint, or describe what you're trying to do." };
    return {
      text: `Here's a working version of ${entry[0]}. It replaces what you have now, so read it before you apply it. You'll want to be able to explain each line later.`,
      patch: { file: entry[0], code: entry[1] },
    };
  }
  if (/explain|why|fail|wrong|error|broken/.test(q)) {
    return {
      text: failing.length
        ? `These tests are failing:\n${failing.map((f) => `• ${f}`).join("\n")}\n\nPick one, take its input, and trace your code by hand. Where does your result first differ from what the test expects?`
        : "Nothing is failing right now. Run the tests to check your latest change.",
    };
  }
  if (c.hints.length) {
    const i = Math.min(hintIndex, c.hints.length - 1);
    return { text: `Hint ${i + 1} of ${c.hints.length}: ${c.hints[i]}`, hint: true };
  }
  return { text: "I can give hints, explain failing tests, or show a solution. Try one of the buttons above." };
}

/* ---------- persistence ---------- */

export type WsState = {
  challengeId: string;
  code: Record<string, Record<string, string>>;
  aiDirty: boolean; // AI code applied since the last checkpoint
  aiUsed: string[]; // challenges where AI code was applied
};

const key = (pid: string) => `nuvora:workspace:${pid}`;

export function loadWs(pid: string): WsState {
  try {
    const raw = localStorage.getItem(key(pid));
    if (raw) return JSON.parse(raw) as WsState;
  } catch {
    /* fall through to defaults */
  }
  return { challengeId: CHALLENGES[0].id, code: {}, aiDirty: false, aiUsed: [] };
}

export function saveWs(pid: string, s: WsState) {
  try {
    localStorage.setItem(key(pid), JSON.stringify(s));
  } catch {
    /* storage full: keep working in memory */
  }
}