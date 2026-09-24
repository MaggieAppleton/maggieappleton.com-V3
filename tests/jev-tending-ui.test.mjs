import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTendingPlan, filterTendingPlan, taskCounts } from '../src/components/unique/jev/tending.js';
import TendingReport from '../src/components/unique/jev/TendingReport.jsx';

const noul = value => ({ type: 'noul', noul: value });
const choice = (value, confidence = 0.8) => ({ type: 'choice', choice: value, confidence, probabilities: { [value]: confidence } });
const post = (id, overrides = {}) => ({
  id, title: id, url: `/${id}`, type: 'note', description: 'A useful description', updated: '2026-08-01',
  inbound: ['someone'], growthStage: 'budding', suggestedTopics: [],
  tending: { title_fit: noul(0.9), description_fit: noul(0.9), growth_stage: choice('budding') },
  ...overrides,
});
const link = (source, target, probability, kind = 'overlap', authored = false) => ({
  source, target, authored, meaningful: noul(probability), kind: choice(kind),
});

test('consolidates every suggestion into at most one task per kind, per post', () => {
  const documents = [
    post('needs-work', {
      inbound: [], suggestedTopics: [{ topic: 'Metaphors', probability: 0.6 }, { topic: 'Writing', probability: 0.84 }],
      tending: { title_fit: noul(0.2), description_fit: noul(0.9), growth_stage: choice('evergreen', 0.7) },
    }),
    post('a'), post('b'), post('c'), post('d'),
  ];
  const relations = [
    link('needs-work', 'a', 0.6), link('needs-work', 'b', 0.9, 'continuation'), link('needs-work', 'c', 0.7),
    link('needs-work', 'd', 0.3), link('needs-work', 'a', 0.95, 'example', true),
    link('b', 'needs-work', 0.8),
  ];
  const [entry] = buildTendingPlan(documents, relations);
  assert.equal(entry.doc.id, 'needs-work');
  assert.deepEqual(entry.plan.stage, { from: 'budding', to: 'evergreen', confidence: 0.7 });
  assert.deepEqual(entry.plan.topics.map(topic => topic.topic), ['Writing', 'Metaphors']);
  // All suggested links collapse into one connections task, strongest first; weak and authored links are dropped.
  assert.deepEqual(entry.plan.connections.linkTo.map(item => item.doc.id), ['b', 'c', 'a']);
  assert.equal(entry.plan.connections.orphan, true);
  assert.deepEqual(entry.plan.connections.linkFrom.map(item => item.doc.id), ['b']);
  assert.deepEqual(entry.plan.title, { reviewTitle: true, missingDescription: false, reviewDescription: false });
  assert.equal(entry.taskCount, 4);
  assert.equal(Object.keys(entry.plan).length, 4);
});

test('never suggests linking a post to itself or to the same post twice', () => {
  const documents = [
    post('tft', { title: 'Tools for Thought' }),
    post('tft-v2', { title: 'Tools for Thought' }),
    post('other', { title: 'Other' }),
  ];
  const relations = [link('tft', 'tft-v2', 0.9), link('tft', 'other', 0.8), link('tft', 'other', 0.6, 'continuation')];
  const [entry] = buildTendingPlan(documents, relations);
  assert.deepEqual(entry.plan.connections.linkTo.map(item => item.doc.id), ['other']);
});

test('drops low-confidence stage changes, stale-date nags and posts with nothing to do', () => {
  const documents = [
    post('unsure', { updated: '2019-01-01', tending: { title_fit: noul(0.9), description_fit: noul(0.9), growth_stage: choice('seedling', 0.3) } }),
    post('fine', { updated: '2018-01-01' }),
  ];
  assert.deepEqual(buildTendingPlan(documents, []), []);
});

test('filters to a single task and orders by how strongly each post needs it', () => {
  const documents = [
    post('weak', { tending: { title_fit: noul(0.9), description_fit: noul(0.9), growth_stage: choice('seedling', 0.55) } }),
    post('strong', { tending: { title_fit: noul(0.9), description_fit: noul(0.9), growth_stage: choice('seedling', 0.9) } }),
    post('topical', { suggestedTopics: [{ topic: 'Writing', probability: 0.8 }] }),
  ];
  const entries = buildTendingPlan(documents, []);
  assert.deepEqual(filterTendingPlan(entries, 'stage').map(entry => entry.doc.id), ['strong', 'weak']);
  assert.deepEqual(filterTendingPlan(entries, 'topics').map(entry => entry.doc.id), ['topical']);
  assert.deepEqual(taskCounts(entries), { stage: 2, topics: 1, connections: 0, title: 0 });
});

test('renders task tiles and one consolidated line per task, without origin labels or percentages', () => {
  const documents = [
    post('needs-work', {
      title: 'Needs work', inbound: [], updated: '2023-06-01',
      suggestedTopics: [{ topic: 'Writing', probability: 0.84 }],
      tending: { title_fit: noul(0.9), description_fit: noul(0.9), growth_stage: choice('evergreen', 0.7) },
    }),
    ...['a', 'b', 'c', 'd', 'e'].map(id => post(id, { title: `Post ${id}` })),
  ];
  const relations = ['a', 'b', 'c', 'd', 'e'].map((id, index) => link('needs-work', id, 0.9 - index * 0.05));
  const html = renderToStaticMarkup(React.createElement(TendingReport, { documents, relations }));

  assert.equal((html.match(/class="jev-tending-tile"/g) ?? []).length, 4);
  assert.match(html, /aria-pressed="false"[^>]*><span class="jev-tending-tile-count">1<\/span><span class="jev-tending-tile-label">Growth stage/);
  assert.match(html, /1 of 6 posts need some tending/);
  assert.equal((html.match(/class="jev-tending-post"/g) ?? []).length, 1);
  assert.equal((html.match(/<dt/g) ?? []).length, 3);
  assert.match(html, /Budding[\s\S]*?Evergreen/);
  assert.match(html, /Last tended Jun 2023/);
  assert.match(html, /Link to <a class="jev-link" href="\/a"/);
  assert.match(html, />\+3 more</);
  assert.match(html, /No backlinks yet/);
  assert.doesNotMatch(html, />(Jev|Rule)</);
  assert.doesNotMatch(html, />[^<]*\d+%[^<]*</);
  assert.doesNotMatch(html, /jev-inspector|<select|recommendation/i);
});
