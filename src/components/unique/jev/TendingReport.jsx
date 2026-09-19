import React, { useMemo, useState } from 'react';
import { Empty, Inspector, percent, Source } from './shared.jsx';
import { buildTendingReports, categories, categoryLabels, filterTendingReports } from './tending.js';

function PostReport({ report, expanded, onToggle }) {
  const panelId = `jev-report-${report.doc.id}`;
  const visibleCategories = categories.filter(category => report.recommendations.some(item => item.category === category));
  return <article className="jev-report">
    <button className="jev-report-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
      <span className="jev-report-summary">
        <span className="jev-article-title">{report.doc.title}</span>
        <span className="jev-report-categories">{visibleCategories.map(category => categoryLabels[category]).join(' · ')}</span>
      </span>
      <span className="jev-report-count">{report.recommendations.length} {report.recommendations.length === 1 ? 'recommendation' : 'recommendations'}</span>
      <span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div className="jev-report-panel" id={panelId} hidden={!expanded}>
      {visibleCategories.map(category => <section className="jev-recommendation-group" key={category}>
        <h4>{categoryLabels[category]}</h4>
        <ul>{report.recommendations.filter(item => item.category === category).map(item => <li className="jev-recommendation" key={item.id}>
          <span>{item.label}</span>
          <span className="jev-recommendation-meta">
            <span className="jev-recommendation-origin">{item.origin === 'rule' ? 'Rule' : 'Jev'}</span>
            {Number.isFinite(item.probability) && <span>{percent(item.probability)}</span>}
          </span>
        </li>)}</ul>
      </section>)}
      <div className="jev-report-actions"><Source document={report.doc} /><Inspector data={report.recommendations} label="Inspect recommendations" /></div>
    </div>
  </article>;
}

export default function TendingReport({ documents, relations, generatedAt }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('count');
  const [expanded, setExpanded] = useState(new Set());
  const [limit, setLimit] = useState(15);
  const reports = useMemo(() => buildTendingReports(documents, relations, generatedAt), [documents, relations, generatedAt]);
  const visible = useMemo(() => filterTendingReports(reports, { category, query, sort }), [reports, category, query, sort]);
  const recommendationCount = visible.reduce((total, report) => total + report.recommendations.length, 0);
  if (!documents.length) return <Empty />;

  const resetView = () => { setLimit(15); setExpanded(new Set()); };
  const toggle = id => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <>
    <div className="jev-toolbar jev-tending-controls">
      <label className="jev-field">Find a post<input type="search" value={query} onChange={event => { setQuery(event.target.value); resetView(); }} /></label>
      <label className="jev-field">Recommendation type<select value={category} onChange={event => { setCategory(event.target.value); resetView(); }}>
        <option value="all">All recommendations</option>
        {categories.map(value => <option key={value} value={value}>{categoryLabels[value]}</option>)}
      </select></label>
      <label className="jev-field">Sort<select value={sort} onChange={event => { setSort(event.target.value); resetView(); }}>
        <option value="count">Most recommendations</option><option value="title">Post title</option>
      </select></label>
    </div>
    <p className="jev-meta">{visible.length} posts need review · {recommendationCount} recommendations in this view</p>
    <div className="jev-reports">{visible.slice(0, limit).map(report => <PostReport key={report.doc.id} report={report}
      expanded={expanded.has(report.doc.id)} onToggle={() => toggle(report.doc.id)} />)}</div>
    {!visible.length && <Empty>No posts match these filters.</Empty>}
    {visible.length > limit && <button className="jev-more" onClick={() => setLimit(value => value + 15)}>Show 15 more</button>}
  </>;
}
