import React, { useLayoutEffect, useRef, useState } from 'react';
import { probabilityRows } from '../../../lib/jev/playground.js';
import { SpeedometerIcon } from './playground-icons.jsx';

const wholePercent = value => `${Math.round(value * 100)}%`;
const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);

function verdict({ question, answer, claim, subject, scale }) {
  if (answer.type === 'noul') {
    return {
      headline: answer.noul >= 0.5 ? 'Yes' : 'No',
      lead: `${wholePercent(answer.noul)} probability`,
      rest: <> {claim ?? 'the answer is yes'}</>,
    };
  }
  if (answer.type === 'choice') {
    return {
      headline: capitalise(answer.choice),
      lead: `${wholePercent(answer.probabilities[answer.choice])} probability`,
      rest: <> {subject ?? 'the answer'} is <strong>{answer.choice}</strong></>,
    };
  }
  return {
    headline: answer.score.toFixed(2),
    lead: `Expected ${scale ?? 'score'}`,
    rest: <> on a 0–{question.criteria.length - 1} scale</>,
  };
}

function segmentLabel(answer, row) {
  return answer.type === 'choice' ? capitalise(row.label) : row.label;
}

// Each option keeps a fixed tint by position, stepping from full accent down to 40%.
const tint = (index, count) => (count > 1 ? 100 - (index * 60) / (count - 1) : 100);
const DEFAULT_BAR_WIDTH = 450;
// Rough width of "94%  Budding" in the bar's bold 16px Lato, plus padding.
const insideLabelWidth = (share, label) => (share.length + label.length) * 9.5 + 56;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? () => {} : useLayoutEffect;

function useWidth(ref, fallback) {
  const [width, setWidth] = useState(fallback);
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function LabelRow({ segments, position }) {
  return <div className={`jev-play-bar-labels is-${position}`} aria-hidden="true">
    {segments.map(segment => {
      const [shown, ghost] = position === 'top'
        ? [segment.share, segment.label]
        : [segment.label, segment.share];
      return <span className={segment.className} key={segment.key} style={segment.style}>
        {!segment.inside && !segment.empty && <>
          <span className={shown === segment.label ? 'jev-play-segment-name' : undefined}>{shown}</span>
          <span className={`jev-play-bar-ghost${ghost === segment.label ? ' jev-play-segment-name' : ''}`}>{ghost}</span>
        </>}
      </span>;
    })}
  </div>;
}

function DistributionBar({ question, answer }) {
  const ref = useRef(null);
  const barWidth = useWidth(ref, DEFAULT_BAR_WIDTH);
  const rows = probabilityRows(question, answer);
  const percents = rows.map(row => Math.round(row.value * 100));
  const lastVisible = percents.findLastIndex(value => value > 0);
  const segments = rows.map((row, index) => {
    const strength = tint(index, rows.length);
    const label = segmentLabel(answer, row);
    const share = `${percents[index]}%`;
    const inside = row.value * barWidth >= insideLabelWidth(share, label);
    return {
      key: row.label,
      label,
      share,
      inside,
      empty: percents[index] === 0,
      className: [
        percents[index] === 0 && 'is-empty',
        index === lastVisible && 'is-end',
        inside && 'is-inside',
        strength < 70 && 'is-pale',
      ].filter(Boolean).join(' '),
      style: { '--share': row.value, '--tint': `${strength}%` },
    };
  });
  return <div className="jev-play-distribution" ref={ref}>
    <LabelRow segments={segments} position="top" />
    <ol className="jev-play-bar" aria-label="Probability of each answer">
      {segments.map(segment => <li className={segment.className} key={segment.key} style={segment.style}>
        <span className="visually-hidden">{segment.label}: {segment.share}</span>
        {segment.inside && <span className="jev-play-segment-inside" aria-hidden="true">
          <span>{segment.share}</span>
          <span className="jev-play-segment-name">{segment.label}</span>
        </span>}
      </li>)}
    </ol>
    <LabelRow segments={segments} position="bottom" />
  </div>;
}


function scoreLevels(question, answer) {
  return probabilityRows(question, answer).map((row, index) => ({
    level: index,
    description: answer.legend?.[index] ?? question.criteria[index],
    value: row.value,
    share: wholePercent(row.value),
  }));
}

function ScoreColumn({ question, answer }) {
  const levels = scoreLevels(question, answer);
  return <ol className="jev-play-scale-column" aria-label="Probability of each level">
    {levels.map(({ level, description, value, share }) => {
      const strength = 100 - (level * 80) / Math.max(levels.length - 1, 1);
      const className = [share === '0%' && 'is-empty', strength < 70 && 'is-pale'].filter(Boolean).join(' ');
      return <li className={className} key={level} style={{ '--share': value, '--tint': `${strength}%` }}>
        <span className="jev-play-scale-bar">{share}</span>
        <span className="jev-play-scale-label">
          <span className="jev-play-scale-level">{level}</span> {description}
        </span>
      </li>;
    })}
  </ol>;
}

export default function PlaygroundAnswer({ id, question, answer, claim, subject, scale }) {
  const { headline, lead, rest } = verdict({ question, answer, claim, subject, scale });
  return <div className="jev-play-answer">
    <div className="jev-play-verdict" key={`${id}-${headline}`}>
      <p className="jev-play-headline">{headline}</p>
      <p className="jev-play-summary"><strong className="jev-play-lead">{lead}</strong>{rest}</p>
      {Number.isFinite(answer.confidence) && <p className="jev-play-confidence">
        <SpeedometerIcon />
        Confidence {wholePercent(answer.confidence)}
      </p>}
    </div>
    {answer.type === 'score'
      ? <ScoreColumn question={question} answer={answer} />
      : <DistributionBar question={question} answer={answer} />}
  </div>;
}
