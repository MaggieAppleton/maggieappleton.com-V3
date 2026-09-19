import test from 'node:test';
import assert from 'node:assert/strict';
import { extractParagraphs, canonicalDocuments } from '../src/lib/jev/corpus.js';
import { validateResponse, evaluate } from '../src/lib/jev/client.js';
import { lexicalSearch, searchRequest, rankedResults } from '../src/lib/jev/search.js';
import { createSearchService, createRateLimit } from '../src/lib/jev/search-service.js';
import { epistemicQuestions, relationshipQuestions, sentenceQuestions } from '../src/lib/jev/rubrics.js';
import { sentenceUnits } from '../src/lib/jev/sentences.js';

const entry = (file, changes = {}, content = 'A long enough garden paragraph about learning and writing in public.') => ({ file,
  data: { title: file, type: 'note', startDate: '2026-01-01', topics: ['Design'], growthStage: 'budding', ...changes }, content });
const docs = canonicalDocuments([
  entry('gardening.mdx', { title: 'Digital gardens' }, 'Digital gardens are places for growing notes and learning in public.'),
  entry('engines.mdx', { title: 'Steam engines' }, 'Steam engines turn the heat from boiling water into useful mechanical work.'),
]);

test('sentence units preserve punctuation, stable IDs, and common abbreviations', () => {
  assert.deepEqual(sentenceUnits({ id: 'p3', text: 'Dr. Rao writes about gardens. Another claim?' }), [
    { id: 'p3-s1', paragraphId: 'p3', text: 'Dr. Rao writes about gardens.' },
    { id: 'p3-s2', paragraphId: 'p3', text: 'Another claim?' },
  ]);
});

test('corpus excludes drafts, picks latest published version, and resolves authored backlinks', () => {
  const result = canonicalDocuments([
    entry('garden/old-v1.mdx', { title: 'Garden', version: 1 }),
    entry('garden/new-v2.mdx', { title: 'Garden', version: 2 }),
    entry('private.mdx', { draft: true }),
    entry('links.mdx', {}, 'This meaningful paragraph contains an authored [[Garden]] link for readers.'),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find((d) => d.id === 'garden').title, 'Garden');
  assert.deepEqual(result.find((d) => d.id === 'garden').inbound, ['links']);
  assert.deepEqual(result.find((d) => d.id === 'links').outbound, ['garden']);
});

test('MDX import stripping supports optional semicolons without swallowing article content', () => {
  const paragraphs = extractParagraphs('import Example from "./Example.astro"\n\nimport { Test } from "./test.js";\n\n# A heading\n\nA paragraph with [a citation](https://example.com/source) and **visible emphasis**.');
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].heading, 'A heading');
  assert.match(paragraphs[0].text, /visible emphasis/);
  assert.doesNotMatch(paragraphs[0].text, /import|Example/);
  assert.deepEqual(paragraphs[0].citations, ['https://example.com/source']);
});

test('illustrated essays contribute supplied image descriptions without pretending to see pixels', () => {
  const paragraphs = extractParagraphs('<RemoteImage src="https://example.com/a.png" alt="Databases are shelves for storing structured information and retrieving it." />');
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].source, 'image_alt');
  assert.match(paragraphs[0].text, /Databases are shelves/);
});

test('image descriptions retain apostrophes inside double-quoted JSX attributes', () => {
  const text = "They're shelves for information, and they're useful for structured retrieval.";
  assert.equal(extractParagraphs(`<RemoteImage alt="${text}" />`)[0]?.text, text);
});

test('short factual list entries remain available to the epistemic linter', () => {
  const paragraphs = extractParagraphs('- Written language – 3200 BCE\n- Maps – 700 BCE');
  assert.deepEqual(paragraphs.map(p => p.text), ['Written language – 3200 BCE', 'Maps – 700 BCE']);
});

test('corpus honours the evergreen default for now entries', () => {
  assert.equal(canonicalDocuments([entry('2026.mdx', {type: 'now', growthStage: undefined})])[0].growthStage, 'evergreen');
});

test('keyword retrieval ranks the matching article and uses an actual source excerpt', () => {
  const result = lexicalSearch('growing notes', docs);
  assert.equal(result[0].id, 'gardening');
  assert.equal(result[0].excerpt, docs.find((d) => d.id === 'gardening').paragraphs[0].text);
  assert.ok(result[0].score > result[1].score);
  assert.deepEqual(lexicalSearch('the and of', docs), []);
});

