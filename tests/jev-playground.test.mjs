import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RECORDED_POST_IDS,
  recordedQuestions,
  recordedQuestionMap,
  articleState,
  previewSentences,
  createRecordedSnapshot,
  validateRecordedSnapshot,
  recordedSelection,
} from '../src/lib/jev/recorded-playground.js';
import {
  createCachedRecordedRun,
  writeJsonAtomic,
} from '../src/lib/jev/recorded-generation.js';
import { probabilityRows, estimatedRunCost } from '../src/lib/jev/playground.js';
import { MODEL } from '../src/lib/jev/rubrics.js';
import PlaygroundAnswer from '../src/components/unique/jev/PlaygroundAnswer.jsx';

const expectedPostIds = [
  'garden-history',
  'paleolithic-nostalgia',
  'planning-agents',
  'narrative-essays',
  'programming-portals',
  'lm-sketchbook',
  'home-cooked-software',
  'growing-a-human',
  'gastown',
  'folk-interfaces',
  'assumed-audience',
  'bidirectionals',
  'ai-enlightenment',
  'ambient-copresence',
];

const validAnswer = question => {
  if (question.type === 'noul') return { type: 'noul', noul: 0.75 };
  const keys = question.type === 'choice'
    ? Object.keys(question.criteria)
    : question.criteria.map((_, index) => String(index));
  const probability = 1 / keys.length;
  return {
    type: question.type,
    confidence: 0.5,
    probabilities: Object.fromEntries(keys.map(key => [key, probability])),
    ...(question.type === 'choice' ? { choice: keys[0] } : { score: (keys.length - 1) / 2 }),
  };
};

const documents = expectedPostIds.map((id, index) => ({
  id,
  title: `Post ${index + 1}`,
  description: `Description ${index + 1}`,
  paragraphs: [
    { id: 'p1', text: `First sentence for ${id}. Second sentence for ${id}. Third sentence is hidden.`, heading: '', citations: [] },
  ],
}));

test('recorded playground exposes only the approved posts and six fixed questions', () => {
  assert.deepEqual(RECORDED_POST_IDS, expectedPostIds);
  assert.deepEqual(recordedQuestions.map(({ id }) => id), [
    'title_fit',
    'analogy',
    'growth_stage',
    'mode',
    'knowledge',
    'speculation',
  ]);
  assert.deepEqual(recordedQuestions.find(({ id }) => id === 'knowledge').question.criteria, [
    'No prior knowledge; explains foundational terms',
    'Some everyday familiarity',
    'Familiar with the field and its vocabulary',
    'Practitioner knowledge',
    'Specialist knowledge; substantial unexplained concepts',
  ]);
  assert.deepEqual(recordedQuestions.find(({ id }) => id === 'speculation').question.criteria, [
    'Reporting established material or direct experience',
    'Mostly established material with interpretation',
    'Interpretation and tentative ideas balanced',
    'Exploring uncertain possibilities',
    'Predominantly conjectural or open questions',
  ]);
});

test('article state uses full extracted prose while preview contains two sentences', () => {
  assert.deepEqual(articleState(documents[0]), {
    title: 'Post 1',
    description: 'Description 1',
    paragraphs: documents[0].paragraphs,
  });
  assert.equal(
    previewSentences(documents[0]),
    'First sentence for garden-history. Second sentence for garden-history.',
  );
});

test('generation batches all six questions once per curated post', async () => {
  const calls = [];
  const snapshot = await createRecordedSnapshot(documents, {
    generatedAt: '2026-09-23T08:30:00.000Z',
    run: async (state, questions) => {
      calls.push({ state, questions });
      return {
        elapsedMs: 25,
        response: {
          model: MODEL,
          usage: { input_tokens: 100, output_tokens: 10 },
          answers: Object.fromEntries(Object.entries(questions).map(([id, value]) => [id, validAnswer(value)])),
        },
      };
    },
  });

  assert.equal(calls.length, 14);
  assert.ok(calls.every(call => Object.keys(call.questions).length === 6));
  assert.equal(snapshot.posts.length, 14);
  assert.equal(snapshot.posts.reduce((sum, post) => sum + Object.keys(post.answers).length, 0), 84);
  assert.equal(Object.keys(snapshot.posts[0].answers).length, 6);
  assert.deepEqual(snapshot.usage, { input_tokens: 1400, output_tokens: 140 });
  assert.doesNotThrow(() => validateRecordedSnapshot(snapshot, documents));
});

test('generation rejects a response from a different model', async () => {
  await assert.rejects(
    () => createRecordedSnapshot(documents, {
      run: async (_state, questions) => ({
        elapsedMs: 25,
        response: {
          model: 'wrong-model',
          usage: { input_tokens: 100, output_tokens: 10 },
          answers: Object.fromEntries(Object.entries(questions).map(([id, value]) => [id, validAnswer(value)])),
        },
      }),
    }),
    /model/,
  );
});

test('generation rejects duplicate source document IDs', async () => {
  await assert.rejects(
    () => createRecordedSnapshot([...documents, { ...documents[0], title: 'Duplicate' }], {
      run: async () => {
        throw new Error('run should not be called');
      },
    }),
    /source document IDs must be unique/,
  );
});

