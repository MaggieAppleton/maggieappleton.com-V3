export const categories = ['metadata', 'classification', 'connections', 'freshness'];
export const categoryLabels = {
  metadata: 'Metadata', classification: 'Classification', connections: 'Connections', freshness: 'Freshness',
};

const noul = answer => answer?.noul ?? null;
const selected = answer => answer?.choice ?? null;

export function buildTendingReports(documents, relations, generatedAt) {
  const now = new Date(generatedAt ?? '2026-09-19').getTime();
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  return documents.flatMap(doc => {
    const recommendations = [];
    const add = (category, label, origin, probability, detail) => recommendations.push({
      id: `${doc.id}-${recommendations.length}`, category, label, origin, probability, detail,
    });
    const supportsDescription = !['now', 'smidgeon'].includes(doc.type);

    if (!doc.inbound?.length) add('connections', 'Connect another post to this one', 'rule', null, { inbound: doc.inbound });
    if (supportsDescription && !doc.description?.trim()) {
      add('metadata', 'Add a description', 'rule', null, { description: doc.description });
    }

    const age = Math.floor((now - new Date(doc.updated).getTime()) / 86400000);
    if (age > 730) add('freshness', `Review this post · last updated ${doc.updated}`, 'rule', null, { updated: doc.updated, ageInDays: age });

    const titleFit = noul(doc.tending?.title_fit);
    if (titleFit !== null && titleFit < 0.5) add('metadata', 'Review the title', 'jev', titleFit, doc.tending.title_fit);
    const descriptionFit = noul(doc.tending?.description_fit);
    if (supportsDescription && doc.description?.trim() && descriptionFit !== null && descriptionFit < 0.5) {
      add('metadata', 'Review the description', 'jev', descriptionFit, doc.tending.description_fit);
    }

    const stage = selected(doc.tending?.growth_stage);
    if (doc.growthStage && stage && stage !== doc.growthStage) {
      add('classification', `Consider changing growth stage: ${doc.growthStage} → ${stage}`, 'jev', doc.tending.growth_stage.confidence ?? null, doc.tending.growth_stage);
    }
    for (const topic of doc.suggestedTopics ?? []) {
      add('classification', `Consider adding topic “${topic.topic}”`, 'jev', topic.probability, topic);
    }
    for (const relation of relations.filter(row => row.source === doc.id && !row.authored && noul(row.meaningful) >= 0.5)) {
      const target = byId.get(relation.target);
      const kind = selected(relation.kind);
      const article = /^[aeiou]/i.test(kind) ? 'an' : 'a';
      add('connections', `Consider ${article} ${kind} link to “${target?.title ?? relation.target}”`, 'jev', noul(relation.meaningful), relation);
    }
    return recommendations.length ? [{ doc, recommendations }] : [];
  });
}

export function filterTendingReports(reports, { category = 'all', query = '', sort = 'count' }) {
  const needle = query.trim().toLowerCase();
  return reports.flatMap(report => {
    const recommendations = category === 'all'
      ? report.recommendations
      : report.recommendations.filter(item => item.category === category);
    const searchable = `${report.doc.title} ${recommendations.map(item => item.label).join(' ')}`.toLowerCase();
    return recommendations.length && (!needle || searchable.includes(needle)) ? [{ ...report, recommendations }] : [];
  }).sort((a, b) => sort === 'title'
    ? a.doc.title.localeCompare(b.doc.title)
    : b.recommendations.length - a.recommendations.length || a.doc.title.localeCompare(b.doc.title));
}
