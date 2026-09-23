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

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
const leadingParagraphOffsets = new Map([
  ['programming-portals', 1],
  ['folk-interfaces', 1],
  ['assumed-audience', 1],
  ['ambient-copresence', 1],
  ['growing-a-human', 1],
  ['ai-enlightenment', 1],
]);
const endsSentence = text => /[.!?…](?:["'”’)\]}]+)?$/u.test(text);
const isPreviewSentence = sentence => (
  endsSentence(sentence)
  && [...wordSegmenter.segment(sentence)].filter(({ isWordLike }) => isWordLike).length >= 4
);
const normalizePreviewText = text => text.replace(/\ban a synchronous\b/giu, 'an asynchronous');
const sentenceSegments = texts => {
  const segments = texts
    .flatMap(text => [...segmenter.segment(text)].map(({ segment }) => segment.trim()))
    .filter(Boolean);
  const merged = [];
  for (let index = 0; index < segments.length; index++) {
    let sentence = segments[index];
    while (/\b[A-Z]\.$/u.test(sentence) && segments[index + 1]) {
      sentence = `${sentence} ${segments[++index]}`;
    }
    merged.push(sentence);
  }
  return merged;
};

export function previewSentences(doc) {
  const offset = leadingParagraphOffsets.get(doc.id) ?? 0;
  const prose = doc.paragraphs
    .slice(offset)
    .filter(paragraph => paragraph.source !== 'image_alt')
    .map(paragraph => paragraph.text)
    .reduce((chunks, text) => {
      const previous = chunks.at(-1);
      if (!previous || endsSentence(previous)) chunks.push(text);
      else chunks[chunks.length - 1] = `${previous} ${text}`;
      return chunks;
    }, []);
  const sentences = sentenceSegments(prose)
    .filter(isPreviewSentence)
    .slice(0, 2);
  if (sentences.length !== 2) {
    throw new Error(
      `Recorded playground source must supply exactly two eligible prose sentences: ${doc.id || doc.title || 'unknown'}`,
    );
  }
  return normalizePreviewText(sentences.join(' '));
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
    const previewSegments = sentenceSegments([post.preview]);
    if (previewSegments.length !== 2 || !previewSegments.every(isPreviewSentence)) {
      throw new Error(`Recorded playground preview must contain exactly two complete prose sentences: ${post.id}`);
    }
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
