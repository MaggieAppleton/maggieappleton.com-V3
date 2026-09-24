import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lexicalSearch } from '../../../lib/jev/search.js';
import { Empty, Field } from './shared.jsx';
import { JevMarkIcon } from './playground-icons.jsx';

const exampleQuestions = [
  'Can software feel like a home-cooked meal?',
  'Where do people hide from the public internet?',
  'Can an AI assistant make us worse at thinking?',
  'How do tools change the way we think?',
  'What can anthropology teach us about interfaces?',
  'Why publish ideas before they’re finished?',
];

const wholePercent = value => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—');

// How a passage's semantic rank compares to its plain-keyword rank. A rise or
// a passage keyword search missed entirely are the interesting, teal cases.
function rankDelta(keywordIndex, semanticRank) {
  if (keywordIndex < 0) return { label: 'Not found by keywords', direction: 'new' };
  const keywordRank = keywordIndex + 1;
  if (keywordRank === semanticRank) return { label: 'Same as keyword', direction: 'same' };
  return keywordRank > semanticRank
    ? { label: `↑ from keyword #${keywordRank}`, direction: 'up' }
    : { label: `↓ from keyword #${keywordRank}`, direction: 'down' };
}

function ResultRow({ row, doc, semanticRank, keywordIndex, hasSemantic }) {
  const delta = hasSemantic ? rankDelta(keywordIndex, semanticRank) : null;
  return (
    <li className="jev-search-row">
      <div className="jev-search-row-main">
        <a className="jev-link" href={doc?.url}>{doc?.title ?? row.id}</a>
        <p className="jev-search-excerpt">{row.excerpt}</p>
      </div>
      <div className="jev-search-row-stat">
        {hasSemantic
          ? <>
            <span className="jev-search-percent">{wholePercent(row.score)}</span>
            <span className="jev-meter" style={{ '--value': row.score }}><span /></span>
          </>
          : <span className="jev-search-percent jev-search-percent--muted">#{semanticRank}</span>}
        {delta && <span className={`jev-search-delta is-${delta.direction}`}>{delta.label}</span>}
      </div>
    </li>
  );
}

export default function Search({ documents }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const trimmed = query.trim();
  const lexical = useMemo(
    () => (trimmed ? lexicalSearch(trimmed, documents).slice(0, 12) : []),
    [trimmed, documents],
  );

  useEffect(() => {
    const current = ++sequence.current;
    const controller = new AbortController();
    setResult(null);
    setError('');
    setLoading(false);
    if (trimmed.length < 3) return () => controller.abort();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/jev-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search is unavailable.');
        if (current !== sequence.current || controller.signal.aborted) return;
        setResult(data);
      } catch (failure) {
        if (controller.signal.aborted || current !== sequence.current) return;
        setError(failure.message);
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    }, submitted === trimmed ? 0 : 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed, submitted]);

  const lexicalRows = result?.lexical ?? lexical;
  const rows = result?.results ?? lexical;
  const hasSemantic = Boolean(result);
  const hasVerdict = hasSemantic && !error && Number.isFinite(result.exists);
  const note = error || (loading
    ? 'Comparing with keyword search…'
    : hasSemantic && rows.length
      ? 'Ranked by meaning, compared with keyword search below.'
      : '');

  function runSearch(value) {
    const next = value.trim();
    setQuery(next);
    setSubmitted(next);
  }

  return (
    <div className="jev-kit jev-search">
      <Field label="Search the garden" htmlFor="jev-search-input">
        <form
          className="jev-search-form"
          onSubmit={event => { event.preventDefault(); runSearch(query); }}
        >
          <input
            id="jev-search-input"
            className="jev-input"
            type="search"
            maxLength="240"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="A question or an idea…"
          />
          <button type="submit" className="jev-button" disabled={trimmed.length < 3}>Search</button>
        </form>
      </Field>

      <div className="jev-search-examples" role="group" aria-label="Example questions">
        {exampleQuestions.map(question => (
          <button
            type="button"
            key={question}
            className="jev-chip"
            aria-pressed={trimmed === question}
            onClick={() => runSearch(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <p className="jev-search-status" role="status" aria-live="polite">{note}</p>

      {trimmed && hasVerdict && (
        <div className="jev-card jev-search-verdict">
          <div className="jev-card-header"><JevMarkIcon /><h3>Jev’s read</h3></div>
          <div className="jev-card-body">
            <p className="jev-headline">{wholePercent(result.exists)}</p>
            <p className="jev-search-verdict-copy">chance a passage in the garden actually answers this</p>
            <span className="jev-meter" style={{ '--value': result.exists }}><span /></span>
          </div>
        </div>
      )}

      {trimmed && rows.length > 0 && (
        <ul className="jev-list jev-search-results">
          {rows.slice(0, 12).map((row, index) => (
            <ResultRow
              key={row.id}
              row={row}
              doc={documents.find(document => document.id === row.id)}
              semanticRank={index + 1}
              keywordIndex={lexicalRows.findIndex(item => item.id === row.id)}
              hasSemantic={hasSemantic}
            />
          ))}
        </ul>
      )}
      {trimmed && !rows.length && <Empty>No candidate passages match this query.</Empty>}
    </div>
  );
}
