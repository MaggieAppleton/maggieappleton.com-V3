import React, { useMemo, useState } from 'react';
import { axes, Distribution, Empty, Inspector, Source } from './shared.jsx';

const endpoints = [['No prior knowledge', 'Specialist'], ['Reflective', 'Practical'], ['Concrete', 'Abstract'], ['Established', 'Exploratory']];

export default function GardenLenses({ documents }) {
  const [desired, setDesired] = useState([2, 2, 2, 2]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const ranked = useMemo(() => documents.filter(doc => doc.title.toLowerCase().includes(query.toLowerCase()))
    .map(doc => ({ doc, distance: axes.every(axis => Number.isFinite(doc.lenses?.[axis]?.score)) ? axes.reduce((sum, axis, i) => sum + (doc.lenses[axis].score - desired[i]) ** 2, 0) : Infinity }))
    .sort((a, b) => a.distance - b.distance), [documents, query, desired]);
  const document = documents.find(doc => doc.id === selected);
  if (!documents.length) return <Empty />;
  return <>
    <div className="jev-lenses-controls">{axes.map((axis, i) => <label className={`jev-axis jev-axis-${i}`} key={axis}><span>{axis === 'knowledge' ? 'Prior knowledge' : axis}<output>{desired[i].toFixed(1)}</output></span><input aria-label={axis === "knowledge" ? "Prior knowledge" : axis} type="range" min="0" max="4" step="0.1" value={desired[i]} onChange={event => setDesired(values => values.map((v, index) => index === i ? Number(event.target.value) : v))} /><span className="jev-range-ends"><span>{endpoints[i][0]}</span><span>{endpoints[i][1]}</span></span></label>)}</div>
    <div className="jev-toolbar"><label className="jev-field">Find an article<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><button onClick={() => { setDesired([2, 2, 2, 2]); setQuery(''); }}>Reset</button></div>
    <div className="jev-profile-key"><span>● Actual score</span><span>│ Desired position</span></div>
    <div className="jev-ranked">{ranked.slice(0, 12).map(({ doc }, index) => <button className="jev-ranked-row" aria-pressed={selected === doc.id} key={doc.id} onClick={() => setSelected(doc.id)}><span className="jev-rank">{index + 1}</span><span className="jev-article-title">{doc.title}</span><span className="jev-profiles">{axes.map((axis, i) => <span key={axis} className={`jev-track jev-axis-${i}`} title={`${axis}: ${doc.lenses?.[axis]?.score ?? 'not evaluated'}`}><span className="jev-desired" style={{ left: `${desired[i] * 25}%` }} />{Number.isFinite(doc.lenses?.[axis]?.score) && <span className="jev-dot" style={{ left: `${doc.lenses[axis].score * 25}%` }} />}</span>)}</span></button>)}</div>
    {!ranked.length && <Empty>No matching articles.</Empty>}
    <p className="jev-meta">{Math.min(12, ranked.length)} of {ranked.length} articles · profiles follow slider order</p>
    {document && <div className="jev-detail"><h3>{document.title}</h3><Source document={document} /><div className="jev-distributions">{axes.map(axis => <Distribution key={axis} answer={document.lenses?.[axis]} label={axis} />)}</div><Inspector data={{ desired: Object.fromEntries(axes.map((axis, i) => [axis, desired[i]])), actual: document.lenses }} /></div>}
    {!document && <Inspector data={{ desired: Object.fromEntries(axes.map((axis, i) => [axis, desired[i]])), ranking: 'Ascending squared distance over the four score axes', results: ranked.slice(0, 12).map(({ doc, distance }) => ({ id: doc.id, distance: Number.isFinite(distance) ? distance : null, actual: doc.lenses })) }} />}
  </>;
}
