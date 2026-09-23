# Static Jev Demos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live Jev Playground with a read-only explorer of 84 recorded answers while preserving the already-static sandwich sorter.

**Architecture:** A focused domain module owns the approved post IDs, six immutable question definitions, snapshot construction, and snapshot validation. Explicit authoring scripts generate and check a compact committed snapshot; the hydrated React component only imports that snapshot and switches among saved answers in local state. The live browser hook, editor, server endpoint, and in-memory API service are removed so no published interaction can invoke Jev.

**Tech Stack:** Astro 5, React 18, JavaScript ES modules, Node.js test runner, existing Jev client and corpus extractor

---

## File Structure

### Create

- `src/lib/jev/recorded-playground.js` — approved post/question configuration, two-sentence preview extraction, snapshot construction, lookup, and validation.
- `src/lib/jev/recorded-generation.js` — Node-only exact-request cache and atomic JSON writing for recorded Jev runs.
- `scripts/jev/generate-playground.js` — explicit API-calling author command that creates the committed snapshot.
- `scripts/jev/check-playground.js` — no-network command that checks the committed snapshot against current source and rubrics.
- `src/data/jev/playground.json` — generated compact snapshot containing 14 posts and 84 answers.

### Modify

- `src/components/unique/jev/Pipeline.jsx` — replace the editable live evaluator with the recorded-run selector and renderer.
- `src/components/unique/jev/JevIslandEntries.jsx` — pass the dedicated playground snapshot to `Pipeline`.
- `src/components/unique/jev/RunTelemetry.jsx` — describe saved run metadata without live-request language.
- `src/components/unique/jev/playground.css` — remove editor/status styles and style the simplified selectors and preview.
- `src/lib/jev/playground.js` — retain shared answer/cost helpers while removing live-request presets and validation.
- `tests/jev-playground.test.mjs` — replace endpoint/cache coverage with recorded-domain, generation, viewer, and no-network coverage.
- `tests/jev-sorter.test.mjs` — assert the sandwich implementation remains authored data with no network call.
- `package.json` — add explicit generate/check scripts only; do not attach generation to build or dev.
- `scripts/jev/README.md` — document the recorded playground workflow and runtime boundary.

### Delete

- `src/components/unique/jev/QuestionEditor.jsx` — no questions or criteria remain editable.
- `src/components/unique/jev/usePlayground.js` — no browser request lifecycle remains.
- `src/lib/jev/playground-service.js` — no runtime playground service remains.
- `src/pages/api/jev-playground.js` — remove the public route that could invoke Jev.

## Snapshot Contract

The committed `src/data/jev/playground.json` uses this shape:

```js
{
  version: 1,
  generatedAt: "2026-09-23T08:30:00.000Z",
  model: "jev-1.13.0",
  questionsHash: "sha256...",
  sourceHash: "sha256...",
  usage: { input_tokens: 12345, output_tokens: 678 },
  posts: [
    {
      id: "garden-history",
      title: "A Brief History & Ethos of the Digital Garden",
      preview: "First sentence. Second sentence.",
      answers: {
        title_fit: { type: "noul", noul: 0.97 },
        analogy: { type: "noul", noul: 0.84 },
        growth_stage: {
          type: "choice",
          choice: "evergreen",
          confidence: 0.71,
          probabilities: { seedling: 0.02, budding: 0.14, evergreen: 0.84 }
        },
        mode: {
          type: "choice",
          choice: "explanation",
          confidence: 0.63,
          probabilities: {
            explanation: 0.66,
            argument: 0.14,
            tutorial: 0.03,
            reflection: 0.12,
            other: 0.05
          }
        },
        knowledge: {
          type: "score",
          score: 1.35,
          confidence: 0.58,
          probabilities: { "0": 0.08, "1": 0.58, "2": 0.27, "3": 0.06, "4": 0.01 }
        },
        speculation: {
          type: "score",
          score: 1.7,
          confidence: 0.49,
          probabilities: { "0": 0.08, "1": 0.36, "2": 0.37, "3": 0.16, "4": 0.03 }
        }
      },
      elapsedMs: 482,
      usage: { input_tokens: 1560, output_tokens: 94 }
    }
  ]
}
```

