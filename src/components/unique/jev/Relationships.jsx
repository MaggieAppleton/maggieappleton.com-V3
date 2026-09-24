import React, { useId, useState } from 'react';
import { choice, Empty, Field, probability, Select, Source } from './shared.jsx';

const KINDS = ['prerequisite', 'continuation', 'example', 'precedent', 'tension', 'contradiction', 'overlap'];
const capitalise = value => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);
const wholePercent = value => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—');

// Fixed pixel layout for the connector column: the SVG is drawn 1:1 (no
// viewBox scaling), and each row is exactly ROW_HEIGHT tall so a curve's
// endpoint always lands on its row's vertical centre.
const ROW_HEIGHT = 64;
const CONNECTOR_WIDTH = 132;
const SOURCE_X = 8;
const END_X = CONNECTOR_WIDTH - 8;

function metaLabel(relation) {
  const kindText = choice(relation.kind) ?? 'related';
  const likelihood = wholePercent(probability(relation.meaningful));
  return `${kindText} · ${likelihood} · ${relation.authored ? 'authored' : 'suggested'}`;
}

function relationLabel(relation, destination) {
  const relationKind = choice(relation.kind) ?? 'related';
  const likelihood = wholePercent(probability(relation.meaningful));
  const provenance = relation.authored ? 'Authored link' : 'Model suggestion';
  return `${destination?.title ?? relation.target}. ${capitalise(relationKind)}, ${likelihood} probability. ${provenance}.`;
}

function Node({ relation, destination, isSelected, onSelect }) {
  return <button
    type="button"
    className="jev-relationships-node"
    onClick={onSelect}
    aria-pressed={isSelected}
    aria-label={relationLabel(relation, destination)}
  >
    <span className="jev-relationships-node-title">{destination?.title ?? relation.target}</span>
    <span className="jev-relationships-node-meta">{metaLabel(relation)}</span>
  </button>;
}

export default function Relationships({ documents, relations }) {
  const ids = useId();
  const marker = ids.replaceAll(':', '');
  const [source, setSource] = useState(
    documents.find(doc => doc.id === 'cozy-web' || doc.url === '/cozy-web')?.id
      ?? relations[0]?.source
      ?? documents[0]?.id
      ?? '',
  );
  const [kind, setKind] = useState('all');
  const [threshold, setThreshold] = useState(0.5);
  const [selected, setSelected] = useState(null);

  if (!documents.length) return <Empty />;

  const document = documents.find(doc => doc.id === source);
  const outgoing = relations.filter(relation => relation.source === source);
  const visible = outgoing.filter(relation => (
    (kind === 'all' || choice(relation.kind) === kind) && probability(relation.meaningful) >= threshold
  ));
  const target = documents.find(doc => doc.id === selected?.target);
  const sourceParagraph = document?.paragraphs.find(p => p.id === choice(selected?.sourceParagraph));
  const targetParagraph = target?.paragraphs.find(p => p.id === choice(selected?.targetParagraph));
  const height = ROW_HEIGHT * Math.max(visible.length, 1);
  const center = height / 2;

  function selectSource(value) { setSource(value); setSelected(null); }
  function selectKind(value) { setKind(value); setSelected(null); }
  function selectThreshold(value) { setThreshold(value); setSelected(null); }

  return <div className="jev-kit jev-relationships">
    <div className="jev-relationships-controls">
      <Field label="Article" htmlFor={`${ids}-source`}>
        <Select id={`${ids}-source`} value={source} onChange={selectSource}>
          {documents.map(doc => <option key={doc.id} value={doc.id}>
            <span className="jev-option-label">{doc.title}</span>
          </option>)}
        </Select>
      </Field>
      <Field label="Relationship" htmlFor={`${ids}-kind`}>
        <Select id={`${ids}-kind`} value={kind} onChange={selectKind}>
          <option value="all"><span className="jev-option-label">All types</span></option>
          {KINDS.map(value => <option key={value} value={value}>
            <span className="jev-option-label">{capitalise(value)}</span>
          </option>)}
        </Select>
      </Field>
    </div>

    <div className="jev-field-group jev-relationships-threshold">
      <div className="jev-relationships-threshold-label">
        <label className="jev-label" htmlFor={`${ids}-threshold`}>Minimum meaningful-link probability</label>
        <span className="jev-pill">{wholePercent(threshold)}</span>
      </div>
      <input
        id={`${ids}-threshold`}
        className="jev-range"
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={threshold}
        onChange={event => selectThreshold(Number(event.target.value))}
        aria-valuetext={wholePercent(threshold)}
      />
    </div>

    {visible.length ? <div
      className="jev-relationships-graph-row"
      style={{ '--connector-width': `${CONNECTOR_WIDTH}px`, '--row-height': `${ROW_HEIGHT}px` }}
    >
      <svg
        className="jev-relationships-connector"
        width={CONNECTOR_WIDTH}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <circle cx={SOURCE_X} cy={center} r="4" />
        {visible.map((relation, i) => {
          const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
          return <path
            key={relation.target}
            className={selected === relation ? 'is-selected' : ''}
            d={`M ${SOURCE_X} ${center} C ${CONNECTOR_WIDTH * 0.5} ${center}, ${CONNECTOR_WIDTH * 0.68} ${y}, ${END_X} ${y}`}
            strokeDasharray={relation.authored ? undefined : '3 5'}
            markerEnd={`url(#${marker})`}
          />;
        })}
      </svg>
      <ul className="jev-list jev-relationships-rows" aria-label={`Directed links from ${document?.title}. Activate a destination to see its evidence.`}>
        {visible.map(relation => {
          const destination = documents.find(doc => doc.id === relation.target);
          return <li key={relation.target}>
            <Node
              relation={relation}
              destination={destination}
              isSelected={selected === relation}
              onSelect={() => setSelected(relation)}
            />
          </li>;
        })}
      </ul>
    </div> : <Empty>{outgoing.length ? 'No relationships meet these filters.' : 'No saved relationships for this article.'}</Empty>}

    {selected && <div className="jev-card jev-relationships-detail">
      <div className="jev-card-header">
        <span>{document?.title} → {target?.title ?? selected.target}</span>
      </div>
      <div className="jev-card-body">
        <div className="jev-relationships-verdict">
          <p className="jev-headline">{capitalise(choice(selected.kind)) ?? 'Related'}</p>
          <p className="jev-relationships-lead">
            <strong>{wholePercent(probability(selected.meaningful))} probability</strong>
            {' '}· {selected.authored ? 'authored link' : 'model suggestion'}
          </p>
        </div>
        <div className="jev-relationships-evidence">
          <div className="jev-aside">
            <p className="jev-label">Source passage</p>
            <p className="jev-relationships-passage">{sourceParagraph?.text ?? 'No source passage selected by the model.'}</p>
            <Source document={document} />
          </div>
          <div className="jev-aside">
            <p className="jev-label">Target passage</p>
            <p className="jev-relationships-passage">{targetParagraph?.text ?? 'No target passage selected by the model.'}</p>
            <Source document={target} />
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
