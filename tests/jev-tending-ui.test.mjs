import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTendingReports, filterTendingReports } from '../src/components/unique/jev/tending.js';
import TendingReport from '../src/components/unique/jev/TendingReport.jsx';

const noul = value => ({ type: 'noul', noul: value });
const choice = (value, confidence = 0.8) => ({ type: 'choice', choice: value, confidence, probabilities: { [value]: confidence } });
const base = {
  type: 'note', description: 'A useful description', updated: '2026-08-01', inbound: ['other'],
  growthStage: 'budding', suggestedTopics: [],
  tending: { title_fit: noul(.9), description_fit: noul(.9), growth_stage: choice('budding') },
};

test('groups every recommendation under one unique post report', () => {
  const documents = [
    { ...base, id: 'needs-work', title: 'Needs work', description: '', updated: '2020-01-01', inbound: [],
      suggestedTopics: [{ topic: 'Writing', probability: .84 }], tending: { ...base.tending, growth_stage: choice('evergreen') } },
    { ...base, id: 'clean', title: 'Clean post' },
  ];
  const relations = [{ source: 'needs-work', target: 'clean', authored: false, meaningful: noul(.75), kind: choice('overlap') }];
  const reports = buildTendingReports(documents, relations, '2026-09-19T00:00:00.000Z');
  assert.deepEqual(reports.map(report => report.doc.id), ['needs-work']);
  assert.deepEqual(new Set(reports[0].recommendations.map(item => item.category)), new Set(['metadata', 'classification', 'connections', 'freshness']));
  assert.equal(new Set(reports.map(report => report.doc.id)).size, reports.length);
  assert.ok(reports[0].recommendations.some(item => item.label === 'Consider an overlap link to “Clean post”'));
});

test('filters recommendations by category without duplicating posts', () => {
  const reports = [{ doc: { id: 'one', title: 'One' }, recommendations: [
    { id: 'm', category: 'metadata', label: 'Add a description' },
    { id: 'c', category: 'connections', label: 'Add a link' },
  ] }];
  const result = filterTendingReports(reports, { category: 'metadata', query: '', sort: 'count' });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].recommendations.map(item => item.id), ['m']);
});

test('sorts by visible recommendation count or alphabetically', () => {
  const reports = [
    { doc: { id: 'z', title: 'Zebra' }, recommendations: [{ id: '1', category: 'metadata', label: 'One' }] },
    { doc: { id: 'a', title: 'Apple' }, recommendations: [
      { id: '2', category: 'metadata', label: 'Two' }, { id: '3', category: 'connections', label: 'Three' },
    ] },
  ];
  assert.deepEqual(filterTendingReports(reports, { category: 'all', query: '', sort: 'count' }).map(row => row.doc.id), ['a', 'z']);
  assert.deepEqual(filterTendingReports(reports, { category: 'all', query: '', sort: 'title' }).map(row => row.doc.id), ['a', 'z']);
});

test('renders one expandable report per post with clear controls', () => {
  const documents = [
    { ...base, id: 'needs-work', title: 'Needs work', description: '', updated: '2020-01-01', inbound: [],
      suggestedTopics: [{ topic: 'Writing', probability: .84 }], tending: { ...base.tending, growth_stage: choice('evergreen') } },
    { ...base, id: 'clean', title: 'Clean post' },
  ];
  const relations = [{ source: 'needs-work', target: 'clean', authored: false, meaningful: noul(.75), kind: choice('continuation') }];
  const html = renderToStaticMarkup(React.createElement(TendingReport, { documents, relations, generatedAt: '2026-09-19T00:00:00.000Z' }));
  assert.equal((html.match(/class="jev-report-toggle"/g) ?? []).length, 1);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="jev-report-needs-work"/);
  assert.match(html, /id="jev-report-needs-work"[^>]*hidden/);
  assert.match(html, /Find a post/);
  assert.match(html, /All recommendations/);
  assert.doesNotMatch(html, /Find a finding|Code \+ Jev/);
});

test('recommendation rows neutralize article prose list decoration', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');
  assert.match(css, /\.jev \.jev-recommendation\.jev-recommendation::before\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.jev \.jev-recommendation\.jev-recommendation\s*\{[^}]*margin:\s*0[^}]*font:\s*14px\/1\.5 Lato/s);
});
