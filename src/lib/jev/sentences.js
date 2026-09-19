const protectedStop = '\uE000';
const abbreviations = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|No|e\.g|i\.e)\./gi;

export function splitSentences(text = '') {
  const protectedText = text.replace(abbreviations, match => match.replaceAll('.', protectedStop));
  const segments = typeof Intl?.Segmenter === 'function'
    ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(protectedText)].map(item => item.segment)
    : protectedText.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  return segments.map(segment => segment.replaceAll(protectedStop, '.').trim()).filter(Boolean);
}

export function sentenceUnits(paragraph) {
  return splitSentences(paragraph?.text).map((text, index) => ({
    id: `${paragraph.id}-s${index + 1}`,
    paragraphId: paragraph.id,
    text,
    ...(paragraph.citations?.length ? { citations: paragraph.citations } : {}),
  }));
}
