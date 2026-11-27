import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync(new URL("./bookmarklet.js", import.meta.url), "utf8");
const href = "javascript:" + encodeURIComponent(source);
const attr = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

writeFileSync(new URL("./bookmarklet.txt", import.meta.url), href + "\n");
writeFileSync(new URL("./install.html", import.meta.url), `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>YWH Markdown bookmarklet</title></head>
  <body style="font:15px system-ui,sans-serif;max-width:640px;margin:60px auto">
    <h1>YWH Markdown bookmarklet</h1>
    <p>Drag this link to your bookmarks bar:</p>
    <p><a href="${attr}" style="padding:8px 14px;background:#e60000;color:#fff;border-radius:6px;text-decoration:none">YWH → Markdown</a></p>
    <p>Then click it on any <code>https://yeswehack.com/programs/…</code> page.</p>
  </body>
</html>
`);
console.log(`bookmarklet: ${href.length} chars`);
