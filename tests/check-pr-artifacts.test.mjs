import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const checker = new URL('../scripts/check-pr-artifacts.mjs', import.meta.url).pathname;

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

function withRepository({ setup = () => {}, change }, assertion) {
  const directory = mkdtempSync(join(tmpdir(), 'pr-artifact-check-'));
  try {
    git(directory, 'init', '--quiet');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');
    writeFileSync(join(directory, 'keep.md'), 'base\n');
    setup(directory);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', 'base');
    const base = git(directory, 'rev-parse', 'HEAD');

    change(directory);
    git(directory, 'add', '-A');
    git(directory, 'commit', '--quiet', '-m', 'change');
    const head = git(directory, 'rev-parse', 'HEAD');
    const result = spawnSync(process.execPath, [checker, base, head], {
      cwd: directory,
      encoding: 'utf8',
    });
    assertion(result);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('checks an explicit head commit instead of the checked-out HEAD', () => {
  withRepository(
    {
      change(directory) {
        mkdirSync(join(directory, 'planning'));
        writeFileSync(join(directory, 'planning', 'steps.md'), 'steps\n');
      },
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /planning\/steps\.md/);
    },
  );
});

test('rejects added, modified, renamed, and space-containing process artifacts', () => {
  withRepository(
    {
      setup(directory) {
        writeFileSync(join(directory, 'spec.md'), 'old spec\n');
        writeFileSync(join(directory, 'notes.md'), 'notes\n');
      },
      change(directory) {
        writeFileSync(join(directory, 'spec.md'), 'new spec\n');
        mkdirSync(join(directory, 'planning'));
        writeFileSync(join(directory, 'planning', 'added.md'), 'plan\n');
        mkdirSync(join(directory, 'docs', 'plans'), { recursive: true });
        renameSync(join(directory, 'notes.md'), join(directory, 'docs', 'plans', 'brief with spaces.md'));
      },
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /spec\.md/);
      assert.match(result.stderr, /planning\/added\.md/);
      assert.match(result.stderr, /docs\/plans\/brief with spaces\.md/);
    },
  );
});

test('allows readmes and user-facing documentation', () => {
  withRepository(
    {
      change(directory) {
        writeFileSync(join(directory, 'README.md'), 'project guide\n');
        mkdirSync(join(directory, 'docs'));
        writeFileSync(join(directory, 'docs', 'user-guide.md'), 'guide\n');
      },
    },
    (result) => assert.equal(result.status, 0, result.stderr),
  );
});

test('reports an invalid explicit git ref as a checker error', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pr-artifact-check-'));
  try {
    git(directory, 'init', '--quiet');
    const result = spawnSync(process.execPath, [checker, 'not-a-ref', 'also-not-a-ref'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Could not check PR artifacts/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
