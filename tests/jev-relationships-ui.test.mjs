import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Relationships from '../src/components/unique/jev/Relationships.jsx';

const documents = [
  { id: 'a', title: 'Article A', url: '/a', paragraphs: [{ id: 'p1', text: 'Source passage.', source: 'body' }] },
  { id: 'b', title: 'Article B', url: '/b', paragraphs: [{ id: 'p2', text: 'Target passage.', source: 'body' }] },
  { id: 'c', title: 'Article C', url: '/c', paragraphs: [] },
];

const relations = [
  {
    source: 'a', target: 'b', kind: { choice: 'continuation' }, meaningful: { noul: 0.68 }, authored: true,
    sourceParagraph: { choice: 'p1' }, targetParagraph: { choice: 'p2' },
  },
  {
    source: 'a', target: 'c', kind: { choice: 'example' }, meaningful: { noul: 0.53 }, authored: false,
    sourceParagraph: { choice: 'p1' }, targetParagraph: null,
  },
];

test('relationships graph offers article and type filters using the kit Select', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /class="jev-kit jev-relationships"/);
  assert.match(html, /<div class="jev-select/);
  assert.match(html, /Article A/);
  assert.match(html, /Prerequisite/);
  assert.match(html, /Continuation/);
  assert.match(html, /Contradiction/);
});

test('the threshold is a kit range input with a whole-percent readout, not a native slider legend', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /class="jev-range"/);
  assert.match(html, /aria-valuetext="50%"/);
  assert.doesNotMatch(html, /jev-profile-key/);
  assert.doesNotMatch(html, /50\.0%/);
});

test('destinations render as plain HTML rows with sans titles and muted meta text, not pills or foreignObject', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /Article B/);
  assert.match(html, /Article C/);
  assert.match(html, /continuation · 68% · authored/);
  assert.match(html, /example · 53% · suggested/);
  assert.doesNotMatch(html, /foreignObject/);
  assert.doesNotMatch(html, /class="jev-pill(?:| jev-pill--quiet)">(?:continuation|example)/);
});

test('the connector SVG is decorative and drawn 1:1 (no viewBox scale transform)', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));
  const connectorTag = html.match(/<svg[^>]*class="jev-relationships-connector"[^>]*>/)?.[0] ?? '';

  assert.doesNotMatch(connectorTag, /viewBox/);
  assert.match(html, /<svg[^>]*class="jev-relationships-connector"[^>]*width="132"[^>]*height="128"[^>]*aria-hidden="true"/);
  assert.match(html, /<ul[^>]*aria-label="Directed links from Article A\./);
});

test('no relationship is selected by default, so no detail card or inspectors render', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.doesNotMatch(html, /jev-relationships-detail/);
  assert.doesNotMatch(html, /Inspect/);
  assert.doesNotMatch(html, /jev-inspector/);
});

test('with no documents the graph shows the shared empty state', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents: [], relations: [] }));

  assert.match(html, /class="jev-empty"/);
});

test('destination rows carry a full accessible label naming type, probability and provenance', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /aria-label="Article B\. Continuation, 68% probability\. Authored link\./);
  assert.match(html, /aria-label="Article C\. Example, 53% probability\. Model suggestion\./);
});

test('node titles use the sans typeface, not the serif article body font', async () => {
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.match(css, /\.jev-relationships-node-title\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.doesNotMatch(css, /var\(--font-body\)/);
});

test('the stylesheet uses the shared teal accent instead of the old crimson slider', async () => {
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.doesNotMatch(css, /--jev-accent|--color-crimson/);
  assert.match(css, /color:\s*var\(--jev-teal\)/);
});

test('selected rows read via a calm connector + title colour, not a heavy fill block', async () => {
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.match(css, /path\.is-selected\s*\{[^}]*stroke-dasharray:\s*none/s);
  assert.match(css, /\[aria-pressed='true'\]\s*\.jev-relationships-node-title\s*\{[^}]*color:\s*var\(--jev-teal-deep\)/s);
  assert.doesNotMatch(css, /\[aria-pressed='true'\]\s*\{[^}]*background:\s*color-mix/s);
});

test('hover uses the calm dropdown-option cream, matching the kit picker', async () => {
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.match(css, /\.jev-relationships-node:hover[\s\S]*?background:\s*var\(--dropdown-option-hover\)/);
});

test('the article prose leaf-icon bullet is neutralised on the row list, matching search/tending', async () => {
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.match(css, /\.jev-relationships-rows\s*>\s*li::before\s*\{[^}]*content:\s*none\s*!important/s);
});

test('evidence passages render as plain paragraphs, avoiding leaking article blockquote styles', async () => {
  const source = await fs.readFile('src/components/unique/jev/Relationships.jsx', 'utf8');
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.doesNotMatch(source, /<blockquote/);
  assert.match(source, /jev-relationships-passage/);
  assert.doesNotMatch(css, /blockquote/);
});

test('the verdict lead centres a teal probability strong tag next to plain provenance text, with no separate pill', async () => {
  const source = await fs.readFile('src/components/unique/jev/Relationships.jsx', 'utf8');
  const css = await fs.readFile('src/components/unique/jev/relationship-graph.css', 'utf8');

  assert.match(source, /<strong>\{wholePercent\(probability\(selected\.meaningful\)\)\} probability<\/strong>/);
  assert.doesNotMatch(source, /jev-relationships-detail[\s\S]{0,400}jev-pill/);
  assert.match(css, /\.jev-relationships-verdict\s*\{[^}]*align-items:\s*center/s);
});