The numbers above illustrate the contract only. The generator writes the real
Jev responses; no answer values are hand-authored during implementation.

### Task 1: Define and Validate the Recorded Playground Domain

**Files:**
- Create: `src/lib/jev/recorded-playground.js`
- Modify: `src/lib/jev/playground.js`
- Modify: `tests/jev-playground.test.mjs`

- [ ] **Step 1: Replace live-preset tests with failing recorded-domain tests**

Keep the existing `probabilityRows`, `estimatedRunCost`, and
`PlaygroundAnswer` assertions in `tests/jev-playground.test.mjs`. Replace the
imports and tests for `playgroundPresets`, `topicQuestions`,
`structuredQuestion`, `validatePlaygroundRequest`, `createPlaygroundService`,
and `POST` with these imports and tests:

```js
import {
  RECORDED_POST_IDS,
  recordedQuestions,
  articleState,
  previewSentences,
  createRecordedSnapshot,
  validateRecordedSnapshot,
  recordedSelection,
} from '../src/lib/jev/recorded-playground.js';
import { MODEL } from '../src/lib/jev/rubrics.js';

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
```

- [ ] **Step 2: Run the focused test and verify the new module is missing**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/lib/jev/recorded-playground.js`.

- [ ] **Step 3: Implement the immutable domain configuration**

Create `src/lib/jev/recorded-playground.js` with the approved IDs and
questions. Reuse the existing canonical rubrics rather than copying maturity,
knowledge, speculation, or title-fit definitions:

```js
import { validateResponse } from './client.js';
import { hash } from './corpus.js';
import { MODEL, documentQuestions, lensQuestions, noul, choice } from './rubrics.js';

export const RECORDED_POST_IDS = [
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

const profile = documentQuestions([]);

export const recordedQuestions = [
  { id: 'title_fit', label: 'Does the title fit the content?', question: profile.title_fit },
  {
    id: 'analogy',
    label: 'Explain through an analogy',
    question: {
      ...noul('Does this article use an analogy to explain an idea?'),
      criteria: {
        true: 'A comparison helps explain how something works.',
        false: 'No explanatory comparison; a passing metaphor alone does not count.',
      },
    },
  },
  { id: 'growth_stage', label: 'Editorial maturity', question: profile.growth_stage },
  {
    id: 'mode',
    label: 'Mode of writing',
    question: choice('Which mode of writing best describes the article as a whole?', {
      explanation: 'Primarily explains an idea',
      argument: 'Primarily argues for a position',
      tutorial: 'Primarily teaches a procedure',
      reflection: 'Primarily reflects on personal experience',
      other: 'None of these fits',
    }),
  },
  { id: 'knowledge', label: 'Prior knowledge', question: lensQuestions.knowledge },
  { id: 'speculation', label: 'Speculation', question: lensQuestions.speculation },
];

export const recordedQuestionMap = Object.fromEntries(
  recordedQuestions.map(({ id, question }) => [id, question]),
);

export const articleState = doc => ({
  title: doc.title,
  description: doc.description,
  paragraphs: doc.paragraphs,
});

export function previewSentences(doc) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sentences = doc.paragraphs
    .filter(paragraph => paragraph.source !== 'image_alt')
    .flatMap(paragraph => [...segmenter.segment(paragraph.text)].map(({ segment }) => segment.trim()))
    .filter(Boolean)
    .slice(0, 2);
  return sentences.join(' ');
}

function selectedDocuments(documents) {
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  const selected = RECORDED_POST_IDS.map(id => byId.get(id));
  const missing = RECORDED_POST_IDS.filter((_, index) => !selected[index]);
  if (missing.length) throw new Error(`Missing recorded playground posts: ${missing.join(', ')}`);
  if (new Set(RECORDED_POST_IDS).size !== RECORDED_POST_IDS.length) {
    throw new Error('Recorded playground post IDs must be unique');
  }
  return selected;
}

function sourceStates(documents) {
  return selectedDocuments(documents).map(articleState);
}

