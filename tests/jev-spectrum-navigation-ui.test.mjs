import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GardenLenses from '../src/components/unique/jev/GardenLenses.jsx';

const lenses = Object.fromEntries(
  ['knowledge', 'practicality', 'abstraction', 'speculation'].map(axis => [axis, { score: 2 }]),
);

test('spectrum navigation renders ranked articles as usable links', () => {
  const documents = [
    { id: 'january', title: 'January 2026', url: '/now-2026-01', lenses },
    { id: 'gardens', title: 'Digital gardens', url: '/garden-history', lenses },
  ];
  const html = renderToStaticMarkup(React.createElement(GardenLenses, { documents }));

  assert.match(html, /2 of 2 articles/);
  assert.match(html, /<a[^>]*href="\/now-2026-01"/);
  assert.match(html, /<a[^>]*href="\/garden-history"/);
});
