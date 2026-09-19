import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCorpus, hash } from '../../src/lib/jev/corpus.js';
import { evaluate, validateResponse } from '../../src/lib/jev/client.js';
import { MODEL, lensQuestions, documentQuestions, relationshipQuestions, sentenceQuestions } from '../../src/lib/jev/rubrics.js';
import { lexicalSearch, bestParagraphs } from '../../src/lib/jev/search.js';
import { sentenceUnits } from '../../src/lib/jev/sentences.js';

const root = process.cwd();
const cacheDir = path.join(root, '.cache/jev');
const output = path.join(root, 'src/data/jev/garden.json');
const phase = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'all';
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || Infinity);
if (!['all', 'profiles', 'relations', 'epistemic'].includes(phase)) throw new Error('Unknown generation phase');
await fs.mkdir(cacheDir, { recursive: true });
const documents = (await loadCorpus(root)).slice(0, limit);
const corpusHash = hash(documents);
const topics = [...new Set(documents.flatMap((d) => d.topics))].sort();
let snapshot = { version: 1, generatedAt: null, model: MODEL, corpusHash, topics,
  usage: { input_tokens: 0, output_tokens: 0 }, evaluations: {}, documents, relations: [], examples: {} };
const used = new Map();

async function ask(state, questions) {
  const request = { model: MODEL, state, questions };
  const key = hash(request);
  const file = path.join(cacheDir, `${key}.json`);
  let response;
  try { response = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response = await evaluate(request);
    await fs.writeFile(file, JSON.stringify(response));
  }
  validateResponse(response, questions);
  used.set(key, response.usage);
  return { request, response };
}

async function parallel(items, task, name, concurrency = 4) {
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await task(items[index], index);
      done++;
      if (done % 10 === 0 || done === items.length) console.log(`${name}: ${done}/${items.length}`);
    }
  }));
}

async function save() {
  snapshot.evaluations = { ...snapshot.evaluations, ...Object.fromEntries(used) };
  snapshot.usage = Object.values(snapshot.evaluations).reduce((sum, usage) => ({
    input_tokens: sum.input_tokens + (usage?.input_tokens || 0), output_tokens: sum.output_tokens + (usage?.output_tokens || 0),
  }), { input_tokens: 0, output_tokens: 0 });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(`${output}.tmp`, JSON.stringify(snapshot));
  await fs.rename(`${output}.tmp`, output);
}

function sampledParagraphs(doc, maxCharacters = 44000) {
  const total = doc.paragraphs.reduce((n, p) => n + p.text.length, 0);
  if (total <= maxCharacters) return doc.paragraphs;
  // Preserve a spread across the whole article rather than silently using just its opening.
  const step = Math.ceil(total / maxCharacters);
  return doc.paragraphs.filter((_, i) => i % step === 0).map((p) => ({ ...p, text: p.text.slice(0, 3000) }));
}

console.log(`Corpus: ${documents.length} published canonical documents, ${topics.length} topics, ${documents.reduce((n, d) => n + d.paragraphs.length, 0)} paragraphs`);
if (phase !== 'all') {
  const previous = JSON.parse(await fs.readFile(output, 'utf8'));
  if (previous.corpusHash !== corpusHash) throw new Error('Corpus changed; run all phases to keep the snapshot consistent');
  snapshot = previous;
  snapshot.documents = documents.map((d) => ({ ...d, ...previous.documents.find((p) => p.id === d.id) }));
}

if (phase === 'all' || phase === 'profiles') {
  await parallel(snapshot.documents, async (doc) => {
    const sample = await ask({ title: doc.title, description: doc.description, paragraphs: sampledParagraphs(doc) }, documentQuestions(topics));
    const answers = sample.response.answers;
    doc.lenses = Object.fromEntries(Object.keys(lensQuestions).map((key) => [key, answers[key]]));
    doc.tending = Object.fromEntries(Object.entries(answers).filter(([key]) => !Object.hasOwn(lensQuestions, key)));
    doc.suggestedTopics = topics.map((topic, i) => ({ topic, probability: answers[`topic_${i}`].noul }))
      .filter((t) => t.probability >= 0.8 && !doc.topics.includes(t.topic)).sort((a, b) => b.probability - a.probability).slice(0, 4);
    if (doc.id === 'cozy-web' || !snapshot.examples.document) snapshot.examples.document = sample;
  }, 'Profiles');
  await save();
}

