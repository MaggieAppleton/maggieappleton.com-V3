import { evaluate } from './client.js';
import { searchRequest, rankedResults } from './search.js';
import { MODEL } from './rubrics.js';

export function createSearchService({ documents, evaluateImpl = evaluate, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();
  return async function search(query, options = {}) {
    const key = query.trim().toLowerCase();
    const saved = cache.get(key);
    if (saved && now() - saved.savedAt < 3600000) return { ...saved.result, query, cached: true };
    if (pending.has(key)) return { ...await pending.get(key), query };
    if (pending.size >= 4) throw new Error('Search is busy. Try again shortly.');
    const work = (async () => {
      const start = now();
      const { lexical, request } = searchRequest(query, documents);
      if (!lexical.length) return { query, model: null, cached: false, elapsedMs: 0, exists: null, lexical: [], results: [], usage: {}, inspection: null };
      const response = await evaluateImpl(request, options);
      const result = { query, model: response.model, cached: false, elapsedMs: now() - start,
        exists: response.answers.exists.noul, usage: response.usage, lexical,
        results: rankedResults(request, response), inspection: { request: { model: MODEL, ...request }, response } };
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(key, { result, savedAt: now() });
      return result;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}

export function createRateLimit({ now = Date.now, limit = 15 } = {}) {
  const clients = new Map();
  return (id) => {
    const time = now();
    for (const [key, item] of clients) if (item.until <= time) clients.delete(key);
    if (!clients.has(id)) {
      if (clients.size >= 1000) return false;
      clients.set(id, { count: 0, until: time + 60000 });
    }
    return ++clients.get(id).count <= limit;
  };
}