export async function createRecordedSnapshot(documents, { run, generatedAt = new Date().toISOString() }) {
  const selected = selectedDocuments(documents);
  const posts = [];
  for (const doc of selected) {
    const { response, elapsedMs } = await run(articleState(doc), recordedQuestionMap);
    validateResponse(response, recordedQuestionMap);
    posts.push({
      id: doc.id,
      title: doc.title,
      preview: previewSentences(doc),
      answers: response.answers,
      elapsedMs,
      usage: response.usage,
    });
  }
  const usage = posts.reduce((total, post) => ({
    input_tokens: total.input_tokens + (post.usage?.input_tokens || 0),
    output_tokens: total.output_tokens + (post.usage?.output_tokens || 0),
  }), { input_tokens: 0, output_tokens: 0 });
  return {
    version: 1,
    generatedAt,
    model: MODEL,
    questionsHash: hash(recordedQuestionMap),
    sourceHash: hash(sourceStates(documents)),
    usage,
    posts,
  };
}

export function validateRecordedSnapshot(snapshot, documents) {
  if (snapshot?.version !== 1) throw new Error('Unsupported recorded playground snapshot version');
  if (snapshot.model !== MODEL) throw new Error(`Recorded playground model must be ${MODEL}`);
  if (snapshot.questionsHash !== hash(recordedQuestionMap)) {
    throw new Error('Recorded playground question definitions have changed');
  }
  if (!Array.isArray(snapshot.posts) || snapshot.posts.length !== RECORDED_POST_IDS.length) {
    throw new Error(`Expected ${RECORDED_POST_IDS.length} recorded posts`);
  }
  if (!Number.isFinite(Date.parse(snapshot.generatedAt))) {
    throw new Error('Recorded playground generation date is invalid');
  }
  if (documents && snapshot.sourceHash !== hash(sourceStates(documents))) {
    throw new Error('Recorded playground source content has changed');
  }
  const ids = snapshot.posts.map(post => post.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== RECORDED_POST_IDS[index])) {
    throw new Error('Recorded playground posts are duplicated or out of order');
  }
  for (const post of snapshot.posts) {
    if (!post.title || !post.preview) throw new Error(`Recorded playground metadata is incomplete: ${post.id}`);
    if (!Number.isFinite(post.elapsedMs) || post.elapsedMs < 0) {
      throw new Error(`Recorded playground timing is invalid: ${post.id}`);
    }
    if (!post.usage || !Number.isFinite(post.usage.input_tokens) || !Number.isFinite(post.usage.output_tokens)) {
      throw new Error(`Recorded playground usage is invalid: ${post.id}`);
    }
    const answerIds = Object.keys(post.answers ?? {});
    const expectedAnswerIds = recordedQuestions.map(({ id }) => id);
    if (answerIds.length !== expectedAnswerIds.length
      || answerIds.some((id, index) => id !== expectedAnswerIds[index])) {
      throw new Error(`Recorded playground answer IDs do not match: ${post.id}`);
    }
    validateResponse({ model: snapshot.model, answers: post.answers }, recordedQuestionMap);
  }
  const aggregateUsage = snapshot.posts.reduce((total, post) => ({
    input_tokens: total.input_tokens + post.usage.input_tokens,
    output_tokens: total.output_tokens + post.usage.output_tokens,
  }), { input_tokens: 0, output_tokens: 0 });
  if (snapshot.usage?.input_tokens !== aggregateUsage.input_tokens
    || snapshot.usage?.output_tokens !== aggregateUsage.output_tokens) {
    throw new Error('Recorded playground aggregate usage does not match its posts');
  }
  return snapshot;
}

export function recordedSelection(snapshot, postId, questionId) {
  const post = snapshot.posts.find(candidate => candidate.id === postId);
  const definition = recordedQuestions.find(candidate => candidate.id === questionId);
  const answer = post?.answers?.[questionId];
  return post && definition && answer ? { post, ...definition, answer } : null;
}
```

- [ ] **Step 4: Remove live-only exports from the shared playground helper**

Edit `src/lib/jev/playground.js` so it contains only:

```js
export const JEV_INPUT_PRICE_PER_MILLION = 0.042;

export function estimatedRunCost(usage) {
  const inputTokens = usage?.input_tokens;
  return Number.isFinite(inputTokens) && inputTokens >= 0
    ? inputTokens * JEV_INPUT_PRICE_PER_MILLION / 1_000_000
    : null;
}

