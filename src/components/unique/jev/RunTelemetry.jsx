import React from 'react';
import {
  estimatedRunCost,
  JEV_INPUT_PRICE_PER_MILLION,
} from '../../../lib/jev/playground.js';

const formatCost = value => value === null ? 'Unavailable' : `$${value.toFixed(6)}`;
const formatSpeed = value => !Number.isFinite(value)
  ? 'Unavailable'
  : value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;

export default function RunTelemetry({ generatedAt, model, elapsedMs, usage }) {
  const date = Number.isFinite(Date.parse(generatedAt))
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(generatedAt))
    : 'Unknown date';
  const tokens = Number.isFinite(usage?.input_tokens)
    ? usage.input_tokens.toLocaleString()
    : 'Unavailable';
  return <dl className="jev-run-metrics" aria-label="Recorded Jev run details">
    <div>
      <dt>Recorded</dt>
      <dd>{date}</dd>
      <small>{model}</small>
    </div>
    <div>
      <dt>Original Jev speed</dt>
      <dd>{formatSpeed(elapsedMs)}</dd>
      <small>
        {tokens} input tokens · {formatCost(estimatedRunCost(usage))} at
        {' '}${JEV_INPUT_PRICE_PER_MILLION}/M
      </small>
    </div>
  </dl>;
}
