// Zero-dependency checks: every module is well formed, every vector fits its
// Struct, and the loop vectors link into one chain bounty -> submission ->
// verdict -> release under the bounty's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const context = load('context.jsonld')['@context'];
const modules = readdirSync(join(root, 'schema')).filter((f) => f.endsWith('.jsonld')).map((f) => ['schema/' + f, load('schema/' + f)]);
const vectors = readdirSync(join(root, 'vectors')).filter((f) => f.endsWith('.json')).map((f) => ['vectors/' + f, load('vectors/' + f)]);

const nodes = new Map();
for (const [, m] of modules) for (const n of m['@graph']) nodes.set(n['@id'], n);
const structs = new Map([...nodes.values()].filter((n) => n['@type'] === 'Struct').map((n) => [n.label, n]));
const enums = new Map([...nodes.values()].filter((n) => n['@type'] === 'Enumeration').map((n) => [n['@id'], n]));

test('context declares every property the structs use', () => {
  for (const s of structs.values()) for (const f of s.fields) {
    assert.ok(context[f.key] !== undefined, `${s.label}.${f.key} missing from context`);
    assert.equal(f.property, 'mk:' + f.key, `${s.label}.${f.key} property IRI`);
  }
});

test('every node has id, type, label and a comment', () => {
  assert.equal(modules.length, 5);
  for (const [file, m] of modules) {
    assert.equal(m['@context'], '../context.jsonld', file);
    for (const n of m['@graph']) {
      for (const k of ['@id', '@type', 'label', 'comment']) assert.ok(n[k], `${file} ${n['@id'] ?? '?'} lacks ${k}`);
      if (n['@type'] !== 'Module') assert.ok(nodes.has(n.module), `${n['@id']} module ${n.module}`);
      for (const f of n.fields ?? []) {
        for (const k of ['property', 'label', 'key', 'valueType', 'required', 'comment']) assert.ok(f[k] !== undefined, `${n['@id']}.${f.key ?? '?'} lacks ${k}`);
        if (f.valueType === 'enum') assert.ok(enums.has(f.structType), `${n['@id']}.${f.key} enum ${f.structType}`);
      }
      for (const r of n.rules ?? []) for (const k of ['@id', 'label', 'errorCode', 'check', 'comment']) assert.ok(r[k], `${n['@id']} rule lacks ${k}`);
    }
  }
  assert.deepEqual([...structs.keys()].sort(), ['Bounty', 'Mark', 'Release', 'Rule', 'Submission', 'Verdict']);
});

const checkValue = (f, v, where) => {
  switch (f.valueType) {
    case 'iri': assert.ok(typeof v === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(v), `${where}: iri`); break;
    case 'decimal': assert.ok(/^\d+(\.\d{1,5})?$/.test(v) && Number(v) > 0, `${where}: decimal, 5 places, positive`); break;
    case 'int': assert.ok(Number.isInteger(v), `${where}: int`); break;
    case 'datetime': assert.ok(typeof v === 'string' && !Number.isNaN(Date.parse(v)), `${where}: datetime`); break;
    case 'utf8': assert.equal(typeof v, 'string', `${where}: utf8`); break;
    case 'json': assert.ok(v !== null && typeof v === 'object', `${where}: json`); break;
    case 'enum': assert.ok(enums.get(f.structType).members.some((m) => m.value === v), `${where}: enum member`); break;
    default: assert.fail(`${where}: unknown valueType ${f.valueType}`);
  }
};

test('every vector fits its Struct exactly', () => {
  assert.equal(vectors.length, 9);
  for (const [file, v] of vectors) {
    const s = structs.get(v['@type']);
    assert.ok(s, `${file}: struct ${v['@type']}`);
    const allowed = new Set(['@context', '@id', '@type', 'label', 'comment', ...s.fields.map((f) => f.key)]);
    for (const k of Object.keys(v)) assert.ok(allowed.has(k), `${file}: unknown key ${k}`);
    for (const f of s.fields) {
      if (f.required) assert.ok(v[f.key] !== undefined, `${file}: missing ${f.key}`);
      if (v[f.key] !== undefined) checkValue(f, v[f.key], `${file}.${f.key}`);
    }
  }
});

test('the loop vectors link into one chain under the bounty rule', () => {
  const byId = new Map(vectors.map(([, v]) => [v['@id'], v]));
  const release = byId.get('https://bitmark.co/marking/vectors/release');
  const verdict = byId.get(release.verdict);
  const submission = byId.get(verdict.subject);
  const bounty = byId.get(release.bounty);
  const rule = byId.get(bounty.rule);
  assert.equal(verdict.outcome, 'accepted');                 // release-accepted
  assert.equal(submission.bounty, release.bounty);          // release-chain
  assert.equal(release.to, submission.by);                  // release-chain
  assert.equal(verdict.rule, bounty.rule);                  // verdict-rule-matches-bounty
  assert.equal(rule.kind, 'deterministic');
  assert.equal(verdict.evidence.fail, 0);                   // verdict-rerunnable, as recorded
  assert.equal(release.amount, bounty.amount);
});

test('a share is a mark of a link, and a mark on the share keeps both link and sharer', () => {
  const byId = new Map(vectors.map(([, v]) => [v['@id'], v]));
  const share = byId.get('https://bitmark.co/marking/vectors/share');
  const onShare = byId.get('https://bitmark.co/marking/vectors/mark-on-share');
  const split = byId.get('https://bitmark.co/marking/vectors/rule-share-split');
  assert.equal(share['@type'], 'Mark');
  assert.equal(onShare.subject, share['@id']);               // marks the share, not the bare link
  assert.equal(share.to, undefined);                         // link unclaimed
  assert.equal(onShare.to, undefined);                       // resolved at settlement
  assert.equal(split.kind, 'deterministic');                 // settle-key-in-subject: sharer = share.from
  assert.ok(share.from && share.subject.startsWith('https://'));
});