export function probabilityRows(question, answer) {
  if (answer.type === 'noul') {
    return [{ label: 'Yes', value: answer.noul }, { label: 'No', value: 1 - answer.noul }];
  }
  const keys = answer.type === 'choice'
    ? Object.keys(question.criteria)
    : question.criteria.map((_, index) => String(index));
  return keys.map(key => {
    const level = answer.legend?.[key] ?? question.criteria[Number(key)];
    return {
      label: answer.type === 'score'
        ? `${key} · ${typeof level === 'string' ? level : JSON.stringify(level)}`
        : key,
      value: answer.probabilities[key],
      selected: answer.type === 'choice' && answer.choice === key,
    };
  });
}
```

- [ ] **Step 5: Run the recorded-domain and existing answer tests**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: PASS, including 14 posts, six questions, one batched run per post,
two-sentence previews, malformed snapshot rejection, stale source rejection,
cost calculation, probability rows, and answer rendering.

- [ ] **Step 6: Commit the domain module**

```bash
git add src/lib/jev/recorded-playground.js src/lib/jev/playground.js tests/jev-playground.test.mjs
git commit -m "feat: define recorded Jev playground" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Add Explicit Generation and No-Network Checking

**Files:**
- Create: `src/lib/jev/recorded-generation.js`
- Create: `scripts/jev/generate-playground.js`
- Create: `scripts/jev/check-playground.js`
- Create: `src/data/jev/playground.json`
- Modify: `tests/jev-playground.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing cache and atomic-write tests**

Append these imports and tests to `tests/jev-playground.test.mjs`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createCachedRecordedRun,
  writeJsonAtomic,
} from '../src/lib/jev/recorded-generation.js';

test('recorded generation cache reuses an identical request without calling Jev again', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-recorded-cache-'));
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

test('atomic JSON writing leaves a complete parseable destination', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-recorded-write-'));
  const destination = path.join(directory, 'playground.json');
  await writeJsonAtomic(destination, { complete: true });
  assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')), { complete: true });
  await assert.rejects(fs.access(`${destination}.tmp`));
});
```

Also add `recordedQuestionMap` to the import from
`src/lib/jev/recorded-playground.js`.

- [ ] **Step 2: Run the focused test and verify the generation module is missing**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/lib/jev/recorded-generation.js`.

- [ ] **Step 3: Implement the exact-request cache and atomic writer**

Create `src/lib/jev/recorded-generation.js`:

```js
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
```

- [ ] **Step 4: Add the explicit generator**

Create `scripts/jev/generate-playground.js`:

```js
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
```

- [ ] **Step 5: Add the no-network checker**

Create `scripts/jev/check-playground.js`:

```js
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
```

- [ ] **Step 6: Register author-only package scripts**

Add these entries to `package.json` immediately after the existing Jev scripts:

```json
"jev:generate-playground": "node scripts/jev/generate-playground.js",
"jev:check-playground": "node scripts/jev/check-playground.js",
```

Do not add either command to `dev`, `build`, or `build:local`.

- [ ] **Step 7: Run the cache tests**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: PASS with one fake evaluation across two identical cached runs and
an atomically written JSON file.

- [ ] **Step 8: Generate the real committed snapshot**

Confirm the ignored root `.env` contains `TYPESAFE_API_KEY`, then run:

```bash
npm run jev:generate-playground
```

Expected:

```text
Recorded 14 posts × 6 questions in .../src/data/jev/playground.json
Usage: <positive input token count> input tokens, <non-negative output token count> output tokens
```

The command makes at most 14 uncached API calls. If it is interrupted, rerun
the same command; completed exact requests are loaded from
`.cache/jev/recorded-playground/`.

- [ ] **Step 9: Verify the generated snapshot without network access**

Run:

```bash
npm run jev:check-playground
```

Expected:

```text
Verified 14 recorded posts and 84 saved answers.
```

- [ ] **Step 10: Commit generation and snapshot data**

```bash
git add package.json scripts/jev/generate-playground.js scripts/jev/check-playground.js src/lib/jev/recorded-generation.js src/data/jev/playground.json tests/jev-playground.test.mjs
git commit -m "feat: generate recorded Jev answers" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Replace the Live Playground with the Recorded Viewer

