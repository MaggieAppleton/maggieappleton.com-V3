import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sentenceAnnotation } from '../src/components/unique/jev/epistemic.js';
import EpistemicLinter from '../src/components/unique/jev/EpistemicLinter.jsx';

const answer = (choice, probabilities) => ({ type: 'choice', choice, probabilities });
const noul = (value) => ({ type: 'noul', noul: value });

test('sentence type appears only when the chosen type reaches 50 percent', () => {
  const visible = sentenceAnnotation({ kind: answer('interpretation', { interpretation: 0.5, empirical: 0.5 }), needsCitation: noul(0), qualification: noul(0) });
  const hidden = sentenceAnnotation({ kind: answer('interpretation', { interpretation: 0.49, empirical: 0.51 }), needsCitation: noul(0), qualification: noul(0) });
  assert.equal(visible.showKind, true);
  assert.equal(visible.kindProbability, 0.5);
  assert.equal(hidden.showKind, false);
});

test('citation and qualification markings are independent from claim type confidence', () => {
  const annotation = sentenceAnnotation({
    kind: answer('speculation', { speculation: 0.42, interpretation: 0.39, empirical: 0.19 }),
    needsCitation: noul(0.71), qualification: noul(0.5),
  });
  assert.equal(annotation.showKind, false);
  assert.equal(annotation.needsCitation, true);
  assert.equal(annotation.needsQualification, true);
  assert.equal(annotation.annotated, true);
});

test('linter renders article sentences with accessible hover and focus explanations', () => {
  const document = {
    id: 'test', title: 'A test article', url: '/test',
    paragraphs: [{ id: 'p1', heading: 'First heading', text: 'One factual sentence. A tentative interpretation.', citations: ['https://example.com'] }],
    epistemic: [
      { sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8, interpretation: 0.2 }), needsCitation: noul(0.7), qualification: noul(0.1) },
      { sentenceId: 'p1-s2', paragraphId: 'p1', kind: answer('interpretation', { empirical: 0.3, interpretation: 0.7 }), needsCitation: noul(0.1), qualification: noul(0.6) },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  assert.match(html, /<article[^>]*class="jev-linted-article"/);
  assert.match(html, /data-sentence-id="p1-s1"/);
  assert.match(html, /data-sentence-id="p1-s2"/);
  assert.match(html, /tabindex="0"[^>]*aria-describedby="jev-tooltip-p1-s1"/);
  assert.match(html, /id="jev-tooltip-p1-s1"[^>]*role="tooltip"/);
  assert.match(html, /class="[^"]*needs-citation[^"]*"/);
  assert.match(html, /class="[^"]*needs-qualification[^"]*"/);
  assert.match(html, /First heading/);
});
