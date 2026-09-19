import snapshot from '../../data/jev/garden.json';
import { createSearchService, createRateLimit } from '../../lib/jev/search-service.js';

export const prerender = false;
const search = createSearchService({ documents: snapshot.documents });
const allow = createRateLimit();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export async function POST({ request, clientAddress }) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Use search from this site.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
  if (!allow(clientAddress || 'local')) return json({ error: 'Search limit reached. Try again in a minute.' }, 429);
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Enter a search query.' }, 400);
    let bytes = 0;
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4096) { await reader.cancel(); return json({ error: 'Query is too long.' }, 413); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return json({ error: 'Invalid search request.' }, 400); }
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query.length < 3 || query.length > 240) return json({ error: 'Use between 3 and 240 characters.' }, 400);
  const apiKey = process.env.TYPESAFE_API_KEY || import.meta.env.TYPESAFE_API_KEY;
  if (!apiKey) return json({ error: 'Live search needs a server API key.' }, 503);
  if (!snapshot.generatedAt) return json({ error: 'Garden data has not been generated yet.' }, 503);
  try { return json(await search(query, { apiKey, retries: 1 })); }
  catch (error) {
    const busy = error.message.startsWith('Search is busy');
    return json({ error: busy ? error.message : 'Jev is unavailable. Keyword results are still shown; try again shortly.' }, busy ? 429 : 503);
  }
}
