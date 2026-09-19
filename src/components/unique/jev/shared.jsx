import React, { useState } from 'react';

export const axes = ['knowledge', 'practicality', 'abstraction', 'speculation'];
export const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'Not evaluated';
export const probability = answer => answer?.noul ?? null;
export const choice = answer => answer?.choice ?? null;

export function Inspector({ data, label = 'Inspect data', open = false }) {
  const [expanded, setExpanded] = useState(open);
  return <details className="jev-inspector" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>{label}</summary>{expanded && <pre>{JSON.stringify(data, null, 2)}</pre>}</details>;
}
export function Empty({ children = 'Saved Jev evaluations have not been generated yet.' }) {
  return <p className="jev-empty" role="status">{children}</p>;
}
export function Section({ number, title, description, mode = 'Saved Jev evaluations', children }) {
  return <section className="jev-section" aria-labelledby={`jev-section-${number}`} aria-describedby={`jev-description-${number}`}>
    <header className="jev-section-heading">
      <p className="jev-meta">Experiment {number} · {mode}</p>
      <h2 id={`jev-section-${number}`}>{title}</h2>
      <p className="jev-section-description" id={`jev-description-${number}`}>{description}</p>
    </header>
    {children}
  </section>;
}
export function ArticleSelect({ documents, value, onChange, label = 'Article' }) {
  return <label className="jev-field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>;
}
export function Distribution({ answer, label }) {
  const entries = Object.entries(answer?.probabilities ?? {});
  return <div className="jev-distribution"><strong>{label}</strong>{entries.length ? entries.map(([key, value]) => <div className="jev-prob-row" key={key}><span>{answer.legend?.[key] ?? key}</span><meter min="0" max="1" value={value}>{percent(value)}</meter><output>{percent(value)}</output></div>) : <span>Not evaluated</span>}</div>;
}
export function Source({ document }) {
  return document ? <a className="jev-source" href={document.url}>Read {document.title} ↗</a> : null;
}
