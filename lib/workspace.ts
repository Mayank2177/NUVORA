/* ============ types ============ */

export type WsState = {
  files: Record<string, string>; // path -> content, e.g. "utils/math.js"
  folders: string[]; // explicit folders (so empty folders survive)
  open: string[]; // open tabs
  active: string; // active tab, "" if none
  aiDirty: boolean; // AI code applied since the last checkpoint
  aiFiles: string[]; // files AI code was applied to
};

export type TreeNode = { name: string; path: string; type: "file" | "folder"; children?: TreeNode[] };
export type OpResult = { ok: true; state: WsState; path: string } | { ok: false; error: string };

export type RunResult = {
  logs: string[];
  tests: { name: string; ok: boolean; error?: string }[];
  fatal?: string;
  ms: number;
};

export type Challenge = {
  id: string;
  title: string;
  brief: string;
  files: Record<string, string>;
  solution: Record<string, string>;
  hints: string[];
};

/* ============ starter challenges ============ */

export const CHALLENGES: Challenge[] = [
  {
    id: "slugify",
    title: "Build a slugify function",
    brief: "Turn \"Hello, World!\" into \"hello-world\". Make every test pass.",
    files: {
      "slugify.js": "// Turn \"Hello, World!\" into \"hello-world\"\nexport function slugify(text) {\n  // TODO\n  return text;\n}\n",
      "slugify.test.js": `import { slugify } from "./slugify.js";

test("lowercases text", () => {
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
export function slugify(text) {
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
      "emitter.js": "// Build your own event emitter\nexport class Emitter {\n  // TODO: on(event, fn), off(event, fn), emit(event, ...args)\n}\n",
      "emitter.test.js": `import { Emitter } from "./emitter.js";

test("calls a listener on emit", () => {
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
export class Emitter {
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
];

/* ============ file system helpers (pure) ============ */

export const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);

export function allFolders(s: WsState): Set<string> {
  const set = new Set<string>();
  const add = (path: string) => {
    let cur = path;
    while (cur) {
      set.add(cur);
      cur = parentOf(cur);
    }
  };
  s.folders.forEach(add);
  Object.keys(s.files).forEach((f) => add(parentOf(f)));
  return set;
}

function childNames(s: WsState, parent: string): string[] {
  const names = Object.keys(s.files).filter((p) => parentOf(p) === parent).map(baseOf);
  [...allFolders(s)].filter((f) => parentOf(f) === parent).forEach((f) => names.push(baseOf(f)));
  return names;
}

export function validateName(name: string, siblings: string[]): string | null {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (n.length > 60) return "That name is too long.";
  if (/^\.+$/.test(n)) return "Choose a different name.";
  if (!/^[A-Za-z0-9_.][A-Za-z0-9_. -]*$/.test(n) || /[. ]$/.test(n)) return "Use letters, numbers, dots, dashes and underscores.";
  if (siblings.some((s) => s.toLowerCase() === n.toLowerCase())) return "A file or folder with that name already exists here.";
  return null;
}

export function createEntry(s: WsState, parent: string, name: string, kind: "file" | "folder"): OpResult {
  const error = validateName(name, childNames(s, parent));
  if (error) return { ok: false, error };
  const path = join(parent, name.trim());
  if (kind === "folder") return { ok: true, path, state: { ...s, folders: [...s.folders, path] } };
  return { ok: true, path, state: { ...s, files: { ...s.files, [path]: "" }, open: [...s.open, path], active: path } };
}

export function renameEntry(s: WsState, path: string, newName: string): OpResult {
  const parent = parentOf(path);
  const error = validateName(newName, childNames(s, parent).filter((n) => n !== baseOf(path)));
  if (error) return { ok: false, error };
  const to = join(parent, newName.trim());
  if (to === path) return { ok: true, state: s, path };
  const mv = (p: string) => (p === path ? to : p.startsWith(`${path}/`) ? to + p.slice(path.length) : p);
  return {
    ok: true,
    path: to,
    state: {
      ...s,
      files: Object.fromEntries(Object.entries(s.files).map(([p, c]) => [mv(p), c])),
      folders: s.folders.map(mv),
      open: s.open.map(mv),
      active: mv(s.active),
      aiFiles: s.aiFiles.map(mv),
    },
  };
}

export function removeEntry(s: WsState, path: string): WsState {
  const hit = (p: string) => p === path || p.startsWith(`${path}/`);
  const open = s.open.filter((p) => !hit(p));
  return {
    ...s,
    files: Object.fromEntries(Object.entries(s.files).filter(([p]) => !hit(p))),
    folders: s.folders.filter((p) => !hit(p)),
    open,
    active: hit(s.active) ? open[0] ?? "" : s.active,
    aiFiles: s.aiFiles.filter((p) => !hit(p)),
  };
}

export function buildTree(s: WsState): TreeNode[] {
  const folders = [...allFolders(s)];
  const paths = Object.keys(s.files);
  const level = (parent: string): TreeNode[] => [
    ...folders.filter((f) => parentOf(f) === parent).sort((a, b) => baseOf(a).localeCompare(baseOf(b)))
      .map((f): TreeNode => ({ name: baseOf(f), path: f, type: "folder", children: level(f) })),
    ...paths.filter((p) => parentOf(p) === parent).sort((a, b) => baseOf(a).localeCompare(baseOf(b)))
      .map((p): TreeNode => ({ name: baseOf(p), path: p, type: "file" })),
  ];
  return level("");
}

/* ============ runner ============
   User code runs inside a Web Worker, so an infinite loop can be stopped.
   It supports import/export and require between your own files, async code,
   timers, and test()/expect() for tests. */

const WORKER = String.raw`
function msg(x) { return x && x.message ? String(x.message) : String(x); }
function show(v) {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  if (v instanceof Error) return v.name + ": " + v.message;
  if (typeof v === "function" || typeof v === "symbol") return String(v);
  try { var s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch (err) { return String(v); }
}
function norm(p) {
  var out = [], parts = p.split("/");
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i];
    if (!s || s === ".") continue;
    if (s === "..") out.pop(); else out.push(s);
  }
  return out.join("/");
}
function dirOf(p) { return p.indexOf("/") >= 0 ? p.slice(0, p.lastIndexOf("/")) : ""; }
function def(m) { return m && m.default !== undefined ? m.default : m; }

function transform(src) {
  var exp = [];
  var out = src
    .replace(/^[ \t]*import\s+([\w$]+)\s*,\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/gm, function (m, d, n, p) {
      return "const " + d + " = __def(require('" + p + "')); const {" + n.replace(/\s+as\s+/g, ": ") + "} = require('" + p + "');";
    })
    .replace(/^[ \t]*import\s+\*\s+as\s+([\w$]+)\s+from\s*["']([^"']+)["'];?/gm, function (m, n, p) { return "const " + n + " = require('" + p + "');"; })
    .replace(/^[ \t]*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/gm, function (m, n, p) { return "const {" + n.replace(/\s+as\s+/g, ": ") + "} = require('" + p + "');"; })
    .replace(/^[ \t]*import\s+([\w$]+)\s+from\s*["']([^"']+)["'];?/gm, function (m, n, p) { return "const " + n + " = __def(require('" + p + "'));"; })
    .replace(/^[ \t]*import\s*["']([^"']+)["'];?/gm, function (m, p) { return "require('" + p + "');"; })
    .replace(/^[ \t]*export\s+default\s+/gm, "module.exports.default = ")
    .replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?/gm, function (m, list) {
      list.split(",").forEach(function (item) {
        var parts = item.trim().split(/\s+as\s+/);
        if (parts[0]) exp.push([parts[1] || parts[0], parts[0]]);
      });
      return "";
    })
    .replace(/^[ \t]*export\s+(async\s+function\s*\*?|function\s*\*?|class|const|let|var)\s+([\w$]+)/gm, function (m, kind, name) {
      exp.push([name, name]);
      return kind + " " + name;
    });
  for (var i = 0; i < exp.length; i++) out += "\nmodule.exports." + exp[i][0] + " = " + exp[i][1] + ";";
  return out;
}

function expect(v) {
  var fail = function (m) { throw new Error(m); };
  return {
    toBe: function (x) { if (v !== x) fail("Expected " + show(x) + " but got " + show(v)); },
    toEqual: function (x) { if (show(v) !== show(x)) fail("Expected " + show(x) + " but got " + show(v)); },
    toBeTruthy: function () { if (!v) fail("Expected a truthy value but got " + show(v)); },
    toThrow: function () { var t = false; try { v(); } catch (err) { t = true; } if (!t) fail("Expected the function to throw"); }
  };
}

function run(files, entry) {
  var t0 = Date.now(), logs = [], tests = [], results = [], pending = 0, cache = {}, fatal;
  var line = function (a) { return Array.prototype.map.call(a, show).join(" "); };
  var cons = {
    log: function () { logs.push(line(arguments)); },
    info: function () { logs.push(line(arguments)); },
    warn: function () { logs.push("Warning: " + line(arguments)); },
    error: function () { logs.push("Error: " + line(arguments)); }
  };
  var test = function (name, fn) { tests.push({ name: name, fn: fn }); };
  var timer = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    pending++;
    return setTimeout(function () {
      try { fn.apply(null, args); } catch (err) { logs.push("Error: " + msg(err)); }
      pending--;
    }, ms);
  };
  self.onunhandledrejection = function (ev) { logs.push("Unhandled error: " + msg(ev.reason)); ev.preventDefault(); };

  function resolve(from, spec) {
    if (spec.charAt(0) !== "." && spec.charAt(0) !== "/") throw new Error("Cannot find module '" + spec + "'. Only your own files can be imported here.");
    var base = norm(spec.charAt(0) === "/" ? spec : dirOf(from) + "/" + spec);
    var tries = [base, base + ".js", base + ".mjs", base + "/index.js"];
    for (var i = 0; i < tries.length; i++) if (Object.prototype.hasOwnProperty.call(files, tries[i])) return tries[i];
    throw new Error("Cannot find module '" + spec + "' from " + from);
  }
  function load(path) {
    if (cache[path]) return cache[path].exports;
    var mod = { exports: {} };
    cache[path] = mod;
    if (/\.json$/.test(path)) { mod.exports = JSON.parse(files[path]); return mod.exports; }
    var fn = new Function("module", "exports", "require", "console", "test", "expect", "setTimeout", "__def", transform(files[path]));
    fn(mod, mod.exports, function (s) { return load(resolve(path, s)); }, cons, test, expect, timer, def);
    return mod.exports;
  }
  function wait() { return new Promise(function (r) { setTimeout(r, 15); }); }
  function settle() {
    var start = Date.now();
    function step() { return pending > 0 && Date.now() - start < 2500 ? wait().then(step) : wait(); }
    return step();
  }

  try { load(entry); } catch (err) { fatal = msg(err); }
  return settle().then(function () {
    var chain = Promise.resolve();
    tests.forEach(function (t) {
      chain = chain.then(function () {
        return Promise.resolve().then(t.fn).then(
          function () { results.push({ name: t.name, ok: true }); },
          function (err) { results.push({ name: t.name, ok: false, error: msg(err) }); }
        );
      });
    });
    return chain;
  }).then(function () { return { logs: logs, tests: results, fatal: fatal, ms: Date.now() - t0 }; });
}

self.onmessage = function (e) {
  run(e.data.files, e.data.entry).then(
    function (r) { self.postMessage(r); },
    function (err) { self.postMessage({ logs: [], tests: [], fatal: msg(err), ms: 0 }); }
  );
};
`;

export function runProject(files: Record<string, string>, entry: string, ms = 6000): Promise<RunResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    const worker = new Worker(url);
    const finish = (r: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ logs: [], tests: [], fatal: `Stopped after ${ms / 1000} seconds. Check for an infinite loop.`, ms }),
      ms,
    );
    worker.onmessage = (e) => finish(e.data as RunResult);
    worker.onerror = (e) => finish({ logs: [], tests: [], fatal: e.message || "The code could not run.", ms: 0 });
    worker.postMessage({ files, entry });
  });
}

