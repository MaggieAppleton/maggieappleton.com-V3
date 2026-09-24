import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  articleState,
  previewSentences,
  createRecordedSnapshot,
  validateRecordedSnapshot,
} from '../src/lib/jev/recorded-playground.js';
import {
  RECORDED_POST_IDS,
  recordedQuestions,
  recordedQuestionMap,
  recordedSelection,
} from '../src/lib/jev/recorded-playground-config.js';
import {
  createCachedRecordedRun,
  writeJsonAtomic,
} from '../src/lib/jev/recorded-generation.js';
import { probabilityRows, estimatedRunCost } from '../src/lib/jev/playground.js';
import { MODEL } from '../src/lib/jev/rubrics.js';
import Pipeline, {
  RecordedResult,
} from '../src/components/unique/jev/Pipeline.jsx';
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

const postsWithLeadingNonProse = new Set([
  'programming-portals',
  'folk-interfaces',
  'assumed-audience',
  'ambient-copresence',
  'growing-a-human',
  'ai-enlightenment',
]);

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
    ...(postsWithLeadingNonProse.has(id)
      ? [{ id: 'p0', text: 'Curated introductory block.', heading: '', citations: [] }]
      : []),
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

test('the hydrated pipeline imports only browser-safe recorded playground config', async () => {
  const [pipeline, config] = await Promise.all([
    fs.readFile('src/components/unique/jev/Pipeline.jsx', 'utf8'),
    fs.readFile('src/lib/jev/recorded-playground-config.js', 'utf8'),
  ]);
  assert.match(pipeline, /lib\/jev\/recorded-playground-config\.js/);
  assert.doesNotMatch(pipeline, /lib\/jev\/recorded-playground\.js/);
  assert.doesNotMatch(config, /node:|corpus\.js|recorded-playground\.js|(?:^|['"])fs(?:['"]|$)|(?:^|['"])path(?:['"]|$)/m);
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

test('preview skips a curated HTML heading even when it looks like a sentence', () => {
  assert.equal(
    previewSentences({
      id: 'programming-portals',
      paragraphs: [
        { id: 'p1', text: 'A Portal Into Programming Ideas.', heading: '', citations: [] },
        {
          id: 'p2',
          text: 'The first complete prose sentence follows. The second complete prose sentence follows it.',
          heading: '',
          citations: [],
        },
      ],
    }),
    'The first complete prose sentence follows. The second complete prose sentence follows it.',
  );
});

test('preview skips a curated AssumedAudience block with punctuated noun phrases', () => {
  assert.equal(
    previewSentences({
      id: 'assumed-audience',
      paragraphs: [
        {
          id: 'p1',
          text: 'Designers, writers, technologists, and researchers. Curious people, thoughtful practitioners, and newcomers.',
          heading: '',
          citations: [],
        },
        {
          id: 'p2',
          text: 'The article opens with actual explanatory prose. Its second sentence continues the central idea.',
          heading: '',
          citations: [],
        },
      ],
    }),
    'The article opens with actual explanatory prose. Its second sentence continues the central idea.',
  );
});

test('preview joins inline-fragment paragraphs before sentence segmentation', () => {
  assert.equal(
    previewSentences({
      id: 'ambient-copresence',
      paragraphs: [
        { id: 'p0', text: 'Ambient copresence among networked collaborators.', heading: '', citations: [] },
        { id: 'p1', text: 'We need a', heading: '', citations: [] },
        { id: 'p2', text: 'synchronous way to feel present together. The shared space should remain calm and peripheral.', heading: '', citations: [] },
      ],
    }),
    'We need a synchronous way to feel present together. The shared space should remain calm and peripheral.',
  );
  assert.equal(
    previewSentences({
      id: 'ambient-copresence',
      paragraphs: [
        { id: 'p0', text: 'Ambient copresence among networked collaborators.', heading: '', citations: [] },
        { id: 'p1', text: "It's hard to feel present together.", heading: '', citations: [] },
        { id: 'p2', text: 'You and I are currently in an', heading: '', citations: [] },
        { id: 'p3', text: 'a', heading: '', citations: [] },
        { id: 'p4', text: 'synchronous exchange.', heading: '', citations: [] },
      ],
    }),
    "It's hard to feel present together. You and I are currently in an asynchronous exchange.",
  );
});

test('preview ignores punctuated micro-fragments when filling its two slots', () => {
  assert.equal(
    previewSentences({
      id: 'planning-agents',
      paragraphs: [{
        id: 'p1',
        text: 'Planning used to be a human activity. With agents. It becomes a collaboration across several different timescales.',
        heading: '',
        citations: [],
      }],
    }),
    'Planning used to be a human activity. It becomes a collaboration across several different timescales.',
  );
  assert.throws(
    () => previewSentences({
      paragraphs: [
        { id: 'p2', text: 'Only one complete prose sentence follows.', heading: '', citations: [] },
      ],
    }),
    /exactly two eligible prose sentences/,
  );
});

test('preview keeps a middle initial with the sentence it belongs to', () => {
  assert.equal(
    previewSentences({
      id: 'ai-enlightenment',
      paragraphs: [
        { id: 'p0', text: 'Readers of essays about language models.', heading: '', citations: [] },
        {
          id: 'p1',
          text: "I don't pay much attention to the torrent of AI think pieces. But this one, by Princeton professor David A. Bell hits some good notes.",
          heading: '',
          citations: [],
        },
        { id: 'p2', text: 'reference', heading: '', citations: [] },
        {
          id: 'p3',
          text: 'As an expert on the Enlightenment, he has been asked to develop an opinion.',
          heading: '',
          citations: [],
        },
      ],
    }),
    "I don't pay much attention to the torrent of AI think pieces. But this one, by Princeton professor David A. Bell hits some good notes.",
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
      posts: snapshot.posts.map((post, index) => index
        ? post
        : { ...post, preview: 'This preview is deliberately wrong. Its second sentence is wrong too.' }),
    }, documents),
    /metadata does not match current source: garden-history/,
  );
  assert.throws(
    () => validateRecordedSnapshot({
      ...snapshot,
      posts: snapshot.posts.map((post, index) => index
        ? post
        : { ...post, preview: 'Only one complete sentence.' }),
    }),
    /preview must contain exactly two complete prose sentences: garden-history/,
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

  assert.match(html, /75%/);
  assert.doesNotMatch(html, /Use the answer in code|Decision threshold|jev-play-rule/);
});

const viewerSnapshot = {
  version: 1,
  generatedAt: '2026-09-23T08:30:00.000Z',
  model: MODEL,
  posts: [{
    id: 'garden-history',
    title: 'A Brief History & Ethos of the Digital Garden',
    preview: 'Gardens are personal spaces. They grow over time.',
    elapsedMs: 320,
    usage: { input_tokens: 100, output_tokens: 10 },
    answers: {
      title_fit: { type: 'noul', noul: 0.93 },
      analogy: { type: 'noul', noul: 0.62 },
    },
  }],
};

test('recorded viewer shows selectors, two-sentence preview, and saved answer', () => {
  const html = renderToStaticMarkup(React.createElement(Pipeline, { snapshot: viewerSnapshot }));
  assert.match(html, /A Brief History &amp; Ethos of the Digital Garden/);
  assert.match(html, /Gardens are personal spaces\. They grow over time\./);
  assert.match(html, /Does the title fit the content\?/);
  assert.match(html, /93%/);
  assert.match(html, /Recorded Jev run/);
  assert.doesNotMatch(html, /textarea|View or edit|Exact request and response|Asking Jev|Waiting for edits/);
});

test('recorded result switches to the selected saved question', () => {
  const title = renderToStaticMarkup(React.createElement(RecordedResult, {
    snapshot: viewerSnapshot,
    postId: 'garden-history',
    questionId: 'title_fit',
  }));
  const analogy = renderToStaticMarkup(React.createElement(RecordedResult, {
    snapshot: viewerSnapshot,
    postId: 'garden-history',
    questionId: 'analogy',
  }));
  assert.match(title, /93%/);
  assert.match(analogy, /62%/);
});

test('recorded result reports absent authored data without making a request', () => {
  const html = renderToStaticMarkup(React.createElement(RecordedResult, {
    snapshot: viewerSnapshot,
    postId: 'garden-history',
    questionId: 'knowledge',
  }));
  assert.match(html, /This recorded answer is unavailable/);
});

test('published playground has no live hook, editor, service, or API route', async () => {
  const removed = [
    'src/components/unique/jev/QuestionEditor.jsx',
    'src/components/unique/jev/usePlayground.js',
    'src/lib/jev/playground-service.js',
    'src/pages/api/jev-playground.js',
  ];
  for (const file of removed) await assert.rejects(fs.access(file));
  const pipeline = await fs.readFile('src/components/unique/jev/Pipeline.jsx', 'utf8');
  assert.doesNotMatch(pipeline, /fetch\s*\(|usePlayground|QuestionEditor|Inspector/);
});
