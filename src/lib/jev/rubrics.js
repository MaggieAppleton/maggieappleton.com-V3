export const MODEL = 'jev-1.13.0';
export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
export const noul = (instructions) => ({ type: 'noul', instructions });
export const score = (instructions, criteria) => ({ type: 'score', instructions, criteria });

export const lensQuestions = {
  knowledge: score('How much prior subject knowledge does this article assume?', ['No prior knowledge; explains foundational terms', 'Some everyday familiarity', 'Familiar with the field and its vocabulary', 'Practitioner knowledge', 'Specialist knowledge; substantial unexplained concepts']),
  practicality: score('How directly does this article help the reader do something concrete?', ['Purely reflective', 'Mostly ideas with occasional implications', 'Ideas and usable examples', 'Concrete techniques and advice', 'Step-by-step immediately usable methods']),
  abstraction: score('How abstract is the discussion?', ['Concrete things and specific events', 'Mostly concrete examples', 'Examples and general concepts balanced', 'Mostly general concepts', 'Theories, conceptual systems and abstractions']),
  speculation: score('How exploratory or speculative is the author\'s own argument? Distinguish this from simply discussing a speculative topic.', ['Reporting established material or direct experience', 'Mostly established material with interpretation', 'Interpretation and tentative ideas balanced', 'Exploring uncertain possibilities', 'Predominantly conjectural or open questions']),
};

export function documentQuestions(topics) {
  return {
    ...lensQuestions,
    growth_stage: choice('Which editorial maturity best describes the supplied article? Judge development and completeness, not truth, age or topic.', {
      seedling: 'Fragment, short thought, rough outline or visibly unfinished exploration',
      budding: 'Developed ideas and examples with meaningful gaps or open threads',
      evergreen: 'Coherent, developed, self-contained piece; short complete notes can qualify',
    }),
    title_fit: noul('Does the supplied title accurately describe the article? Allow evocative and metaphorical titles when clearly grounded in the content.'),
    description_fit: noul('Does the supplied description accurately describe the article? If absent, answer no.'),
    ...Object.fromEntries(topics.map((topic, i) => [`topic_${i}`, noul(`Is "${topic}" a substantial subject of this article, rather than a passing mention?`)])),
  };
}

export const relationKinds = {
  prerequisite: 'Target explains background needed to understand source',
  continuation: 'Target develops a particular idea introduced in source',
  example: 'Target is a concrete example of a concept described by source',
  precedent: 'Target supplies a historical precedent for the subject of source',
  tension: 'Target presents a meaningfully different perspective on the same issue, without directly contradicting it',
  contradiction: 'Source and target make directly incompatible claims about the same thing',
  overlap: 'Shared topic only, no more specific relationship is justified',
};

export function relationshipQuestions(candidates, source) {
  return Object.fromEntries(candidates.flatMap((target, i) => [
    [`kind_${i}`, choice(`What relationship runs from source to candidates[${i}]? Treat candidates[${i}] as target. Select overlap if no specific relation is justified.`, relationKinds)],
    [`meaningful_${i}`, noul(`Would reading candidates[${i}] add specific, useful understanding to source beyond sharing a broad topic?`)],
    [`source_${i}`, choice(`Which source paragraph best supports the relationship to candidates[${i}]?`, { none: 'No supporting passage', ...Object.fromEntries(source.paragraphs.map((p) => [p.id, null])) })],
    [`target_${i}`, choice(`Which candidates[${i}] paragraph best supports its relationship to source?`, { none: 'No supporting passage', ...Object.fromEntries(target.paragraphs.map((p) => [p.id, null])) })],
  ]));
}

export const claimKinds = {
  empirical: 'Externally checkable factual claim', interpretation: 'An interpretation, explanation or analysis',
  speculation: 'Conjecture, prediction or an explicitly uncertain possibility', normative: 'A value judgement or claim about what ought to happen',
  metaphor: 'An analogy or figurative explanation', personal: 'Direct personal experience or preference',
  non_claim: 'Question, transition, quotation attribution or other non-claim',
};

function epistemicQuestionsFor(units, stateKey, contextName) {
  return Object.fromEntries(units.flatMap((unit, i) => [
    [`kind_${i}`, choice(`What is the primary epistemic character of ${stateKey}[${i}].text? Judge the author\'s speech act in context.`, claimKinds)],
    [`citation_${i}`, noul(`Does ${stateKey}[${i}] make a consequential, externally checkable claim with no supporting citation in this ${contextName} or the supplied neighbouring context? Do not flag personal experience, common knowledge, clearly marked opinion, or a cited quotation.`)],
    [`qualification_${i}`, noul(`Does ${stateKey}[${i}] present an uncertain interpretation or generalisation as settled fact, beyond what the supplied text supports? Explicit hedging, metaphor, personal experience and normative statements are not this problem.`)],
  ]));
}

export const epistemicQuestions = paragraphs => epistemicQuestionsFor(paragraphs, 'paragraphs', 'paragraph');
export const sentenceQuestions = sentences => epistemicQuestionsFor(sentences, 'sentences', 'sentence');
