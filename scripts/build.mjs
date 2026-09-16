import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
await build({ root });

// Use Vite's existing TSX transform. No new dependencies, external requests, or AI calls.
const server = await createServer({
  root,
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  // Only SSR transforms are needed here; avoid an unused browser dependency scan racing close().
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { renderPublicPage } = await server.ssrLoadModule("/src/entry-server.tsx");
  const { markup, schema, site } = renderPublicPage();
  const entry = resolve(root, "dist/index.html");
  let html = await readFile(entry, "utf8");
  if (!html.includes('<div id="root"></div>')) throw new Error("Expected one empty app root for prerendering");
  if (!markup.includes("Thank you for your service, sir.") || !markup.includes(site.name)) {
    throw new Error("The prerendered landing page is incomplete");
  }
  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  if ((html.match(/<!--site-schema-->/g) ?? []).length !== 1) throw new Error("Expected one structured-data placeholder");
  html = html.replace("<!--site-schema-->", `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`);
  if (html.includes("<!--site-schema-->")) throw new Error("Structured data was not injected");
  await writeFile(entry, html);
  console.log("Prerendered public landing + visible FAQ. No user session data included.");
} finally {
  await server.close();
}

await import("./check-build.mjs");
