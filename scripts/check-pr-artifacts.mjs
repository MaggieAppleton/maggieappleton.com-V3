#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const [base, head = 'HEAD'] = process.argv.slice(2);
if (!base || process.argv.length < 3 || process.argv.length > 4) {
  console.error('Usage: npm run check:pr-artifacts -- <base-ref-or-sha> [head-ref-or-sha]');
  process.exit(2);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isProcessArtifact(path) {
  const normalized = path.replaceAll('\\', '/');
  const name = basename(normalized).toLowerCase();
  if (/^(planning|process)\//.test(normalized)
    || /^docs\/(plans|specs|superpowers\/(plans|specs))\//.test(normalized)) return true;
  if (name === 'readme.md') return false;

  return /^(plan|spec|design|implementation|issue-log)\.md$/i.test(name)
    || /(?:-plan|-spec|-design|-implementation|-issue-log)\.md$/i.test(name);
}

try {
  const mergeBase = git('merge-base', base, head);
  const output = execFileSync('git', [
    'diff', '--name-status', '-z', '--find-renames', '--diff-filter=ACMR', mergeBase, head,
  ]).toString('utf8');
  const fields = output.split('\0');
  const blocked = [];

  for (let i = 0; i < fields.length - 1;) {
    const status = fields[i++];
    if (!status) break;
    if (status.startsWith('R')) i++; // Skip the old name; check the new destination.
    const path = fields[i++];
    if (isProcessArtifact(path)) blocked.push(path);
  }

  if (blocked.length) {
    console.error(`Process artifacts in PR diff:\n${blocked.map((path) => `  ${path}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('PR artifact check passed.');
  }
} catch (error) {
  console.error(`Could not check PR artifacts: ${error.message}`);
  process.exitCode = 2;
}
