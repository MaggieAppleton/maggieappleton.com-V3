// Garden tending: turns Jev's per-post judgements into a small set of
// consolidated tasks per post — one line per kind of care a post needs.

export const tasks = ['stage', 'topics', 'connections', 'title'];
export const taskLabels = {
  stage: 'Growth stage',
  topics: 'Topics',
  connections: 'Connections',
  title: 'Title',
};
// Short phrase used in the "Showing N posts that …" summary.
export const taskSummaries = {
  stage: 'may be at the wrong growth stage',
  topics: 'could use more topics',
  connections: 'could be better connected',
  title: 'may need a clearer title or description',
};

// Below these Jev scores a suggestion isn't worth a gardener's attention.
export const STAGE_MIN_CONFIDENCE = 0.5;
export const LINK_MIN_PROBABILITY = 0.5;
export const FIT_THRESHOLD = 0.5;

const noul = answer => answer?.noul ?? null;
const selected = answer => answer?.choice ?? null;
const byProbability = (a, b) => b.probability - a.probability;

// Strongest suggestion per distinct post. Versioned posts can share a title
// under different ids, so titles are de-duplicated too, and a post never
// suggests linking to (a version of) itself.
function suggestedLinks(relations, byId, doc, matches, other) {
  const seen = new Set([doc.id, doc.title]);
  return relations
    .filter(row => matches(row) && !row.authored && noul(row.meaningful) >= LINK_MIN_PROBABILITY)
    .map(row => ({ doc: byId.get(other(row)), kind: selected(row.kind), probability: noul(row.meaningful) }))
    .filter(link => link.doc)
    .sort(byProbability)
    .filter(link => {
      if (seen.has(link.doc.id) || seen.has(link.doc.title)) return false;
      seen.add(link.doc.id);
      seen.add(link.doc.title);
      return true;
    });
}

export function buildTendingPlan(documents, relations = []) {
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  return documents.flatMap(doc => {
    const plan = {};

    const stage = doc.tending?.growth_stage;
    const confidence = stage?.confidence ?? null;
    if (doc.growthStage && selected(stage) && selected(stage) !== doc.growthStage && confidence >= STAGE_MIN_CONFIDENCE) {
      plan.stage = { from: doc.growthStage, to: selected(stage), confidence };
    }

    const topics = [...(doc.suggestedTopics ?? [])].sort(byProbability);
    if (topics.length) plan.topics = topics;

    const orphan = !doc.inbound?.length;
    const linkTo = suggestedLinks(relations, byId, doc, row => row.source === doc.id, row => row.target);
    const linkFrom = orphan ? suggestedLinks(relations, byId, doc, row => row.target === doc.id, row => row.source) : [];
    if (linkTo.length || orphan) plan.connections = { linkTo, linkFrom, orphan };

    const supportsDescription = !['now', 'smidgeon'].includes(doc.type);
    const titleFit = noul(doc.tending?.title_fit);
    const descriptionFit = noul(doc.tending?.description_fit);
    const reviewTitle = titleFit !== null && titleFit < FIT_THRESHOLD;
    const missingDescription = supportsDescription && !doc.description?.trim();
    const reviewDescription = supportsDescription && !missingDescription && descriptionFit !== null && descriptionFit < FIT_THRESHOLD;
    if (reviewTitle || missingDescription || reviewDescription) {
      plan.title = { reviewTitle, missingDescription, reviewDescription };
    }

    const taskCount = tasks.filter(task => plan[task]).length;
    return taskCount ? [{ doc, plan, taskCount }] : [];
  });
}

// How strongly a post needs a given task, for ordering within a filter.
function weight(entry, task) {
  const { plan } = entry;
  if (task === 'stage') return plan.stage?.confidence ?? 0;
  if (task === 'topics') return plan.topics?.[0]?.probability ?? 0;
  if (task === 'connections') {
    const c = plan.connections;
    return c ? (c.orphan ? 10 : 0) + c.linkTo.length + c.linkFrom.length : 0;
  }
  return plan.title ? 1 : 0;
}

export function filterTendingPlan(entries, task = 'all') {
  const visible = task === 'all' ? entries : entries.filter(entry => entry.plan[task]);
  return [...visible].sort((a, b) => (task === 'all'
    ? b.taskCount - a.taskCount || weight(b, 'connections') - weight(a, 'connections')
    : weight(b, task) - weight(a, task)) || a.doc.title.localeCompare(b.doc.title));
}

export function taskCounts(entries) {
  return Object.fromEntries(tasks.map(task => [task, entries.filter(entry => entry.plan[task]).length]));
}