/* ============ assistant (scripted demo: swap the body for a real model call later) ============ */

export type AIReply = { text: string; patch?: { file: string; code: string }; hint?: boolean };

export async function askAI(
  prompt: string,
  ctx: { challenge?: Challenge; failing: string[]; error?: string; hintIndex: number },
): Promise<AIReply> {
  await new Promise((r) => setTimeout(r, 600));
  const q = prompt.toLowerCase();
  const { challenge: c, failing, error, hintIndex } = ctx;

  if (/solution|fix it|write it|answer|implement/.test(q)) {
    const entry = c && Object.entries(c.solution)[0];
    if (!entry) return { text: "I can show a full solution for the starter challenges. Add one from the Starters menu, open its file, and ask again." };
    return {
      text: `Here's a working ${entry[0]}. Applying it replaces what's in the file, so read it first. You should be able to explain every line later.`,
      patch: { file: entry[0], code: entry[1] },
    };
  }
  if (/explain|why|fail|wrong|error|broken/.test(q)) {
    if (error) return { text: `Your code stopped with:\n${error}\n\nFind the line that error points at, and check the names and values it uses. Does each one exist where you use it?` };
    if (failing.length) return { text: `These tests are failing:\n${failing.map((f) => `• ${f}`).join("\n")}\n\nPick one, take its input, and trace your code by hand. Where does your result first differ from what the test expects?` };
    return { text: "Nothing is failing right now. Run the open file to check your latest change." };
  }
  if (c?.hints.length) {
    const i = Math.min(hintIndex, c.hints.length - 1);
    return { text: `Hint ${i + 1} of ${c.hints.length}: ${c.hints[i]}`, hint: true };
  }
  return { text: "Tip: break the problem into one small function, log its result with console.log, then build on it. Add a starter challenge to get step-by-step hints." };
}

