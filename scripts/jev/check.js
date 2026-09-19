import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { hash, loadCorpus } from '../../src/lib/jev/corpus.js';
import { validateResponse } from '../../src/lib/jev/client.js';
import { MODEL, documentQuestions, sentenceQuestions, relationKinds } from '../../src/lib/jev/rubrics.js';
import { sentenceUnits } from '../../src/lib/jev/sentences.js';

const snapshot = JSON.parse(await fs.readFile('src/data/jev/garden.json', 'utf8'));
assert.ok(snapshot.generatedAt, 'Generation is incomplete');
assert.equal(snapshot.model, MODEL);
assert.equal(snapshot.corpusHash, hash(await loadCorpus()), 'Snapshot needs regenerating');
const documents = new Map(snapshot.documents.map(doc => [doc.id, doc]));
assert.equal(documents.size, snapshot.documents.length, 'Duplicate document IDs');
let sentences = 0;
for (const doc of documents.values()) {
  validateResponse({ model: MODEL, answers: { ...doc.lenses, ...doc.tending } }, documentQuestions(snapshot.topics));
  const units = doc.paragraphs.flatMap(sentenceUnits);
  assert.equal(doc.epistemic.length, units.length, `Missing sentence evaluations: ${doc.id}`);
  assert.equal(new Set(doc.epistemic.map(row => row.sentenceId)).size, units.length, `Duplicate sentence evaluations: ${doc.id}`);
  for (const sentence of units) {
    const row = doc.epistemic.find(item => item.sentenceId === sentence.id);
    assert.ok(row, `Missing ${doc.id}/${sentence.id}`);
    assert.equal(row.paragraphId, sentence.paragraphId, `Wrong paragraph for ${doc.id}/${sentence.id}`);
    validateResponse({ model: MODEL, answers: { kind_0: row.kind, citation_0: row.needsCitation, qualification_0: row.qualification } }, sentenceQuestions([sentence]));
  }
  for (const paragraph of doc.paragraphs) {
    assert.doesNotMatch(paragraph.text, /^import\s/, 'MDX import leaked into source text');
  }
  sentences += units.length;
  for (const linked of [...doc.inbound, ...doc.outbound]) assert.ok(documents.has(linked));
}
for (const relation of snapshot.relations) {
  assert.ok(documents.has(relation.source) && documents.has(relation.target));
  validateResponse({ model: MODEL, answers: { kind: relation.kind, meaningful: relation.meaningful } }, {
    kind: { type: 'choice', criteria: relationKinds }, meaningful: { type: 'noul' },
  });
  for (const [id, answer] of [[relation.source, relation.sourceParagraph], [relation.target, relation.targetParagraph]]) {
    const ids = new Set(['none', ...documents.get(id).paragraphs.map(p => p.id)]);
    for (const key of Object.keys(answer.probabilities)) assert.ok(ids.has(key), `Unknown evidence ${id}/${key}`);
    validateResponse({ model: MODEL, answers: { evidence: answer } }, { evidence: { type: 'choice', criteria: answer.probabilities } });
  }
}
for (const example of Object.values(snapshot.examples)) validateResponse(example.response, example.request.questions);
assert.ok(Object.keys(snapshot.evaluations).length);
const inputTokens = Object.values(snapshot.evaluations).reduce((sum, usage) => sum + usage.input_tokens, 0);
assert.equal(inputTokens, snapshot.usage.input_tokens);
console.log(`Verified ${documents.size} documents, ${sentences} sentences, ${snapshot.relations.length} relationships; source hash, evidence IDs, probabilities and usage ledger match.`);
