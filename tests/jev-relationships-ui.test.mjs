import test from 'node:test';
import assert from 'node:assert/strict';
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

test('relationships graph offers article and type filters', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /Article A/);
  assert.match(html, /Prerequisite/);
  assert.match(html, /Continuation/);
  assert.match(html, /Contradiction/);
});

test('the threshold announces a whole-percent value', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /aria-valuetext="50%"/);
});

test('destinations show relationship type, probability, and provenance', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /Article B/);
  assert.match(html, /Article C/);
  assert.match(html, /continuation · 68% · authored/);
  assert.match(html, /example · 53% · suggested/);
});

test('the graph labels its directed links', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));
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

  assert.match(html, /Saved Jev evaluations have not been generated yet/);
});

test('destination rows carry a full accessible label naming type, probability and provenance', () => {
  const html = renderToStaticMarkup(React.createElement(Relationships, { documents, relations }));

  assert.match(html, /aria-label="Article B\. Continuation, 68% probability\. Authored link\./);
  assert.match(html, /aria-label="Article C\. Example, 53% probability\. Model suggestion\./);
});
