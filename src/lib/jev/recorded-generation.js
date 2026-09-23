import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluate, validateResponse } from './client.js';
import { hash } from './corpus.js';
import { MODEL } from './rubrics.js';

export function createCachedRecordedRun({
  cacheDir,
  evaluateImpl = evaluate,
  now = Date.now,
}) {
  return async (state, questions) => {
    const request = { model: MODEL, state, questions };
    const destination = path.join(cacheDir, `${hash(request)}.json`);
    try {
      const saved = JSON.parse(await fs.readFile(destination, 'utf8'));
      validateResponse(saved.response, questions);
      return saved;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const startedAt = now();
    const response = await evaluateImpl(request);
    validateResponse(response, questions);
    const saved = { response, elapsedMs: now() - startedAt };
    await fs.mkdir(cacheDir, { recursive: true });
    await writeJsonAtomic(destination, saved);
    return saved;
  };
}

export async function writeJsonAtomic(destination, value) {
  const temporary = `${destination}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`);
  await fs.rename(temporary, destination);
}
