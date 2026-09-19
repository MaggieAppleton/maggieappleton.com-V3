import React, { useState } from 'react';
import { Empty, Inspector, percent } from './shared.jsx';

export default function Pipeline({ snapshot }) {
  const [stage, setStage] = useState(null);
  const example = Array.isArray(snapshot.examples) ? snapshot.examples[0] : snapshot.examples?.document ?? Object.values(snapshot.examples ?? {})[0];
  const data = [example?.request?.state ?? example?.request, example?.request?.questions, example?.response, { documents: snapshot.documents.length, relations: snapshot.relations.length, generatedAt: snapshot.generatedAt, model: snapshot.model, usage: snapshot.usage }];
  const question = example?.request?.questions?.knowledge;
  const answer = example?.response?.answers?.knowledge;
  const previews = [
    <><span className="jev-pipeline-title">{example?.request?.state?.title}</span><span className="jev-pipeline-excerpt">{example?.request?.state?.paragraphs?.[0]?.text}</span></>,
    <><code>knowledge: {question?.type}</code><span>{question?.instructions}</span></>,
    <><span className="jev-pipeline-bars">{Object.entries(answer?.probabilities ?? {}).map(([key, value]) => <span key={key}><span>{key}</span><i style={{ width: `${value * 100}%` }} /><output>{percent(value)}</output></span>)}</span><code>score = {answer?.score}</code></>,
    <><code>distance +=<br />(score − desired)²</code>{Number.isFinite(answer?.score) && <span className="jev-pipeline-calculation">({answer.score} − 2)² = {(answer.score - 2) ** 2}</span>}<small>One axis · desired = 2</small></>,
  ];
  return <div className="jev-pipeline"><div className="jev-stages" aria-label="Evaluation pipeline">{['State', 'Questions', 'Probabilities', 'Code'].map((label, i) => <React.Fragment key={label}>{i > 0 && <span className="jev-stage-arrow" aria-hidden="true">→</span>}<button onClick={() => setStage(stage === i ? null : i)} aria-pressed={stage === i} aria-label={`Inspect ${label.toLowerCase()}`}><span className="jev-stage-label">{label}</span>{example && <span className="jev-stage-preview">{previews[i]}</span>}</button></React.Fragment>)}</div>{!example && <Empty>No saved example response yet.</Empty>}{stage !== null && (data[stage] ? <Inspector open key={stage} data={data[stage]} label={`Inspect ${['state', 'questions', 'probabilities', 'code output'][stage]}`} /> : <Empty>No saved example response yet.</Empty>)}</div>;
}
