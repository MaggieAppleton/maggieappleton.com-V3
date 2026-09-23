import React, { useState } from 'react';
import {
  recordedQuestions,
  recordedSelection,
} from '../../../lib/jev/recorded-playground-config.js';
import { ArticleSelect } from './shared.jsx';
import PlaygroundAnswer from './PlaygroundAnswer.jsx';
import RunTelemetry from './RunTelemetry.jsx';

export function RecordedResult({ snapshot, postId, questionId }) {
  const selected = recordedSelection(snapshot, postId, questionId);
  if (!selected) {
    return <p className="jev-error" role="status">This recorded answer is unavailable.</p>;
  }
  return <>
    <RunTelemetry
      generatedAt={snapshot.generatedAt}
      model={snapshot.model}
      elapsedMs={selected.post.elapsedMs}
      usage={selected.post.usage}
    />
    <PlaygroundAnswer
      id={selected.id}
      question={selected.question}
      answer={selected.answer}
    />
  </>;
}

export default function Pipeline({ snapshot }) {
  const [postId, setPostId] = useState(snapshot.posts[0]?.id ?? '');
  const [questionId, setQuestionId] = useState(recordedQuestions[0].id);
  const post = snapshot.posts.find(candidate => candidate.id === postId);

  return <div className="jev-playground">
    <div className="jev-play-inputs">
      <section className="jev-play-state" aria-label="Recorded state">
        <h3>1 · State</h3>
        <ArticleSelect
          documents={snapshot.posts}
          value={postId}
          label="Post"
          onChange={setPostId}
        />
        <p className="jev-state-excerpt">{post?.preview}</p>
      </section>
      <section aria-label="Recorded question">
        <h3>2 · Question</h3>
        <label className="jev-field">
          Ask about
          <select value={questionId} onChange={event => setQuestionId(event.target.value)}>
            {recordedQuestions.map(question => (
              <option value={question.id} key={question.id}>{question.label}</option>
            ))}
          </select>
        </label>
        <p className="jev-play-help">
          The question and answer definitions are fixed for this recorded run.
        </p>
      </section>
    </div>
    <div className="jev-play-results">
      <h3>3 · Jev’s answer</h3>
      <p className="jev-recorded-label">Recorded Jev run</p>
      <RecordedResult snapshot={snapshot} postId={postId} questionId={questionId} />
    </div>
  </div>;
}
