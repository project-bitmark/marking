#!/usr/bin/env node
// Open Graph card (1200x630) for the site, rendered by headless chromium from a
// small HTML page that embeds the schema-generated class diagram, so the card
// shows the real model. Writes og.png next to index.html (snap chromium cannot
// write to /tmp, so the HTML and PNG stay inside the repo).
//   node tools/gen-og.js
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = new URL('..', import.meta.url);
const chrome = process.env.CHROME ?? (await (async () => { for (const c of ['chromium', 'chromium-browser', 'google-chrome']) { try { await run('which', [c]); return c; } catch {} } throw new Error('no chromium'); })());
const svg = await readFile(new URL('class-diagram.svg', root), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fbfaf7;color:#1e1d1a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .bar{position:absolute;left:0;top:0;width:1200px;height:12px;background:#c2410c}
  .wrap{position:absolute;left:64px;top:52px;width:520px}
  h1{font-size:64px;line-height:1;margin:0 0 18px;letter-spacing:-.02em}
  .meta{font:500 22px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#c2410c;margin:0 0 22px}
  .text{font-size:26px;line-height:1.35;color:#3b3934;margin:0}
  .diagram{position:absolute;right:40px;top:40px;width:560px;height:560px;display:flex;align-items:center;justify-content:center}
  .diagram svg{width:560px;height:auto}
</style><div class="bar"></div>
<div class="wrap"><h1>Marking</h1><p class="meta">Mark · Bounty · Submission · Verdict · Release</p>
<p class="text">Marking as data. A mark is spent, not clicked, so the sum of marks is an honest measure of value, and a bounty names its rule before anyone works.</p></div>
<div class="diagram">${svg}</div>`;
const page = new URL('og-card.html', root);
await writeFile(page, html);
await run(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--window-size=1200,630', `--screenshot=${new URL('og.png', root).pathname}`, page.href], { timeout: 60000 });
await unlink(page);
console.log('og.png written');
