import React, { useId, useMemo, useState } from 'react';
import { axes, Empty } from './shared.jsx';

const endpoints = [['None', 'Specialist'], ['Reflective', 'Practical'], ['Concrete', 'Abstract'], ['Established', 'Exploratory']];
const axisLabel = axis => (axis === 'knowledge' ? 'Prior knowledge' : axis.charAt(0).toUpperCase() + axis.slice(1));

// 1 = article sits exactly on the desired position, 0 = as far away as the scale allows.
const closeness = (score, target) => (Number.isFinite(score) ? Math.max(0, 1 - Math.abs(score - target) / 4) : null);

export default function GardenLenses({ documents }) {
  const ids = useId();
  const [desired, setDesired] = useState([2, 2, 2, 2]);
  const ranked = useMemo(() => documents
    .map(doc => ({ doc, distance: axes.every(axis => Number.isFinite(doc.lenses?.[axis]?.score)) ? axes.reduce((sum, axis, i) => sum + (doc.lenses[axis].score - desired[i]) ** 2, 0) : Infinity }))
    .sort((a, b) => a.distance - b.distance), [documents, desired]);
  if (!documents.length) return <Empty />;

  return <div className="jev-kit jev-lenses">
    <div className="jev-lenses-controls">
      {axes.map((axis, i) => {
        const controlId = `${ids}-${axis}`;
        return <div className={`jev-field-group jev-lens jev-lens-${axis}`} key={axis}>
          <label className="jev-label jev-lens-label" htmlFor={controlId}>
            <span>{axisLabel(axis)}</span>
            <output htmlFor={controlId} className="jev-lens-value">{desired[i].toFixed(1)}</output>
          </label>
          <input
            id={controlId}
            className="jev-range"
            type="range"
            min="0"
            max="4"
            step="0.1"
            value={desired[i]}
            onChange={event => setDesired(values => values.map((v, index) => (index === i ? Number(event.target.value) : v)))}
          />
          <div className="jev-lens-ends">
            <span>{endpoints[i][0]}</span>
            <span>{endpoints[i][1]}</span>
          </div>
        </div>;
      })}
    </div>

    <div className="jev-ranked-header">
      <span className="jev-ranked-header-rank" aria-hidden="true" />
      <span className="jev-label jev-ranked-header-count">{Math.min(12, ranked.length)} of {ranked.length} articles</span>
      <span className="jev-label jev-ranked-header-match">Match</span>
    </div>

    <div className="jev-ranked">
      {ranked.slice(0, 12).map(({ doc }, index) => {
        const scored = axes.map((axis, i) => ({ axis, score: doc.lenses?.[axis]?.score, desired: desired[i] }));
        const titleText = scored.map(({ axis, score }) => `${axisLabel(axis)} ${Number.isFinite(score) ? score.toFixed(1) : 'not evaluated'}`).join(' · ');
        const matchLabel = scored.map(({ axis, score, desired: d }) => `${axisLabel(axis)} ${Number.isFinite(score) ? score.toFixed(1) : 'not evaluated'} against ${d.toFixed(1)} desired`).join(', ');
        return <a className="jev-ranked-row" href={doc.url} key={doc.id}>
          <span className="jev-mark">{index + 1}</span>
          <span className="jev-ranked-title">{doc.title}</span>
          <span className="jev-match" role="img" aria-label={`Match: ${matchLabel}`} title={titleText}>
            {scored.map(({ axis, score, desired: d }) => <span className={`jev-match-bar jev-lens-${axis}`} key={axis} style={{ '--closeness': closeness(score, d) ?? 0 }} />)}
          </span>
        </a>;
      })}
    </div>
  </div>;
}
