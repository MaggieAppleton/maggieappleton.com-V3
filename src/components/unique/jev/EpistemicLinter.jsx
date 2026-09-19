import React, { useMemo, useState } from 'react';
import { sentenceUnits } from '../../../lib/jev/sentences.js';
import { claimKinds, sentenceAnnotation } from './epistemic.js';
import { ArticleSelect, Empty, Inspector, percent, probability, Source } from './shared.jsx';

const label = value => value?.replaceAll('_', ' ') ?? 'Not evaluated';

function Sentence({ sentence, row, review }) {
  if (!row) return <>{sentence.text} </>;
  const annotation = sentenceAnnotation(row);
  const tooltipId = `jev-tooltip-${sentence.id}`;
  const reviewMatch = review === 'all'
    || (review === 'citation' && annotation.needsCitation)
    || (review === 'qualification' && annotation.needsQualification);
  const classes = ['jev-sentence'];
  if (annotation.showKind) classes.push('has-kind', `jev-kind-${annotation.kindIndex}`);
  if (annotation.needsCitation) classes.push('needs-citation');
  if (annotation.needsQualification) classes.push('needs-qualification');
  if (!reviewMatch) classes.push('is-review-muted');

  return <><span className="jev-sentence-wrap">
    <span className={classes.join(' ')} data-sentence-id={sentence.id}
      tabIndex={annotation.annotated ? 0 : undefined} aria-describedby={annotation.annotated ? tooltipId : undefined}>
      {sentence.text}
    </span>
    {annotation.annotated && <span className="jev-sentence-tooltip" id={tooltipId} role="tooltip">
        <strong>{label(annotation.kind)}</strong>
        <span>Type {percent(annotation.kindProbability)}</span>
        <span>Citation needed {percent(probability(row.needsCitation))}</span>
        <span>Qualification needed {percent(probability(row.qualification))}</span>
    </span>}
  </span>{' '}</>;
}

export default function EpistemicLinter({ documents }) {
  const [id, setId] = useState(documents.find(doc => doc.id === 'cozy-web' || doc.url === '/cozy-web')?.id ?? documents.find(doc => doc.epistemic?.length)?.id ?? documents[0]?.id ?? '');
  const [review, setReview] = useState('all');
  const document = documents.find(doc => doc.id === id);
  const evaluations = document?.epistemic ?? [];
  const bySentence = useMemo(() => new Map(evaluations.map(row => [row.sentenceId, row])), [evaluations]);
  if (!documents.length) return <Empty />;

  return <>
    <div className="jev-toolbar">
      <ArticleSelect documents={documents} value={id} onChange={setId} />
      <label className="jev-field">Review<select value={review} onChange={event => setReview(event.target.value)}>
        <option value="all">All annotations</option>
        <option value="citation">Citations needed</option>
        <option value="qualification">Qualifications needed</option>
      </select></label>
    </div>
    <div className="jev-kind-key" aria-label="Annotation key">
      {claimKinds.map((kind, index) => <span key={kind}><i style={{ background: `var(--jev-kind-${index})` }} />{label(kind)}</span>)}
      <span><i className="jev-key-citation" />citation needed</span>
      <span><i className="jev-key-qualification" />qualification needed</span>
    </div>
    {evaluations.length ? <>
      <article className="jev-linted-article" data-review={review}>
        <header className="jev-linted-header">
          <h3>{document.title}</h3>
          <Source document={document} />
        </header>
        {document.paragraphs.map((paragraph, index) => {
          const previous = document.paragraphs[index - 1];
          return <section className="jev-linted-paragraph" key={paragraph.id}>
            {paragraph.heading && paragraph.heading !== previous?.heading && <h4>{paragraph.heading}</h4>}
            {paragraph.source === 'image_alt' && <small className="jev-image-description">Image description</small>}
            <p>{sentenceUnits(paragraph).map(sentence => <Sentence key={sentence.id} sentence={sentence} row={bySentence.get(sentence.id)} review={review} />)}</p>
            {!!paragraph.citations?.length && <div className="jev-citations">{paragraph.citations.map((url, citationIndex) => <a key={`${url}-${citationIndex}`} href={url}>Citation {citationIndex + 1} ↗</a>)}</div>}
          </section>;
        })}
      </article>
      <Inspector data={evaluations} label="Inspect sentence evaluations" />
    </> : <Empty>No saved sentence evaluations for this article.</Empty>}
  </>;
}
