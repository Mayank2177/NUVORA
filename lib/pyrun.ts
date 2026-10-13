"use client";

export type PyResult = { out: string[]; error?: string; ms: number };

const BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

const BOOT = [
  "import sys, os, runpy",
  "for _m in [k for k, v in list(sys.modules.items()) if str(getattr(v, '__file__', '') or '').startswith('/work/')]:",
  "    del sys.modules[_m]",
  "sys.path = [p for p in sys.path if not p.startswith('/work/')]",
  "sys.path.insert(0, _dir)",
  "os.chdir(_dir)",
  "runpy.run_path(_dir + '/' + _entry, run_name='__main__')",
].join("\n");

/* Runs in a Web Worker so an infinite loop can be stopped. The runtime loads once and is reused. */
const SRC = `
importScripts(${JSON.stringify(`${BASE}pyodide.js`)});
var lines = [], boot = null, n = 0;
function load() {
  if (!boot) boot = loadPyodide({ indexURL: ${JSON.stringify(BASE)} }).then(function (p) {
    p.setStdout({ batched: function (s) { lines.push(s); } });
    p.setStderr({ batched: function (s) { lines.push(s); } });
    return p;
  });
  return boot;
}
async function exec(p, d) {
  var dir = "/work/r" + (++n), code = "";
  p.FS.mkdirTree(dir);
  Object.keys(d.files).forEach(function (f) {
    var full = dir + "/" + f;
    p.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    p.FS.writeFile(full, d.files[f]);
    if (/\\.py$/.test(f)) code += d.files[f] + "\\n";
  });
  await p.loadPackagesFromImports(code);
  p.globals.set("_dir", dir);
  p.globals.set("_entry", d.entry);
  await p.runPythonAsync(${JSON.stringify(BOOT)});
}
self.onmessage = function (e) {
  var d = e.data, t0 = Date.now();
  lines = [];
  var fail = function (err) {
    self.postMessage({ id: d.id, out: lines, error: String((err && err.message) || err), ms: Date.now() - t0 });
  };
  load().then(
    function (p) {
      exec(p, d).then(function () { self.postMessage({ id: d.id, out: lines, ms: Date.now() - t0 }); }, fail);
    },
    function (err) { boot = null; fail(err); }
  );
};
`;

let worker: Worker | null = null;
let warm = false;
let seq = 0;

export function runPython(files: Record<string, string>, entry: string): Promise<PyResult> {
  return new Promise((resolve) => {
    if (!worker) worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: "text/javascript" })));
    const w = worker;
    const id = ++seq;
    const limit = warm ? 20_000 : 90_000; // the first run also downloads the runtime
    let timer: ReturnType<typeof setTimeout>;

    const stop = () => {
      w.terminate();
      if (worker === w) {
        worker = null;
        warm = false;
      }
    };
    const done = (r: PyResult) => {
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      warm = true;
      done(e.data as PyResult);
    };

    timer = setTimeout(() => {
      stop();
      done({ out: [], error: `Stopped after ${limit / 1000} seconds. Check for an infinite loop, or try again if the first load was slow.`, ms: limit });
    }, limit);
    w.addEventListener("message", onMsg);
    w.onerror = (ev) => {
      stop();
      done({ out: [], error: ev.message || "Python couldn't load. Check your connection and try again.", ms: 0 });
    };
    w.postMessage({ id, files, entry });
  });
}