**Files:**
- Modify: `src/components/unique/jev/Pipeline.jsx`
- Modify: `src/components/unique/jev/JevIslandEntries.jsx`
- Modify: `src/components/unique/jev/RunTelemetry.jsx`
- Modify: `src/components/unique/jev/playground.css`
- Modify: `tests/jev-playground.test.mjs`
- Delete: `src/components/unique/jev/QuestionEditor.jsx`
- Delete: `src/components/unique/jev/usePlayground.js`
- Delete: `src/lib/jev/playground-service.js`
- Delete: `src/pages/api/jev-playground.js`

- [ ] **Step 1: Add failing recorded-viewer and route-removal tests**

Add these imports and tests to `tests/jev-playground.test.mjs`:

```js
import Pipeline, {
  RecordedResult,
} from '../src/components/unique/jev/Pipeline.jsx';

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
  assert.match(html, /93\.0%/);
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
  assert.match(title, /93\.0%/);
  assert.match(analogy, /62\.0%/);
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
```

- [ ] **Step 2: Run the viewer tests and verify they fail on the live UI**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: FAIL because `RecordedResult` is not exported and the live files
still exist.

- [ ] **Step 3: Replace `Pipeline.jsx` with a local recorded-run viewer**

Replace `src/components/unique/jev/Pipeline.jsx` with:

```jsx
import React, { useState } from 'react';
import {
  recordedQuestions,
  recordedSelection,
} from '../../../lib/jev/recorded-playground.js';
import { ArticleSelect } from './shared.jsx';
import PlaygroundAnswer from './PlaygroundAnswer.jsx';
import RunTelemetry from './RunTelemetry.jsx';

export function RecordedResult({ snapshot, postId, questionId }) {
  const selected = recordedSelection(snapshot, postId, questionId);
  if (!selected) {
    return <p className="jev-error" role="status">This recorded answer is unavailable.</p>;
  }
  return <>
    <RunTelemetry
      generatedAt={snapshot.generatedAt}
      model={snapshot.model}
      elapsedMs={selected.post.elapsedMs}
      usage={selected.post.usage}
    />
    <PlaygroundAnswer
      id={selected.id}
      question={selected.question}
      answer={selected.answer}
    />
  </>;
}

export default function Pipeline({ snapshot }) {
  const [postId, setPostId] = useState(snapshot.posts[0]?.id ?? '');
  const [questionId, setQuestionId] = useState(recordedQuestions[0].id);
  const post = snapshot.posts.find(candidate => candidate.id === postId);

  return <div className="jev-playground">
    <div className="jev-play-inputs">
      <section className="jev-play-state" aria-label="Recorded state">
        <h3>1 · State</h3>
        <ArticleSelect
          documents={snapshot.posts}
          value={postId}
          label="Post"
          onChange={setPostId}
        />
        <p className="jev-state-excerpt">{post?.preview}</p>
      </section>
      <section aria-label="Recorded question">
        <h3>2 · Question</h3>
        <label className="jev-field">
          Ask about
          <select value={questionId} onChange={event => setQuestionId(event.target.value)}>
            {recordedQuestions.map(question => (
              <option value={question.id} key={question.id}>{question.label}</option>
            ))}
          </select>
        </label>
        <p className="jev-play-help">
          The question and answer definitions are fixed for this recorded run.
        </p>
      </section>
    </div>
    <div className="jev-play-results">
      <h3>3 · Jev’s answer</h3>
      <p className="jev-recorded-label">Recorded Jev run</p>
      <RecordedResult snapshot={snapshot} postId={postId} questionId={questionId} />
    </div>
  </div>;
}
```

- [ ] **Step 4: Pass only the dedicated snapshot to the playground**

In `src/components/unique/jev/JevIslandEntries.jsx`, keep the existing
`garden.json` import for the five later experiments and add:

```js
import playgroundSnapshot from '../../../data/jev/playground.json';
```

Change only `JevPlaygroundIsland`:

```jsx
export function JevPlaygroundIsland() {
  return <Pipeline snapshot={playgroundSnapshot} />;
}
```

- [ ] **Step 5: Reframe telemetry as historical metadata**

Replace `src/components/unique/jev/RunTelemetry.jsx` with:

