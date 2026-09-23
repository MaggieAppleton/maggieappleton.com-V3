import { validateResponse } from './client.js';
import { hash } from './corpus.js';
import { MODEL } from './rubrics.js';
import {
  RECORDED_POST_IDS,
  recordedQuestions,
  recordedQuestionMap,
  recordedSelection,
} from './recorded-playground-config.js';

export {
  RECORDED_POST_IDS,
  recordedQuestions,
  recordedQuestionMap,
  recordedSelection,
};

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
  const documentIds = documents.map(doc => doc.id);
  if (new Set(documentIds).size !== documentIds.length) {
    throw new Error('Recorded playground source document IDs must be unique');
  }
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
    if (response.model !== MODEL) {
      throw new Error(`Recorded playground response model must be ${MODEL}`);
    }
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
  const currentDocuments = documents ? selectedDocuments(documents) : null;
  if (currentDocuments && snapshot.sourceHash !== hash(currentDocuments.map(articleState))) {
    throw new Error('Recorded playground source content has changed');
  }
  const ids = snapshot.posts.map(post => post.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== RECORDED_POST_IDS[index])) {
    throw new Error('Recorded playground posts are duplicated or out of order');
  }
  for (const [index, post] of snapshot.posts.entries()) {
    if (!post.title || !post.preview) throw new Error(`Recorded playground metadata is incomplete: ${post.id}`);
    const currentDocument = currentDocuments?.[index];
    if (currentDocument
      && (post.title !== currentDocument.title || post.preview !== previewSentences(currentDocument))) {
      throw new Error(`Recorded playground metadata does not match current source: ${post.id}`);
    }
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
