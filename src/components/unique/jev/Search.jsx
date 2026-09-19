import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lexicalSearch } from '../../../lib/jev/search.js';
import { Empty, Inspector, percent } from './shared.jsx';

const exampleQuestions = [
  'Can software feel like a home-cooked meal?',
  'Where do people hide from the public internet?',
  'Can an AI assistant make us worse at thinking?',
  'How do tools change the way we think?',
  'What can anthropology teach us about interfaces?',
  'Why publish ideas before they’re finished?',
];

export default function Search({ documents }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submit, setSubmit] = useState(0);
  const sequence = useRef(0);
  const lexical = useMemo(() => query.trim() ? lexicalSearch(query, documents).slice(0, 12) : [], [query, documents]);
  useEffect(() => {
    const current = ++sequence.current;
    const controller = new AbortController();
    setResult(null); setError('');
    if (query.trim().length < 3) { setStatus(query.trim() ? 'Enter at least 3 characters for semantic search.' : ''); return () => controller.abort(); }
    setStatus('Waiting to evaluate…');
    const timer = setTimeout(async () => {
      setStatus('Evaluating candidate passages…');
      try {
        const response = await fetch('/api/jev-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search is unavailable.');
        if (current !== sequence.current || controller.signal.aborted) return;
        setResult(data); setStatus(!Number.isFinite(data.exists) ? 'No candidates to evaluate.' : data.cached ? 'Saved evaluation' : 'Evaluation complete');
      } catch (failure) {
        if (controller.signal.aborted || current !== sequence.current) return;
        setError(failure.message); setStatus('');
      }
    }, submit && query.trim() === submit.query ? 0 : 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, submit]);
  const lexicalRows = result?.lexical ?? lexical;
  const rows = result?.results ?? lexical;
  function runSearch(value) {
    const nextQuery = value.trim();
    setQuery(nextQuery);
    setSubmit({ query: nextQuery, at: Date.now() });
  }
  return <>
    <form className="jev-search-form" onSubmit={event => { event.preventDefault(); runSearch(query); }}><label className="jev-field">Search the garden<input type="search" maxLength="240" value={query} onChange={event => setQuery(event.target.value)} placeholder="A question or an idea…" /></label><button type="submit" disabled={query.trim().length < 3}>Search</button></form>
    <div className="jev-search-examples" role="group" aria-label="Example questions">
      {exampleQuestions.map(question => <button type="button" key={question} onClick={() => runSearch(question)}>{question}</button>)}
    </div>
    <div className="jev-search-status" aria-live="polite"><span>{status}</span>{Number.isFinite(result?.exists) && <span>Relevant candidate: <strong>{percent(result.exists)}</strong> probability</span>}</div>
    {error && <p className="jev-error" role="alert">{error}</p>}
    {query.trim() && <div className="jev-search-results"><div className="jev-search-head"><span>Source passage</span><span>Keyword<br />rank</span><span>Semantic<br />rank</span></div>{rows.slice(0, 12).map((row, index) => {
      const doc = documents.find(document => document.id === row.id);
      const keywordRank = lexicalRows.findIndex(item => item.id === row.id);
      return <div className="jev-search-row" key={row.id}><div><a className="jev-article-title" href={doc?.url}>{doc?.title ?? row.id}</a><p>{row.excerpt}</p></div><span>{keywordRank >= 0 ? keywordRank + 1 : '—'}</span><span>{result ? index + 1 : '…'}{result?.inspection && <small className="jev-relevance" title="Relevance probability">{percent(row.score)}</small>}</span></div>;
    })}</div>}
    {query.trim() && !rows.length && <Empty>No candidate passages match this query.</Empty>}
    {result?.inspection && <Inspector data={result.inspection} label="Inspect request and response" />}
  </>;
}
