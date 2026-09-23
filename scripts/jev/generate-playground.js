import 'dotenv/config';
import path from 'node:path';
import { loadCorpus } from '../../src/lib/jev/corpus.js';
import {
  createRecordedSnapshot,
  validateRecordedSnapshot,
} from '../../src/lib/jev/recorded-playground.js';
import {
  createCachedRecordedRun,
  writeJsonAtomic,
} from '../../src/lib/jev/recorded-generation.js';

const root = process.cwd();
const output = path.join(root, 'src/data/jev/playground.json');
const documents = await loadCorpus(root);
const run = createCachedRecordedRun({
  cacheDir: path.join(root, '.cache/jev/recorded-playground'),
});
const snapshot = await createRecordedSnapshot(documents, { run });
validateRecordedSnapshot(snapshot, documents);
await writeJsonAtomic(output, snapshot);
console.log(`Recorded ${snapshot.posts.length} posts × 6 questions in ${output}`);
console.log(`Usage: ${snapshot.usage.input_tokens} input tokens, ${snapshot.usage.output_tokens} output tokens`);
