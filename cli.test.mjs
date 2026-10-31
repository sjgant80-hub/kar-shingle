// cli.test.mjs — the two-file mode of the shipped script (the one-input mode and --selftest are in skill.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SELF } from './kernel.mjs';

function inTemp(files, args, input) {
  const dir = mkdtempSync(join(tmpdir(), 'kar-shingle-'));
  try {
    copyFileSync(resolve('scripts/kar-shingle.mjs'), join(dir, 'kar-shingle.mjs'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, ['kar-shingle.mjs', ...args], { cwd: dir, encoding: 'utf8', input, env });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('two text files → the same report as the one-input form', () => {
  const files = inTemp({ 'a.txt': SELF.A, 'b.txt': SELF.B }, ['a.txt', 'b.txt']);
  const json = inTemp({ 'i.json': JSON.stringify({ a: SELF.A, b: SELF.B }) }, ['i.json']);
  assert.equal(files.status, 0, files.stderr);
  assert.equal(JSON.parse(files.stdout).verdict, 'NEAR-DUPLICATE');
  assert.equal(files.stdout, json.stdout);
});

test('one text from stdin; k and n from the one-input form are clamped like the page', () => {
  const r = inTemp({ 'b.txt': SELF.A }, ['-', 'b.txt'], SELF.A);
  assert.equal(JSON.parse(r.stdout).verdict, 'IDENTICAL');
  const kn = inTemp({ 'i.json': JSON.stringify({ a: SELF.A, b: SELF.C, k: 1, n: 9999 }) }, ['i.json']);
  const out = JSON.parse(kn.stdout);
  assert.equal(out.k, 2);
  assert.equal(out.n, 256);
});

test('both texts on stdin, or a one-input form without two texts → exit 2 with the reason', () => {
  const both = inTemp({}, ['-', '-'], 'x');
  assert.equal(both.status, 2);
  assert.match(both.stderr, /only one/);
  const shape = inTemp({ 'i.json': '{"a": "only one text"}' }, ['i.json']);
  assert.equal(shape.status, 2);
  assert.match(shape.stderr, /"a" and "b"/);
});
