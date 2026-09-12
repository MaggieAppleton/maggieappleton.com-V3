// Aggregate-map prototype: the client receives summaries, never respondent records.
export const domains = [
  { id: "cleaning", label: "Cleaning", scope: "daily" },
  { id: "scheduling", label: "Scheduling", scope: "daily" },
  { id: "childcare", label: "Childcare", scope: "daily" },
  { id: "social_relationships", label: "Relationships", scope: "daily" },
  { id: "food", label: "Food", scope: "daily" },
  { id: "maintenance", label: "Maintenance", scope: "episodic" },
  { id: "finances", label: "Finances", scope: "episodic" },
];

export function meanResponsibility(records, taskIds) {
  let sum = 0;
  let n = 0;
  for (const record of records) {
    const answers = taskIds.map(id => record[2][id - 1]);
    const applicable = answers.filter(answer => answer !== 0).length;
    if (!applicable) continue;
    sum += answers.filter(answer => answer === 1).length / applicable;
    n++;
  }
  return { share: n ? sum / n : null, n, total: records.length };
}

export function buildResponsibilityMaps(records, tasks) {
  const groups = Object.fromEntries(["mothers", "fathers"].map(gender => [gender, records.filter(record => record[1] === gender)]));
  const summarize = ids => Object.fromEntries(Object.entries(groups).map(([gender, group]) => [gender, meanResponsibility(group, ids)]));
  return {
    groups: Object.fromEntries(Object.entries(groups).map(([gender, group]) => [gender, group.length])),
    scopes: Object.fromEntries(["daily", "episodic"].map(scope => {
      const domainIds = domains.filter(domain => domain.scope === scope).map(domain => domain.id);
      const ids = tasks.filter(task => domainIds.includes(task.domain)).map(task => task.id);
      return [scope, { taskCount: ids.length, values: summarize(ids) }];
    })),
    domains: domains.map(domain => {
      const domainTasks = tasks.filter(task => task.domain === domain.id);
      return {
        ...domain,
        values: summarize(domainTasks.map(task => task.id)),
        tasks: domainTasks.map(({ id, label, wording }) => ({ id, label, wording, values: summarize([id]) })),
      };
    }),
  };
}