test('snapshot validation rejects incomplete, malformed, and stale data', async () => {
  const snapshot = await createRecordedSnapshot(documents, {
    generatedAt: '2026-09-23T08:30:00.000Z',
    run: async (_state, questions) => ({
      elapsedMs: 25,
      response: {
        model: MODEL,
        usage: { input_tokens: 100, output_tokens: 10 },
        answers: Object.fromEntries(Object.entries(questions).map(([id, value]) => [id, validAnswer(value)])),
      },
    }),
  });
  assert.throws(
    () => validateRecordedSnapshot({ ...snapshot, posts: snapshot.posts.slice(1) }, documents),
    /14 recorded posts/,
  );
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      posts: snapshot.posts.map((post, index) => index
        ? post
        : { ...post, answers: { ...post.answers, title_fit: { type: 'noul', noul: 2 } } }),
    }, documents),
    /Invalid Jev probability: title_fit/,
  );
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      posts: snapshot.posts.map((post, index) => index
        ? post
        : { ...post, answers: { ...post.answers, unexpected: { type: 'noul', noul: 0.5 } } }),
    }, documents),
    /answer IDs do not match/,
  );
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      usage: { input_tokens: 1, output_tokens: 1 },
    }, documents),
    /aggregate usage does not match/,
  );
  assert.throws(
    () => validateRecordedSnapshot(snapshot, documents.map((doc, index) => index
      ? doc
      : { ...doc, paragraphs: [{ ...doc.paragraphs[0], text: 'Changed source.' }] })),
    /source content has changed/,
  );
});

test('snapshot validation rejects saved titles and previews that differ from current sources', async () => {
  const snapshot = await createRecordedSnapshot(documents, {
    generatedAt: '2026-09-23T08:30:00.000Z',
    run: async (_state, questions) => ({
      elapsedMs: 25,
      response: {
        model: MODEL,
        usage: { input_tokens: 100, output_tokens: 10 },
        answers: Object.fromEntries(Object.entries(questions).map(([id, value]) => [id, validAnswer(value)])),
      },
    }),
  });
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      posts: snapshot.posts.map((post, index) => index ? post : { ...post, title: 'Wrong title' }),
    }, documents),
    /metadata does not match current source: garden-history/,
  );
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      posts: snapshot.posts.map((post, index) => index ? post : { ...post, preview: 'Wrong preview.' }),
    }, documents),
    /metadata does not match current source: garden-history/,
  );
});

test('recorded selection returns a saved pair and reports missing pairs explicitly', async () => {
  const snapshot = await createRecordedSnapshot(documents, {
    generatedAt: '2026-09-23T08:30:00.000Z',
    run: async (_state, questions) => ({
      elapsedMs: 25,
      response: {
        model: MODEL,
        usage: { input_tokens: 100, output_tokens: 10 },
        answers: Object.fromEntries(Object.entries(questions).map(([id, value]) => [id, validAnswer(value)])),
      },
    }),
  });
  assert.equal(recordedSelection(snapshot, 'garden-history', 'title_fit').answer.noul, 0.75);
  assert.equal(recordedSelection(snapshot, 'missing', 'title_fit'), null);
  assert.equal(recordedSelection(snapshot, 'garden-history', 'missing'), null);
});

test('recorded generation cache reuses an identical request without calling Jev again', async (t) => {
  const cacheRoot = path.join(process.cwd(), '.cache/jev/tests');
  await fs.mkdir(cacheRoot, { recursive: true });
  const cacheDir = await fs.mkdtemp(path.join(cacheRoot, 'recorded-cache-'));
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  let calls = 0;
  let now = 100;
  const run = createCachedRecordedRun({
    cacheDir,
    now: () => now,
    evaluateImpl: async request => {
      calls++;
      now = 125;
      return {
        model: MODEL,
        usage: { input_tokens: 12, output_tokens: 3 },
        answers: Object.fromEntries(Object.entries(request.questions).map(([id, value]) => [id, validAnswer(value)])),
      };
    },
  });
  const state = articleState(documents[0]);
  const first = await run(state, recordedQuestionMap);
  const second = await run(state, recordedQuestionMap);
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  assert.equal(first.elapsedMs, 25);
});

test('atomic JSON writing leaves a complete parseable destination', async (t) => {
  const cacheRoot = path.join(process.cwd(), '.cache/jev/tests');
  await fs.mkdir(cacheRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheRoot, 'recorded-write-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'playground.json');
  await writeJsonAtomic(destination, { complete: true });
  assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')), { complete: true });
  await assert.rejects(fs.access(`${destination}.tmp`));
});

const question = { type: 'noul', instructions: 'Is the article practical?' };

test('the probability display preserves model probabilities, separate from confidence', () => {
  const answer = { type: 'choice', choice: 'evergreen', confidence: 0.3, probabilities: { seedling: 0.03, budding: 0.43, evergreen: 0.54 } };
  assert.deepEqual(probabilityRows({ criteria: { seedling: null, budding: null, evergreen: null } }, answer).find(row => row.selected), { label: 'evergreen', value: 0.54, selected: true });
  assert.deepEqual(probabilityRows(question, { type: 'noul', noul: 0.75 }), [{ label: 'Yes', value: 0.75 }, { label: 'No', value: 0.25 }]);
});

test('run cost uses actual input tokens and published Jev pricing', () => {
  assert.equal(estimatedRunCost({ input_tokens: 1_000_000, output_tokens: 999 }), 0.042);
  assert.ok(Math.abs(estimatedRunCost({ input_tokens: 300, output_tokens: 20 }) - 0.0000126) < Number.EPSILON);
  assert.equal(estimatedRunCost(), null);
});

test('playground answers omit the decision-rule section', () => {
  const html = renderToStaticMarkup(React.createElement(PlaygroundAnswer, {
    id: 'practical',
    question,
    answer: { type: 'noul', noul: 0.75 },
  }));

  assert.match(html, /75\.0%/);
  assert.doesNotMatch(html, /Use the answer in code|Decision threshold|jev-play-rule/);
});
