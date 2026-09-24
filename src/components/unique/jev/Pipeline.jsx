import React, { useId, useState } from 'react';
import {
  recordedQuestions,
  recordedSelection,
} from '../../../lib/jev/recorded-playground-config.js';
import PlaygroundAnswer from './PlaygroundAnswer.jsx';
import RunTelemetry from './RunTelemetry.jsx';
import { JevMarkIcon } from './playground-icons.jsx';
import { Select } from './shared.jsx';

const KIND_LABELS = { noul: 'Yes / No', choice: 'Choice', score: 'Scale' };
const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);
const letter = index => String.fromCharCode(65 + index);

function questionOptions(question) {
  if (question.type === 'noul') {
    return [
      { mark: 'A', term: 'Yes', description: question.criteria?.true },
      { mark: 'B', term: 'No', description: question.criteria?.false },
    ];
  }
  if (question.type === 'score') {
    return question.criteria.map((description, index) => ({ mark: String(index), description }));
  }
  return Object.entries(question.criteria).map(([key, description], index) => ({
    mark: letter(index),
    term: capitalise(key),
    description,
  }));
}

export function RecordedResult({ snapshot, postId, questionId }) {
  const selected = recordedSelection(snapshot, postId, questionId);
  if (!selected) {
    return <p className="jev-error" role="status">This recorded answer is unavailable.</p>;
  }
  return <>
    <PlaygroundAnswer
      id={selected.id}
      question={selected.question}
      answer={selected.answer}
      claim={selected.claim}
      subject={selected.subject}
      scale={selected.scale}
    />
    <RunTelemetry elapsedMs={selected.post.elapsedMs} usage={selected.post.usage} />
  </>;
}

function Step({ number, controlId, title, hint, children }) {
  return <section className="jev-play-step">
    <div className="jev-play-step-heading">
      <span className="jev-play-step-number" aria-hidden="true">{number}</span>
      <label htmlFor={controlId}>
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </label>
    </div>
    <div className="jev-play-step-body">{children}</div>
  </section>;
}

export default function Pipeline({ snapshot }) {
  const [postId, setPostId] = useState(snapshot.posts[0]?.id ?? '');
  const [questionId, setQuestionId] = useState(recordedQuestions[0].id);
  const ids = useId();
  const post = snapshot.posts.find(candidate => candidate.id === postId);
  const definition = recordedQuestions.find(candidate => candidate.id === questionId);
  const { question } = definition;

  return <div className="jev-playground">
    <div className="jev-play-layout">
      <div className="jev-play-inputs">
        <Step number="1" controlId={`${ids}-post`} title="Pick a Post" hint="The state">
          <Select id={`${ids}-post`} value={postId} onChange={setPostId}>
            {snapshot.posts.map(doc => <option key={doc.id} value={doc.id}>
              <span className="jev-option-label">{doc.title}</span>
            </option>)}
          </Select>
          <div className="jev-play-aside">
            <p className="jev-play-aside-label">Preview</p>
            <p className="jev-play-preview">{post?.preview}</p>
          </div>
        </Step>
        <Step number="2" controlId={`${ids}-question`} title="Pick a Question">
          <Select id={`${ids}-question`} value={questionId} onChange={setQuestionId}>
            {recordedQuestions.map(candidate => (
              <option value={candidate.id} key={candidate.id}>
                <span className="jev-option-label">{candidate.label}</span>
                <span className="jev-option-sep" aria-hidden="true"> · </span>
                <span className="jev-option-kind">{KIND_LABELS[candidate.question.type]}</span>
              </option>
            ))}
          </Select>
          <div className="jev-play-aside">
            <p className="jev-play-aside-label">Question</p>
            <p className="jev-play-question">{question.instructions}</p>
            <ol className="jev-play-options" aria-label="Possible answers">
              {questionOptions(question).map(option => <li key={option.mark}>
                <span className="jev-play-option-mark" aria-hidden="true">{option.mark}</span>
                <span>
                  {option.term && <strong>{option.term}</strong>}
                  {option.term && option.description && ' – '}
                  {option.description}
                </span>
              </li>)}
            </ol>
          </div>
        </Step>
      </div>
      <section className="jev-play-card" aria-labelledby={`${ids}-decision`}>
        <header className="jev-play-card-header">
          <JevMarkIcon />
          <h3 id={`${ids}-decision`}>Jev’s Decision</h3>
        </header>
        <RecordedResult snapshot={snapshot} postId={postId} questionId={questionId} />
      </section>
    </div>
  </div>;
}
