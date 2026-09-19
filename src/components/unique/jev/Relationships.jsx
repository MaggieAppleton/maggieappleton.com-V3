import React, { useId, useState } from 'react';
import { ArticleSelect, choice, Empty, Inspector, percent, probability, Source } from './shared.jsx';

export default function Relationships({ documents, relations }) {
  const [source, setSource] = useState(documents.find(doc => doc.id === 'cozy-web' || doc.url === '/cozy-web')?.id ?? relations[0]?.source ?? documents[0]?.id ?? '');
  const [kind, setKind] = useState('all');
  const [threshold, setThreshold] = useState(0.5);
  const [selected, setSelected] = useState(null);
  const marker = useId().replaceAll(':', '');
  const document = documents.find(doc => doc.id === source);
  const outgoing = relations.filter(relation => relation.source === source);
  const visible = outgoing.filter(relation => (kind === 'all' || choice(relation.kind) === kind) && probability(relation.meaningful) >= threshold);
  const target = documents.find(doc => doc.id === selected?.target);
  const sourceParagraph = document?.paragraphs.find(p => p.id === choice(selected?.sourceParagraph));
  const targetParagraph = target?.paragraphs.find(p => p.id === choice(selected?.targetParagraph));
  if (!documents.length) return <Empty />;
  return <>
    <div className="jev-toolbar"><ArticleSelect documents={documents} value={source} onChange={value => { setSource(value); setSelected(null); }} /><label className="jev-field">Relationship<select value={kind} onChange={event => { setKind(event.target.value); setSelected(null); }}><option value="all">All types</option>{['prerequisite', 'continuation', 'example', 'precedent', 'tension', 'contradiction', 'overlap'].map(value => <option key={value}>{value}</option>)}</select></label></div>
    <label className="jev-threshold">Meaningful-link probability ≥ {percent(threshold)}<input aria-label="Minimum meaningful-link probability" type="range" min="0" max="1" step="0.05" value={threshold} onChange={event => { setThreshold(Number(event.target.value)); setSelected(null); }} /></label>
    <div className="jev-profile-key"><span>― Authored link</span><span>┄ Model suggestion</span></div>
    {visible.length ? <div className="jev-graph"><svg viewBox={`0 0 640 ${Math.max(180, visible.length * 64 + 20)}`} role="group" aria-label={`Directed links from ${document?.title}. Select a destination below to inspect its evidence.`}><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>{visible.map((relation, i) => {
      const y = 42 + i * 64;
      const center = Math.max(180, visible.length * 64 + 20) / 2;
      const destination = documents.find(doc => doc.id === relation.target);
      return <g key={relation.target} className={selected === relation ? 'is-selected' : ''}><path d={`M 28 ${center} C 160 ${center}, 175 ${y}, 240 ${y}`} strokeDasharray={relation.authored ? undefined : '4 5'} markerEnd={`url(#${marker})`} /><circle cx="28" cy={center} r="5" /><foreignObject x="260" y={y - 28} width="375" height="60"><button className="jev-graph-node" onClick={() => setSelected(relation)} aria-pressed={selected === relation}><span>{destination?.title ?? relation.target}</span><small>{choice(relation.kind)} · {percent(probability(relation.meaningful))}</small></button></foreignObject></g>;
    })}</svg><div className="jev-mobile-graph">{visible.map(relation => <button key={relation.target} className="jev-graph-node" onClick={() => setSelected(relation)} aria-pressed={selected === relation}><span>→ {documents.find(doc => doc.id === relation.target)?.title ?? relation.target}</span><small>{choice(relation.kind)} · {percent(probability(relation.meaningful))} · {relation.authored ? 'Authored' : 'Suggested'}</small></button>)}</div><p className="jev-meta">{document?.title} → {visible.length} linked articles</p></div> : <Empty>{outgoing.length ? 'No relationships meet these filters.' : 'No saved relationships for this article.'}</Empty>}
    {selected && <div className="jev-detail"><h3>{choice(selected.kind)}</h3><span className="jev-meta">{selected.authored ? 'Existing authored link' : 'Model suggestion'} · source → target</span><div className="jev-evidence"><div><Source document={document} />{sourceParagraph?.source === 'image_alt' && <p className="jev-meta">Image description</p>}<blockquote>{sourceParagraph?.text ?? 'No source passage selected by the model.'}</blockquote></div><div><Source document={target} />{targetParagraph?.source === 'image_alt' && <p className="jev-meta">Image description</p>}<blockquote>{targetParagraph?.text ?? 'No target passage selected by the model.'}</blockquote></div></div><Inspector data={selected} /></div>}
    {!selected && <Inspector data={outgoing} label="Inspect outgoing relationships" />}
  </>;
}
