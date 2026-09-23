import { documentQuestions, lensQuestions, noul, choice } from './rubrics.js';

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

export function recordedSelection(snapshot, postId, questionId) {
  const post = snapshot.posts.find(candidate => candidate.id === postId);
  const definition = recordedQuestions.find(candidate => candidate.id === questionId);
  const answer = post?.answers?.[questionId];
  return post && definition && answer ? { post, ...definition, answer } : null;
}