```jsx
import React from 'react';
import {
  estimatedRunCost,
  JEV_INPUT_PRICE_PER_MILLION,
} from '../../../lib/jev/playground.js';

const formatCost = value => value === null ? 'Unavailable' : `$${value.toFixed(6)}`;
const formatSpeed = value => !Number.isFinite(value)
  ? 'Unavailable'
  : value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;

export default function RunTelemetry({ generatedAt, model, elapsedMs, usage }) {
  const date = Number.isFinite(Date.parse(generatedAt))
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(generatedAt))
    : 'Unknown date';
  const tokens = Number.isFinite(usage?.input_tokens)
    ? usage.input_tokens.toLocaleString()
    : 'Unavailable';
  return <dl className="jev-run-metrics" aria-label="Recorded Jev run details">
    <div>
      <dt>Recorded</dt>
      <dd>{date}</dd>
      <small>{model}</small>
    </div>
    <div>
      <dt>Original Jev speed</dt>
      <dd>{formatSpeed(elapsedMs)}</dd>
      <small>
        {tokens} input tokens · {formatCost(estimatedRunCost(usage))} at
        {' '}${JEV_INPUT_PRICE_PER_MILLION}/M
      </small>
    </div>
  </dl>;
}
```

- [ ] **Step 6: Remove the live-only files**

Delete:

```text
src/components/unique/jev/QuestionEditor.jsx
src/components/unique/jev/usePlayground.js
src/lib/jev/playground-service.js
src/pages/api/jev-playground.js
```

Before deleting each file, confirm `rg` shows no caller outside the files being
changed in this task:

```bash
rg -n "QuestionEditor|usePlayground|createPlaygroundService|api/jev-playground" src tests
```

Expected before deletion: matches only in `Pipeline.jsx`, the four removable
files, and old test lines being replaced. Expected after deletion: no matches.

- [ ] **Step 7: Simplify the playground CSS**

In `src/components/unique/jev/playground.css`:

- remove the textarea, question-type button, option-editor, stale-response,
  and previous-response rules;
- keep the two-column layout, answer bars, confidence, score explanation, and
  mobile breakpoint;
- remove `-webkit-line-clamp` from `.jev-state-excerpt`, because the generated
  preview is already exactly two sentences;
- add the recorded-run label:

```css
.jev .jev-recorded-label {
  margin: 0 0 var(--space-xs);
  color: var(--jev-muted);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

The resulting `.jev-state-excerpt` rule must remain readable and must not hide
part of the generated two-sentence preview:

```css
.jev .jev-playground .jev-state-excerpt {
  margin: var(--space-2xs) 0 0;
  color: var(--jev-muted);
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  line-height: var(--leading-loose);
}
```

- [ ] **Step 8: Run the recorded viewer tests**

Run:

```bash
node --import tsx --test tests/jev-playground.test.mjs
```

Expected: PASS. The rendered HTML includes both selectors, the complete
two-sentence preview, saved answer values, and recorded metadata, with no
editable or live-request UI.

- [ ] **Step 9: Commit the recorded viewer and endpoint removal**

```bash
git add src/components/unique/jev/Pipeline.jsx src/components/unique/jev/JevIslandEntries.jsx src/components/unique/jev/RunTelemetry.jsx src/components/unique/jev/playground.css src/components/unique/jev/QuestionEditor.jsx src/components/unique/jev/usePlayground.js src/lib/jev/playground-service.js src/pages/api/jev-playground.js tests/jev-playground.test.mjs
git commit -m "feat: serve recorded Jev playground runs" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Guard the Sandwich Boundary and Document the Workflow

**Files:**
- Modify: `tests/jev-sorter.test.mjs`
- Modify: `scripts/jev/README.md`

- [ ] **Step 1: Add a sandwich no-network regression test**

Append this test to `tests/jev-sorter.test.mjs`, reusing its existing `fs`
import or adding `import fs from 'node:fs/promises';`:

```js
test('sandwich sorter is backed only by saved authored probabilities', async () => {
  const source = await fs.readFile('src/components/unique/jev/SandwichSorter.astro', 'utf8');
  assert.match(source, /probabilities:\s*\{\s*no:/);
  assert.doesNotMatch(source, /fetch\s*\(|api\/jev|TYPESAFE_API_KEY|evaluate\s*\(/);
});
```

- [ ] **Step 2: Run the sorter test and confirm it passes without changes to the component**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: PASS, proving the sandwich sorter already meets the static-data
requirement.

