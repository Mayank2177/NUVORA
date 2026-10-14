"use client";

import "@xterm/xterm/css/xterm.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { WebContainer } from "@webcontainer/api";

export type TerminalHandle = { run: (cmd: string) => void; interrupt: () => void };

export const TerminalPane = forwardRef<TerminalHandle, { wc: WebContainer }>(function TerminalPane({ wc }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<WritableStreamDefaultWriter<string> | null>(null);

  useImperativeHandle(ref, () => ({
    run(cmd) {
      const w = input.current;
      if (!w) return;
      void w.write("\x03"); // stop whatever is running first
      setTimeout(() => void w.write(`${cmd}\r`), 80);
    },
    interrupt() {
      void input.current?.write("\x03");
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (cancelled || !host.current) return;

      const term = new Terminal({
        fontSize: 12, cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        theme: { background: "#0f172a", foreground: "#e2e8f0" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();

      const shell = await wc.spawn("jsh", { terminal: { cols: term.cols, rows: term.rows } });
      if (cancelled) {
        shell.kill();
        term.dispose();
        return;
      }
      shell.output.pipeTo(new WritableStream({ write(d) { term.write(d); } }));
      const writer = shell.input.getWriter();
      input.current = writer;
      const sub = term.onData((d) => { void writer.write(d); });
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
          shell.resize({ cols: term.cols, rows: term.rows });
        } catch {
          /* hidden or zero-sized */
        }
      });
      ro.observe(host.current);

      cleanup = () => {
        ro.disconnect();
        sub.dispose();
        input.current = null;
        shell.kill();
        term.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [wc]);

  return <div ref={host} role="region" aria-label="Terminal" className="h-full w-full overflow-hidden bg-slate-900 p-2" />;
});