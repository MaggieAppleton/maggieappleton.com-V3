import React, { useId, useMemo, useState } from 'react';
import { sentenceUnits } from '../../../lib/jev/sentences.js';
import { claimKinds, sentenceAnnotation } from './epistemic.js';
import { Empty, Field, Select, probability } from './shared.jsx';

const VISIBLE_PARAGRAPHS = 4;
const REVIEW_FILTERS = [
  { value: 'all', label: 'All annotations' },
  { value: 'citation', label: 'Citations needed' },
  { value: 'qualification', label: 'Qualifications needed' },
];
// "non_claim" isn't worth highlighting as its own chip.
const KIND_CHIPS = claimKinds.filter(kind => kind !== 'non_claim');

const capitalise = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
const label = value => value ? capitalise(value.replaceAll('_', ' ')) : 'Not evaluated';
const wholePercent = value => Number.isFinite(value) ? `${Math.round(value * 100)}%` : null;
const hostname = url => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

// Links the author already placed in this paragraph — the context Jev weighs
// before saying a sentence needs a citation.
function ParagraphSources({ citations }) {
  const hosts = [...new Map(citations.map(url => [hostname(url), url])).entries()];
  return <p className="jev-sources">
    <span>Cites </span>
    {hosts.map(([host, url], index) => <React.Fragment key={host}>
      {index > 0 && ' · '}<a className="jev-link" href={url}>{host}</a>
    </React.Fragment>)}
  </p>;
}

function TooltipRow({ term, value }) {
  const share = wholePercent(value);
  if (share === null) return null;
  return <span className="jev-tooltip-row">
    <span className="jev-label">{term}</span>
    <span className="jev-meter" style={{ '--value': value }}><span /></span>
    <span className="jev-tooltip-value">{share}</span>
  </span>;
}

function Sentence({ sentence, row, review, activeKind }) {
  if (!row) return <>{sentence.text} </>;
  const annotation = sentenceAnnotation(row);
  const tooltipId = `jev-tooltip-${sentence.id}`;
  const reviewMatch = review === 'all'
    || (review === 'citation' && annotation.needsCitation)
    || (review === 'qualification' && annotation.needsQualification);
  const kindMatch = !activeKind || annotation.kind === activeKind;
  const classes = ['jev-sentence'];
  if (annotation.showKind) classes.push('has-kind', `jev-kind-${annotation.kindIndex}`);
  if (activeKind && annotation.showKind && annotation.kind === activeKind) classes.push('jev-kind-active');
  if (annotation.needsCitation) classes.push('needs-citation');
  if (annotation.needsQualification) classes.push('needs-qualification');
  if (!reviewMatch || !kindMatch) classes.push('is-muted');

  return <><span className="jev-sentence-wrap">
    <span className={classes.join(' ')} data-sentence-id={sentence.id}
      tabIndex={annotation.annotated ? 0 : undefined} aria-describedby={annotation.annotated ? tooltipId : undefined}>
      {sentence.text}
    </span>
    {annotation.annotated && <span className="jev-sentence-tooltip jev-card" id={tooltipId} role="tooltip">
      <span className="jev-card-header"><span className="jev-tooltip-kind">{label(annotation.kind)}</span></span>
      <span className="jev-card-body">
        {annotation.showKind && <TooltipRow term="Type confidence" value={annotation.kindProbability} />}
        <TooltipRow term="Citation needed" value={probability(row.needsCitation)} />
        <TooltipRow term="Qualification needed" value={probability(row.qualification)} />
      </span>
    </span>}
    {annotation.needsCitation && <sup className="jev-flag">[citation needed]</sup>}
    {annotation.needsQualification && <sup className="jev-flag">[needs qualifying]</sup>}
  </span>{' '}</>;
}

