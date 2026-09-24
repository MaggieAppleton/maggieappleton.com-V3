const probabilityTolerance = 0.01;

function assertUniqueIds(entries, kind) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.id || typeof entry.id !== 'string') {
      throw new TypeError(`Every ${kind} needs a non-empty string ID.`);
    }
    if (seen.has(entry.id)) throw new TypeError(`Duplicate ${kind} ID "${entry.id}".`);
    seen.add(entry.id);
  }
}

function validateVisual(item) {
  if (item.visual?.type === 'emoji' && item.visual.value) return;
  if (item.visual?.type === 'image' && item.visual.src && item.visual.alt) return;
  if (item.visual?.type === 'emoji') {
    throw new TypeError(`Item "${item.id}" needs a non-empty emoji value.`);
  }
  if (item.visual?.type === 'image') {
    throw new TypeError(`Item "${item.id}" needs an image src and alt.`);
  }
  throw new TypeError(`Item "${item.id}" has an unsupported visual type.`);
}

export function validateSorterConfig(config) {
  if (!config?.question || typeof config.question !== 'string') {
    throw new TypeError('Sorter question must be a non-empty string.');
  }
  if (!Array.isArray(config.categories) || config.categories.length < 2) {
    throw new TypeError('Sorter needs at least two categories.');
  }
  if (!Array.isArray(config.items) || config.items.length === 0) {
    throw new TypeError('Sorter needs at least one item.');
  }

  assertUniqueIds(config.categories, 'category');
  assertUniqueIds(config.items, 'item');

  const categoryIds = config.categories.map(category => category.id);
  for (const category of config.categories) {
    if (!category.label || typeof category.label !== 'string') {
      throw new TypeError(`Category "${category.id}" needs a label.`);
    }
    if (!category.detailText || typeof category.detailText !== 'string') {
      throw new TypeError(`Category "${category.id}" needs detail text.`);
    }
  }

  for (const item of config.items) {
    if (!item.label || typeof item.label !== 'string') {
      throw new TypeError(`Item "${item.id}" needs a label.`);
    }
    validateVisual(item);

    const probabilityIds = Object.keys(item.probabilities ?? {});
    if (
      probabilityIds.length !== categoryIds.length
      || categoryIds.some(id => !probabilityIds.includes(id))
    ) {
      throw new TypeError(`Item "${item.id}" probabilities must contain exactly the configured categories.`);
    }

    const probabilities = categoryIds.map(id => item.probabilities[id]);
    if (probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new TypeError(`Item "${item.id}" probabilities must be finite values between 0 and 1.`);
    }
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > probabilityTolerance) {
      throw new TypeError(`Item "${item.id}" probability total must be between 0.99 and 1.01.`);
    }
  }

  return config;
}

export function getWinningCategory(item, categories) {
  return categories.reduce((winner, category) => (
    item.probabilities[category.id] > item.probabilities[winner.id] ? category : winner
  )).id;
}
