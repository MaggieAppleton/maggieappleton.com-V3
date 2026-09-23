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