export default function EpistemicLinter({ documents }) {
  const ids = useId();
  const [id, setId] = useState(documents.find(doc => doc.id === 'cozy-web' || doc.url === '/cozy-web')?.id ?? documents.find(doc => doc.epistemic?.length)?.id ?? documents[0]?.id ?? '');
  const [review, setReview] = useState('all');
  const [activeKind, setActiveKind] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const document = documents.find(doc => doc.id === id);
  const evaluations = document?.epistemic ?? [];
  const bySentence = useMemo(() => new Map(evaluations.map(row => [row.sentenceId, row])), [evaluations]);
  if (!documents.length) return <Empty />;

  const changeArticle = nextId => {
    setId(nextId);
    setExpanded(false);
  };
  const toggleKind = kind => setActiveKind(current => current === kind ? null : kind);
  const paragraphs = document?.paragraphs ?? [];
  // Flags can sit anywhere, so reviewing citations or qualifications shows the whole article.
  const showAll = expanded || review !== 'all';
  const visibleParagraphs = showAll ? paragraphs : paragraphs.slice(0, VISIBLE_PARAGRAPHS);
  const hiddenCount = paragraphs.length - visibleParagraphs.length;
  const visibleIds = new Set(visibleParagraphs.map(paragraph => paragraph.id));
  const hiddenFlags = evaluations.filter(row => !visibleIds.has(row.paragraphId ?? row.sentenceId?.split('-')[0]))
    .filter(row => {
      const annotation = sentenceAnnotation(row);
      return annotation.needsCitation || annotation.needsQualification;
    }).length;

  return <div className="jev-kit jev-epistemic">
    <div className="jev-epistemic-toolbar">
      <Field label="Article" htmlFor={`${ids}-article`} className="jev-epistemic-article-field">
        <Select id={`${ids}-article`} value={id} onChange={changeArticle}>
          {documents.map(doc => <option key={doc.id} value={doc.id}><span className="jev-option-label">{doc.title}</span></option>)}
        </Select>
      </Field>
      <Field label="Review" htmlFor={`${ids}-review`} className="jev-epistemic-review-field">
        <Select id={`${ids}-review`} value={review} onChange={setReview}>
          {REVIEW_FILTERS.map(filter => <option key={filter.value} value={filter.value}><span className="jev-option-label">{filter.label}</span></option>)}
        </Select>
      </Field>
    </div>
    {!!evaluations.length && <>
      <div className="jev-field-group">
        <span className="jev-label" id={`${ids}-kind`}>Claim type</span>
        <div className="jev-chip-row" role="group" aria-labelledby={`${ids}-kind`}>
          {KIND_CHIPS.map(kind => <button key={kind} type="button" className="jev-chip jev-kind-chip"
            aria-pressed={activeKind === kind} style={{ '--kind-color': `var(--jev-kind-${claimKinds.indexOf(kind)})` }}
            onClick={() => toggleKind(kind)}>
            <span className="jev-kind-dot" aria-hidden="true" />{label(kind)}
          </button>)}
        </div>
      </div>
      <p className="jev-label jev-epistemic-hint">Hover or focus a sentence to see how Jev read it.</p>
    </>}
    {evaluations.length ? <>
      <article className="jev-linted-article">
          <header className="jev-linted-header">
            <h4>{document.title}</h4>
            <a className="jev-link" href={document.url}>Read the original ↗</a>
          </header>
          {visibleParagraphs.map((paragraph, index) => {
            const previous = paragraphs[index - 1];
            return <section className="jev-linted-paragraph" key={paragraph.id}>
              {paragraph.heading && paragraph.heading !== previous?.heading && <h5>{paragraph.heading}</h5>}
              {paragraph.source === 'image_alt' && <p className="jev-label jev-image-description">Image description</p>}
              <p>{sentenceUnits(paragraph).map(sentence => <Sentence key={sentence.id} sentence={sentence} row={bySentence.get(sentence.id)} review={review} activeKind={activeKind} />)}</p>
              {!!paragraph.citations?.length && <ParagraphSources citations={paragraph.citations} />}
            </section>;
          })}
        {hiddenCount > 0 && <button type="button" className="jev-button jev-epistemic-more" onClick={() => setExpanded(true)}>
          Show the whole article ({hiddenCount} more paragraph{hiddenCount === 1 ? '' : 's'}
          {hiddenFlags > 0 && `, ${hiddenFlags} flagged sentence${hiddenFlags === 1 ? '' : 's'}`})
        </button>}
      </article>
    </> : <Empty>No saved sentence evaluations for this article.</Empty>}
  </div>;
}
