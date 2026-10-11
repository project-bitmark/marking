#!/usr/bin/env node
// Class diagram FROM the schema, so it cannot drift. Emits Mermaid (into the
// README between the markers) and a zero-dependency SVG for the site.
//   node tools/gen-class-diagram.js
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const files = readdirSync(new URL('schema/', root)).filter((f) => f.endsWith('.jsonld'));
const graph = [];
for (const f of files) graph.push(...JSON.parse(await readFile(new URL(`schema/${f}`, root), 'utf8'))['@graph']);
const structs = graph.filter((n) => n['@type'] === 'Struct');
const enums = new Map(graph.filter((n) => n['@type'] === 'Enumeration').map((n) => [n['@id'], n]));
// Which iri fields point at which Struct: the loop's references, by name.
const TARGET = { bounty: 'Bounty', verdict: 'Verdict', subject: { Verdict: 'Submission' }, rule: 'Rule' };
const refTarget = (s, f) => { const t = TARGET[f.key]; return typeof t === 'object' ? t[s.label] : t; };
const models = structs.map((s) => {
  const attrs = [], refs = [];
  for (const f of s.fields) {
    const to = f.valueType === 'iri' ? refTarget(s, f) : undefined;
    if (to) refs.push({ to, label: f.key, opt: !f.required });
    else attrs.push({ name: f.key, type: f.valueType === 'enum' ? enums.get(f.structType).label : f.valueType, opt: !f.required });
  }
  return { label: s.label, attrs, refs };
});
const ORDER = ['Mark', 'Bounty', 'Submission', 'Verdict', 'Release', 'Rule'];
models.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));

const mermaid = ['classDiagram', '  direction LR'];
for (const m of models) { mermaid.push(`  class ${m.label} {`); for (const a of m.attrs) mermaid.push(`    +${a.type}${a.opt ? '?' : ''} ${a.name}`); mermaid.push('  }'); }
for (const e of enums.values()) { mermaid.push(`  class ${e.label} {`, '    <<enumeration>>'); for (const v of e.members) mermaid.push(`    ${v.value}`); mermaid.push('  }'); }
for (const m of models) for (const r of m.refs) mermaid.push(`  ${m.label} --> "${r.opt ? '0..1' : '1'}" ${r.to} : ${r.label}`);
for (const s of structs) for (const f of s.fields) if (f.valueType === 'enum') mermaid.push(`  ${s.label} ..> ${enums.get(f.structType).label} : ${f.key}`);
const mmd = mermaid.join('\n');
await writeFile(new URL('docs/class-diagram.mmd', root), mmd + '\n');

// README: replace between markers
const readmeUrl = new URL('README.md', root);
let readme = await readFile(readmeUrl, 'utf8');
const block = '<!-- class-diagram:start -->\n```mermaid\n' + mmd + '\n```\n<!-- class-diagram:end -->';
readme = readme.includes('<!-- class-diagram:start -->')
  ? readme.replace(/<!-- class-diagram:start -->[\s\S]*<!-- class-diagram:end -->/, block)
  : readme.replace('## Two kinds of rule', '## Class diagram\n\nGenerated from the schema by `node tools/gen-class-diagram.js`; also as [SVG](class-diagram.svg).\n\n' + block + '\n\n## Two kinds of rule');
await writeFile(readmeUrl, readme);

// SVG: hand-placed boxes, schema-derived content
const POS = { Mark: [20, 20], Rule: [360, 20], Bounty: [20, 250], Submission: [360, 250], Verdict: [700, 250], Release: [700, 500] };
const W = 300, HEAD = 32, LINE = 22, PAD = 10, MONO = 'ui-monospace, Menlo, Consolas, monospace', SANS = 'system-ui, sans-serif';
const C = { panel: '#f6f8fa', border: '#d0d7de', fg: '#1f2328', accent: '#b4530a', edge: '#6e7781' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const box = new Map(models.map((m) => [m.label, { m, x: POS[m.label][0], y: POS[m.label][1], h: HEAD + PAD * 2 + (m.attrs.length + m.refs.length) * LINE }]));
let out = [], edges = [], maxW = 0, maxH = 0;
for (const { m, x, y, h } of box.values()) {
  maxW = Math.max(maxW, x + W); maxH = Math.max(maxH, y + h);
  out.push(`<rect x="${x}" y="${y}" width="${W}" height="${h}" rx="6" fill="${C.panel}" stroke="${C.border}"/>`);
  out.push(`<rect x="${x}" y="${y}" width="${W}" height="${HEAD}" rx="6" fill="${C.border}"/>`);
  out.push(`<text x="${x + W / 2}" y="${y + 21}" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="600" fill="${C.fg}">${esc(m.label)}</text>`);
  let yy = y + HEAD + PAD + 15;
  const CHW = 7.6;  // advance of a 12.5px monospace glyph; separate <text> nodes so every renderer lays them out
  for (const a of m.attrs) { out.push(`<text x="${x + 12}" y="${yy}" font-family="${MONO}" font-size="12.5" fill="${C.fg}">${esc(a.name)}</text><text x="${x + 12 + (a.name.length + 1) * CHW}" y="${yy}" font-family="${MONO}" font-size="12.5" fill="${C.accent}">: ${esc(a.type)}${a.opt ? '?' : ''}</text>`); yy += LINE; }
  for (const r of m.refs) { out.push(`<text x="${x + 12}" y="${yy}" font-family="${MONO}" font-size="12.5" fill="${C.fg}">${esc(r.label)}</text><text x="${x + 12 + (r.label.length + 1) * CHW}" y="${yy}" font-family="${MONO}" font-size="12.5" fill="${C.edge}">→ ${esc(r.to)}${r.opt ? '?' : ''}</text>`); yy += LINE; }
}
for (const { m, x, y, h } of box.values()) for (const r of m.refs) {
  const t = box.get(r.to); if (!t) continue;
  const sameRow = t.y === y, above = t.y < y;
  const x1 = sameRow ? (t.x > x ? x + W : x) : x + W / 2, y1 = sameRow ? y + h / 2 : (above ? y : y + h);
  const x2 = sameRow ? (t.x > x ? t.x : t.x + W) : t.x + W / 2, y2 = sameRow ? t.y + t.h / 2 : (above ? t.y + t.h : t.y);
  const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2 - 4;
  edges.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.edge}" stroke-width="1.3" marker-end="url(#a)"/><text x="${lx}" y="${ly}" text-anchor="middle" font-family="${SANS}" font-size="11" fill="${C.edge}">${esc(r.label)}</text>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW + 20}" height="${maxH + 20}" viewBox="0 0 ${maxW + 20} ${maxH + 20}" font-family="${SANS}">
<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${C.edge}"/></marker></defs>
<rect width="100%" height="100%" fill="#fff"/>
${edges.join('\n')}
${out.join('\n')}
</svg>
`;
await writeFile(new URL('class-diagram.svg', root), svg);
console.log(`diagram: ${models.length} classes, ${models.reduce((n, m) => n + m.refs.length, 0)} references`);
