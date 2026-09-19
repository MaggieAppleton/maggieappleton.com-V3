import { MODEL } from './rubrics.js';

const finiteProbability = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
export function validateResponse(data, questions) {
  if (!data?.answers || typeof data.model !== 'string') throw new Error('Invalid Jev response');
  for (const [id, question] of Object.entries(questions)) {
    const answer = data.answers[id];
    if (answer?.type !== question.type) throw new Error(`Invalid Jev answer: ${id}`);
    if (question.type === 'noul') {
      if (!finiteProbability(answer.noul)) throw new Error(`Invalid Jev probability: ${id}`);
      continue;
    }
    if (!finiteProbability(answer.confidence)) throw new Error(`Invalid Jev confidence: ${id}`);
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    if (!answer.probabilities || keys.some((k) => !finiteProbability(answer.probabilities[k]))) throw new Error(`Invalid Jev distribution: ${id}`);
    const sum = keys.reduce((n, k) => n + answer.probabilities[k], 0);
    if (Math.abs(sum - 1) > 0.03) throw new Error(`Invalid Jev distribution total: ${id}`);
    if (question.type === 'choice' && !keys.includes(answer.choice)) throw new Error(`Invalid Jev choice: ${id}`);
    if (question.type === 'score' && (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1)) throw new Error(`Invalid Jev score: ${id}`);
  }
  return data;
}

export async function evaluate(request, { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch, retries = 2 } = {}) {
  if (!apiKey?.trim()) throw new Error('TYPESAFE_API_KEY is not configured');
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, ...request }), signal: AbortSignal.timeout(25000),
    });
    if ([429, 502, 503, 529].includes(response.status) && attempt < retries) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      await new Promise((r) => setTimeout(r, Math.min(10000, Math.max(retryAfter * 1000, 750 * 2 ** attempt))));
      continue;
    }
    // Never log upstream bodies: they can echo input data or credential details.
    if (!response.ok) throw new Error(`Jev request failed (${response.status})`);
    return validateResponse(await response.json(), request.questions);
  }
}