/* ============ persistence ============ */

const key = (pid: string) => `nuvora:workspace2:${pid}`;

export const defaultWs = (): WsState => ({
  files: {
    "README.md": "# My workspace\n\nCreate files and folders in the explorer, write JavaScript, and press Run (Ctrl/Cmd + Enter).\n\n- console.log output appears in the panel below.\n- Import your own files with import or require.\n- Name a file something.test.js and use test() and expect() to write tests.\n",
    "index.js": "import { add } from \"./utils/math.js\";\n\nconsole.log(\"2 + 3 =\", add(2, 3));\n",
    "utils/math.js": "export function add(a, b) {\n  return a + b;\n}\n",
  },
  folders: ["utils"],
  open: ["index.js"],
  active: "index.js",
  aiDirty: false,
  aiFiles: [],
});

export function loadWs(pid: string): WsState {
  try {
    const raw = localStorage.getItem(key(pid));
    if (raw) {
      const s = JSON.parse(raw) as WsState;
      if (s && typeof s.files === "object" && Array.isArray(s.open)) return { ...defaultWs(), ...s };
    }
  } catch {
    /* fall through to defaults */
  }
  return defaultWs();
}

export function saveWs(pid: string, s: WsState) {
  try {
    localStorage.setItem(key(pid), JSON.stringify(s));
  } catch {
    /* storage full: keep working in memory */
  }
}