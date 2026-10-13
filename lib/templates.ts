export type Template = { id: string; name: string; blurb: string; open: string; next: string; files: Record<string, string> };

export const TEMPLATES: Template[] = [
  {
    id: "html", name: "HTML, CSS and JavaScript", blurb: "A static page. Press Run to preview it.", open: "index.html",
    next: "Press Run to see the page.",
    files: {
      "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>Hello, world</h1>
      <p>You clicked <span id="count">0</span> times.</p>
      <button id="btn">Click me</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
      "style.css": `body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
main { text-align: center; }
button { padding: 0.6rem 1.2rem; border: 0; border-radius: 999px; background: #0f172a; color: white; font-size: 1rem; cursor: pointer; }
button:hover { background: #3d54f0; }
`,
      "script.js": `let count = 0;
document.getElementById("btn").addEventListener("click", () => {
  count += 1;
  document.getElementById("count").textContent = count;
  console.log("Clicked", count, "times");
});
`,
    },
  },
  {
    id: "node", name: "Node script", blurb: "A plain Node program that runs in the terminal.", open: "index.js",
    next: "Press Run, or type node index.js in the terminal.",
    files: {
      "package.json": JSON.stringify({ name: "node-app", version: "1.0.0", scripts: { start: "node index.js" } }, null, 2) + "\n",
      "index.js": `const names = ["Ada", "Grace", "Linus"];

for (const name of names) {
  console.log(\`Hello, \${name}!\`);
}
`,
    },
  },
  {
    id: "express", name: "Express server", blurb: "A small web API. Install, start, and see it in the preview.", open: "server.js",
    next: "Press npm install, then npm start. The server appears in the Preview pane.",
    files: {
      "package.json": JSON.stringify({ name: "express-app", version: "1.0.0", scripts: { start: "node server.js" }, dependencies: { express: "^4.19.2" } }, null, 2) + "\n",
      "server.js": `const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("<h1>Hello from Express</h1><p>Try <a href='/api/hello'>/api/hello</a></p>");
});

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from the API" });
});

app.listen(3000, () => console.log("Listening on http://localhost:3000"));
`,
    },
  },
  {
    id: "vite", name: "React with Vite", blurb: "A React app with a live dev server.", open: "src/App.jsx",
    next: "Press npm install, then npm run dev. The app appears in the Preview pane.",
    files: {
      "package.json": JSON.stringify({
        name: "vite-react-app", private: true, type: "module", scripts: { dev: "vite", build: "vite build" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { "@vitejs/plugin-react": "^4.3.1", vite: "^5.4.2" },
      }, null, 2) + "\n",
      "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
      "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite and React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
      "src/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
`,
      "src/App.jsx": `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", marginTop: "4rem" }}>
      <h1>Hello from React</h1>
      <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
    </main>
  );
}
`,
    },
  },
  {
    id: "python", name: "Python", blurb: "Runs in the browser. The first run downloads the runtime.", open: "main.py",
    next: "Press Run. The first run takes a few seconds while Python loads.",
    files: {
      "main.py": `from helpers.greet import greet

for name in ["Ada", "Grace", "Linus"]:
    print(greet(name))
`,
      "helpers/greet.py": `def greet(name):
    return f"Hello, {name}!"
`,
    },
  },
];