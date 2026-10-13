const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

function norm(path: string) {
  const out: string[] = [];
  for (const s of path.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

function local(from: string, ref: string, files: Record<string, string>): string | null {
  const r = ref.trim().split(/[?#]/)[0];
  if (!r || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(r)) return null; // absolute URLs stay as they are
  const p = norm(r.startsWith("/") ? r : `${dirOf(from)}/${r}`);
  return p in files ? p : null;
}

/* Sends console output and errors from the preview to the Output tab. */
const BRIDGE =
  '<script>(function(){function s(l,a){try{parent.postMessage({nuvora:"console",level:l,text:Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}' +
  '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);o.apply(console,arguments)}});' +
  'window.addEventListener("error",function(e){s("error",[e.message])});' +
  'window.addEventListener("unhandledrejection",function(e){s("error",["Unhandled promise rejection: "+(e.reason&&e.reason.message||e.reason)])})})()</script>';

/** Builds one self-contained page from an HTML file, inlining the CSS and scripts it links to. */
export function buildPage(files: Record<string, string>, htmlPath: string): string {
  let html = files[htmlPath] ?? "";

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const p = href ? local(htmlPath, href, files) : null;
    return p ? `<style>\n${files[p].replace(/<\/style/gi, "<\\/style")}\n</style>` : tag;
  });

  html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a: string, src: string, b: string) => {
    const p = local(htmlPath, src, files);
    if (!p) return tag;
    const attrs = `${a} ${b}`.replace(/\s+/g, " ").trim();
    return `<script${attrs ? ` ${attrs}` : ""}>\n${files[p].replace(/<\/script/gi, "<\\/script")}\n</script>`;
  });

  for (const re of [/<head[^>]*>/i, /<html[^>]*>/i]) {
    if (re.test(html)) return html.replace(re, (m) => m + BRIDGE);
  }
  return BRIDGE + html;
}