test('semantic retrieval has a separate absence judgement and bounded candidate passage IDs', () => {
  const { request } = searchRequest('growing notes', docs);
  assert.equal(request.questions.exists.type, 'noul');
  assert.equal(request.state.candidates.length, 2);
  const response = { answers: { exists: { noul: 0.02 }, relevance_0: { noul: 0.1 }, relevance_1: { noul: 0.2 }, passage_0: { choice: 'none' }, passage_1: { choice: 'p1' } } };
  const result = rankedResults(request, response);
  assert.equal(result[0].id, request.state.candidates[1].id);
  assert.equal(result[0].score, 0.2);
  assert.equal(response.answers.exists.noul, 0.02);
});

test('response validation rejects impossible probabilities, missing answers, and invalid choices', () => {
  const questions = { relevant: { type: 'noul' } };
  assert.throws(() => validateResponse({ model: 'jev', answers: { relevant: { type: 'noul', noul: 1.2 } } }, questions));
  assert.throws(() => validateResponse({ model: 'jev', answers: {} }, questions));
  assert.throws(() => validateResponse({ model: 'jev', answers: { type: { type: 'choice', choice: 'invented', confidence: 1, probabilities: { real: 1 } } } }, { type: { type: 'choice', criteria: { real: null } } }));
  const good = { model: 'jev', answers: { relevant: { type: 'noul', noul: 0.8 } } };
  assert.equal(validateResponse(good, questions), good);
});

test('API errors do not expose the key or an upstream body', async () => {
  await assert.rejects(evaluate({ questions: {} }, { apiKey: 'private-test-value', fetchImpl: async () => new Response('private-test-value', { status: 401 }) }), { message: 'Jev request failed (401)' });
});

test('search caches successful requests, coalesces concurrent calls, and retains actual probabilities', async () => {
  let calls = 0;
  const search = createSearchService({ documents: docs, evaluateImpl: async (request) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const answers = { exists: { type: 'noul', noul: 0.87 } };
    request.state.candidates.forEach((_, i) => {
      answers[`relevance_${i}`] = { type: 'noul', noul: i ? 0.05 : 0.93 };
      answers[`passage_${i}`] = { type: 'choice', choice: 'p1' };
    });
    return { model: 'test-provider', answers, usage: { input_tokens: 100 } };
  } });
  const [one, two] = await Promise.all([search('growing notes'), search('GROWING NOTES')]);
  assert.equal(calls, 1);
  assert.equal(two.query, 'GROWING NOTES');
  assert.deepEqual(one, { ...two, query: one.query });
  assert.equal(one.exists, 0.87);
  assert.equal(one.results[0].score, 0.93);
  const cached = await search('Growing Notes');
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
});

test('rate limit resets after its window and isolates callers', () => {
  let time = 0;
  const allow = createRateLimit({ now: () => time, limit: 2 });
  assert.equal(allow('one'), true); assert.equal(allow('one'), true);
  assert.equal(allow('one'), false); assert.equal(allow('two'), true);
  time = 60001;
  assert.equal(allow('one'), true);
});

test('search without candidates does not invent a model probability', async () => {
  const search = createSearchService({ documents: docs, evaluateImpl: () => { throw new Error('Should not evaluate'); } });
  const result = await search('how to do it');
  assert.equal(result.exists, null);
  assert.equal(result.model, null);
  assert.equal(result.inspection, null);
});

test('each paragraph has three independent epistemic questions and each relationship has real evidence choices', () => {
  const paragraphs = docs[0].paragraphs;
  const questions = epistemicQuestions(paragraphs);
  assert.equal(Object.keys(questions).length, paragraphs.length * 3);
  assert.match(questions.citation_0.instructions, /supplied neighbouring context/);
  const relations = relationshipQuestions([docs[1]], docs[0]);
  assert.equal(Object.keys(relations).length, 4);
  assert.ok(Object.hasOwn(relations.source_0.criteria, 'p1'));
  assert.ok(Object.hasOwn(relations.source_0.criteria, 'none'));
});

test('sentence questions refer to sentence state rather than paragraph state', () => {
  const sentences = sentenceUnits({ id: 'p1', text: 'One claim. Another claim.' });
  const questions = sentenceQuestions(sentences);
  assert.equal(Object.keys(questions).length, 6);
  assert.match(questions.kind_0.instructions, /sentences\[0\]/);
  assert.match(questions.citation_1.instructions, /sentences\[1\]/);
});
