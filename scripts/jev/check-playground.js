import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCorpus } from '../../src/lib/jev/corpus.js';
import { validateRecordedSnapshot } from '../../src/lib/jev/recorded-playground.js';

const root = process.cwd();
const input = path.join(root, 'src/data/jev/playground.json');
const [documents, source] = await Promise.all([
  loadCorpus(root),
  fs.readFile(input, 'utf8'),
]);
const snapshot = validateRecordedSnapshot(JSON.parse(source), documents);
console.log(`Verified ${snapshot.posts.length} recorded posts and ${snapshot.posts.length * 6} saved answers.`);
