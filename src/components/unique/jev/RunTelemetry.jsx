import React from 'react';
import { estimatedRunCost } from '../../../lib/jev/playground.js';
import { CurrencyIcon, LightningIcon } from './playground-icons.jsx';

const formatCost = value => value === null ? 'Unavailable' : `$${value.toFixed(6)}`;
const formatSpeed = value => !Number.isFinite(value)
  ? 'Unavailable'
  : value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;

export default function RunTelemetry({ elapsedMs, usage }) {
  return <dl className="jev-play-telemetry" aria-label="Recorded Jev run details">
    <div className="jev-play-telemetry-speed">
      <LightningIcon />
      <dt>Response time</dt>
      <dd>{formatSpeed(elapsedMs)}</dd>
    </div>
    <div className="jev-play-telemetry-cost">
      <CurrencyIcon />
      <dt>Cost</dt>
      <dd>{formatCost(estimatedRunCost(usage))}</dd>
    </div>
  </dl>;
}
