import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GardenLenses from '../src/components/unique/jev/GardenLenses.jsx';

const lenses = Object.fromEntries(
  ['knowledge', 'practicality', 'abstraction', 'speculation'].map(axis => [axis, { score: 2 }]),
);

test('spectrum navigation renders ranked articles as links without toolbar or detail controls', () => {
  const documents = [
    { id: 'january', title: 'January 2026', url: '/now-2026-01', lenses },
    { id: 'gardens', title: 'Digital gardens', url: '/garden-history', lenses },
  ];
  const html = renderToStaticMarkup(React.createElement(GardenLenses, { documents }));

  assert.match(html, /2 of 2 articles/);
  assert.ok(html.indexOf('2 of 2 articles') < html.indexOf('class="jev-ranked"'));
  assert.match(html, /<a[^>]*class="jev-ranked-row"[^>]*href="\/now-2026-01"/);
  assert.match(html, /<a[^>]*href="\/garden-history"/);
  assert.doesNotMatch(html, /Find an article|Reset|profiles follow slider order|aria-pressed|Inspect data/);
});

test('the article mounts spectrum navigation beneath its heading', async () => {
  const article = await fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8');

  assert.match(article, /## 1\. Spectrum Navigation\s+\n<SpectrumNavigation \/>/);
});

test('the playground and remaining experiments use separate article mounts', async () => {
  const [article, playground, pipeline] = await Promise.all([
    fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8'),
    fs.readFile('src/components/unique/jev/JevGardenExamples.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/Pipeline.jsx', 'utf8'),
  ]);

  assert.doesNotMatch(article, /Interactive component demo-ing Jev/);
  assert.ok(article.indexOf('<JevGardenExamples />') < article.indexOf('## Throwing Jev at the Digital Garden'));
  assert.match(playground, /<JevPlaygroundIsland client:load \/>/);
  assert.doesNotMatch(pipeline, /jev-play-docs|jev-play-run|Edit questions as JSON|Object\.values\(active/);
});

test('each garden exploration mounts as an independent island beneath its heading', async () => {
  const [article, semanticSearch, relationshipGraph, epistemicLinter, tendingWorkshop, spectrumNavigation, playground, islandEntries] = await Promise.all([
    fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8'),
    fs.readFile('src/components/unique/jev/SemanticSearch.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/TypedRelationshipGraph.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/EpistemicLinterExperiment.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/GardenTendingWorkshop.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/SpectrumNavigation.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/JevGardenExamples.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/JevIslandEntries.jsx', 'utf8'),
  ]);

  assert.match(article, /## 2\. Semantic search\s+\n<SemanticSearch \/>/);
  assert.match(article, /## 3\. Typed Relationship Graphs\s+\n<TypedRelationshipGraph \/>/);
  assert.match(article, /## 4\. Epistemic Annotations\s+\n<EpistemicLinterExperiment \/>/);
  assert.match(article, /## 5\. Garden Tending Workshop\s+\n<GardenTendingWorkshop \/>/);

  const wrappers = [
    ['SemanticSearchIsland', semanticSearch],
    ['TypedRelationshipGraphIsland', relationshipGraph],
    ['EpistemicLinterIsland', epistemicLinter],
    ['GardenTendingWorkshopIsland', tendingWorkshop],
    ['SpectrumNavigationIsland', spectrumNavigation],
    ['JevPlaygroundIsland', playground],
  ];
  for (const [entry, wrapper] of wrappers) {
    assert.match(wrapper, new RegExp(`<${entry} client:load />`));
    assert.doesNotMatch(wrapper, /garden\.json|snapshot|documents=|relations=|generatedAt=/);
  }

  assert.match(islandEntries, /<Pipeline snapshot=\{playgroundSnapshot\} \/>/);
  assert.match(islandEntries, /<GardenLenses documents=\{snapshot\.documents\} \/>/);
  assert.match(islandEntries, /<Search documents=\{snapshot\.documents\} \/>/);
  assert.match(islandEntries, /<Relationships documents=\{snapshot\.documents\} relations=\{snapshot\.relations\} \/>/);
  assert.match(islandEntries, /<EpistemicLinter documents=\{snapshot\.documents\} \/>/);
  assert.match(islandEntries, /<TendingReport documents=\{snapshot\.documents\} relations=\{snapshot\.relations\} generatedAt=\{snapshot\.generatedAt\} \/>/);
});

test('Jev experiment mounts use an 800px default width', async () => {
  const sharedMount = await fs.readFile('src/components/unique/jev/JevExperimentMount.astro', 'utf8');

  assert.match(sharedMount, /width:\s*min\(800px,/);
});