- [ ] **Step 3: Update the developer notes**

Revise `scripts/jev/README.md` so the local-use section includes:

```markdown
- `npm run jev:generate-playground`: explicitly evaluate the 14 curated posts
  against the six fixed playground questions and write
  `src/data/jev/playground.json`. It reuses
  `.cache/jev/recorded-playground/`; only changed requests call Jev.
- `npm run jev:check-playground`: validate all 84 committed answers against the
  current curated source and fixed rubrics. This command makes no API calls.
```

Replace the paragraph that describes the top playground as editable and
debounced with:

```markdown
- The top playground is a read-only explorer of recorded Jev runs. Readers can
  switch among 14 curated posts and six fixed questions; the browser imports
  committed answers and never calls a playground endpoint. The selected post
  shows a two-sentence preview, not the full submitted state. Regeneration is
  an explicit author action and is never part of dev, build, or page load.
```

Remove statements about the one-hour playground cache, reader edits, playground
rate limit, public deployment API key, and the playground's dynamic endpoint.
Keep the separate live semantic-search endpoint documentation unchanged.

- [ ] **Step 4: Run the complete Jev test suite**

Run:

```bash
npm run test:jev
```

Expected: PASS with no request to TypeSafe. If an old test imports the removed
endpoint or service, delete that obsolete assertion rather than restoring live
playground code.

- [ ] **Step 5: Run the no-network snapshot check**

Run:

```bash
npm run jev:check-playground
```

Expected:

```text
Verified 14 recorded posts and 84 saved answers.
```

- [ ] **Step 6: Run the local production build**

Run:

```bash
npm run build:local
```

Expected: exit code 0. Confirm the build output contains no
`/api/jev-playground` route. Existing unrelated warnings may remain, but new
errors or warnings tied to the recorded playground must be fixed.

- [ ] **Step 7: Verify the published interaction in the browser**

Start the development server:

```bash
npm run dev
```

Open `/jev-gardens` and verify:

1. The sandwich sorter animates and reveals the same five saved distributions.
2. The playground post selector contains exactly the 14 approved titles.
3. The selected post shows exactly two complete prose sentences beneath it.
4. The question selector contains exactly the six approved questions.
5. Each post/question change updates the answer immediately with no loading
   state and no `/api/jev-playground` request in the network panel.
6. Noul, Choice, and Score answers each retain their existing readable
   probability visualisation.
7. The result is labelled as recorded and shows the original model/date.
8. No article editor, question editor, criteria editor, or request inspector
   is present.
9. At a narrow mobile width, selectors, preview, answer, and telemetry stack
   without horizontal overflow.

- [ ] **Step 8: Check formatting and the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: `git diff --check` exits 0. Review `git status --short` carefully
because the worktree contains unrelated pre-existing changes; only files from
this plan belong in the final commit.

- [ ] **Step 9: Commit documentation and verification guards**

```bash
git add scripts/jev/README.md tests/jev-sorter.test.mjs
git commit -m "docs: explain recorded Jev demos" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Final Acceptance Checklist

- [ ] The sandwich sorter has no runtime network path and its interaction is unchanged.
- [ ] The playground imports a dedicated committed snapshot rather than the 142-post garden snapshot.
- [ ] The post selector contains the approved 14 posts in the approved order.
- [ ] The selected post displays its first two complete prose sentences and no full-text editor.
- [ ] The question selector contains only title fit, analogy, maturity, mode, prior knowledge, and speculation.
- [ ] All question instructions, options, and score levels are immutable shared definitions.
- [ ] The snapshot contains valid results for all 84 post/question pairs.
- [ ] Generation makes one batched request per post and runs only through an explicit author command.
- [ ] Exact unchanged generation requests are loaded from the on-disk cache.
- [ ] The no-network checker detects missing, malformed, stale, reordered, and rubric-mismatched data.
- [ ] The published playground has no fetch call, live hook, server service, or `/api/jev-playground` route.
- [ ] Missing recorded data produces an explicit unavailable message and never a live fallback.
- [ ] Focused tests, the complete Jev suite, the snapshot check, and `build:local` pass.
- [ ] Desktop and narrow-width browser checks show immediate local switching with no playground request.