if (phase === 'all' || phase === 'relations') {
  const relationGroups = [];
  await parallel(snapshot.documents, async (doc, index) => {
    if (!doc.paragraphs.length) { relationGroups[index] = []; return; }
    const query = `${doc.title} ${doc.description} ${doc.topics.join(' ')}`;
    const ranked = lexicalSearch(query, snapshot.documents, snapshot.documents.length);
    const candidates = snapshot.documents.filter((d) => d.id !== doc.id && d.paragraphs.length)
      .map((target) => ({ target, score: (ranked.find((r) => r.id === target.id)?.score || 0)
        + target.topics.filter((topic) => doc.topics.includes(topic)).length * 3
        + (doc.outbound.includes(target.id) || doc.inbound.includes(target.id) ? 20 : 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 8).map(({ target }) => ({
        id: target.id, title: target.title, description: target.description,
        paragraphs: bestParagraphs(query, target, 6).map((p) => ({ ...p, text: p.text.slice(0, 1100) })),
      }));
    const source = { id: doc.id, title: doc.title, description: doc.description,
      paragraphs: sampledParagraphs(doc, 18000).slice(0, 120).map((p) => ({ ...p, text: p.text.slice(0, 1100) })) };
    const sample = await ask({ source, candidates }, relationshipQuestions(candidates, source));
    const a = sample.response.answers;
    relationGroups[index] = candidates.map((target, i) => ({ source: doc.id, target: target.id,
      kind: a[`kind_${i}`], meaningful: a[`meaningful_${i}`], sourceParagraph: a[`source_${i}`],
      targetParagraph: a[`target_${i}`], authored: doc.outbound.includes(target.id) }));
    if (doc.id === 'cozy-web' || !snapshot.examples.relation) snapshot.examples.relation = sample;
  }, 'Relationships', 3);
  snapshot.relations = relationGroups.flat();
  await save();
}

if (phase === 'all' || phase === 'epistemic') {
  const jobs = [];
  for (const doc of snapshot.documents) {
    doc.epistemic = [];
    const sentences = doc.paragraphs.flatMap(sentenceUnits);
    let batch = [];
    let characters = 0;
    for (const sentence of sentences) {
      if (batch.length && (characters + sentence.text.length > 14000 || batch.length >= 14)) {
        jobs.push({ doc, sentences, batch }); batch = []; characters = 0;
      }
      batch.push(sentence); characters += sentence.text.length;
    }
    if (batch.length) jobs.push({ doc, sentences, batch });
  }
  await parallel(jobs, async ({ doc, sentences, batch }) => {
    const first = sentences.indexOf(batch[0]);
    const last = first + batch.length;
    const sample = await ask({ title: doc.title, sentences: batch,
      previousSentence: sentences[first - 1] || null, nextSentence: sentences[last] || null }, sentenceQuestions(batch));
    const a = sample.response.answers;
    doc.epistemic.push(...batch.map((sentence, i) => ({ sentenceId: sentence.id, paragraphId: sentence.paragraphId,
      kind: a[`kind_${i}`], needsCitation: a[`citation_${i}`], qualification: a[`qualification_${i}`] })));
    if (doc.id === 'cozy-web' || !snapshot.examples.epistemic) snapshot.examples.epistemic = sample;
  }, 'Sentences');
  for (const doc of snapshot.documents) {
    const order = new Map(doc.paragraphs.flatMap(sentenceUnits).map((sentence, index) => [sentence.id, index]));
    doc.epistemic.sort((a, b) => order.get(a.sentenceId) - order.get(b.sentenceId));
  }
}
snapshot.generatedAt = new Date().toISOString();
await save();
console.log(`Saved ${snapshot.documents.length} documents, ${snapshot.relations.length} evaluated relationships. Input: ${snapshot.usage.input_tokens.toLocaleString()} tokens; estimated $${(snapshot.usage.input_tokens * 0.042 / 1e6).toFixed(4)}.`);
