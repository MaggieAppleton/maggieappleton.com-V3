export const claimKinds = ['empirical', 'interpretation', 'speculation', 'normative', 'metaphor', 'personal', 'non_claim'];

export function sentenceAnnotation(row, threshold = 0.5) {
  const kind = row?.kind?.choice ?? null;
  const kindProbability = kind ? row?.kind?.probabilities?.[kind] ?? null : null;
  const needsCitation = (row?.needsCitation?.noul ?? 0) >= threshold;
  const needsQualification = (row?.qualification?.noul ?? 0) >= threshold;
  const showKind = kindProbability >= threshold;
  return {
    kind,
    kindIndex: claimKinds.indexOf(kind),
    kindProbability,
    showKind,
    needsCitation,
    needsQualification,
    annotated: showKind || needsCitation || needsQualification,
  };
}
