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

test('linter renders article sentences with accessible hover and focus explanations, quietly marked by default', () => {
  const document = {
    id: 'test', title: 'A test article', url: '/test',
    paragraphs: [{ id: 'p1', heading: 'First heading', text: 'One factual sentence. A tentative interpretation.', citations: ['https://example.com'] }],
    epistemic: [
      { sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8, interpretation: 0.2 }), needsCitation: noul(0.7), qualification: noul(0.1) },
      { sentenceId: 'p1-s2', paragraphId: 'p1', kind: answer('interpretation', { empirical: 0.3, interpretation: 0.7 }), needsCitation: noul(0.1), qualification: noul(0.6) },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  assert.match(html, /<article class="jev-linted-article">/);
  assert.match(html, /data-sentence-id="p1-s1"/);
  assert.match(html, /data-sentence-id="p1-s2"/);
  assert.match(html, /tabindex="0"[^>]*aria-describedby="jev-tooltip-p1-s1"/);
  assert.match(html, /id="jev-tooltip-p1-s1"[^>]*role="tooltip"/);
  // Sentence 1 is classified with high confidence (0.8): it should carry a
  // default "has-kind" underline class even with no chip active.
  assert.match(html, /class="jev-sentence has-kind jev-kind-0 needs-citation"/);
  assert.match(html, /class="[^"]*needs-qualification[^"]*"/);
  // Flagged sentences carry Wikipedia-style inline tags.
  assert.equal((html.match(/<sup class="jev-flag">\[citation needed\]<\/sup>/g) ?? []).length, 1);
  assert.equal((html.match(/<sup class="jev-flag">\[needs qualifying\]<\/sup>/g) ?? []).length, 1);
  // Links the author already placed in the paragraph read as named sources.
  assert.match(html, /<p class="jev-sources"><span>Cites <\/span><a class="jev-link" href="https:\/\/example.com">example.com<\/a><\/p>/);
  assert.doesNotMatch(html, /Citation 1/);
  assert.match(html, /First heading/);
});

test('the sentence tooltip contains only phrasing content, so it is valid inside the paragraph <p>', () => {
  // Regression test: the tooltip (with its "kind" heading and meter rows) is
  // rendered inside the sentences' <p>. HTML forbids block content (div,
  // h1-h6, p, section, article, header...) inside <p> — the parser would
  // auto-close it early, producing a server/client DOM mismatch and a
  // validateDOMNesting warning plus hydration failure. Every element inside
  // the per-paragraph <p> must therefore be phrasing content (span, a,
  // strong, button, etc.), never div/h4/section/...
  const document = {
    id: 'test', title: 'A test article', url: '/test',
    paragraphs: [{ id: 'p1', heading: '', text: 'One factual sentence.' }],
    epistemic: [{ sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8 }), needsCitation: noul(0.7), qualification: noul(0.6) }],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  const paragraphOpen = html.indexOf('<p>');
  const paragraphClose = html.indexOf('</p>', paragraphOpen);
  assert.ok(paragraphOpen !== -1 && paragraphClose !== -1, 'expected a sentence-wrapping <p> to be present');
  const paragraphInner = html.slice(paragraphOpen + '<p>'.length, paragraphClose);
  const forbiddenTags = ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'section', 'article', 'header', 'footer', 'ul', 'ol', 'table'];
  for (const tag of forbiddenTags) {
    assert.doesNotMatch(paragraphInner, new RegExp(`<${tag}[ >]`), `<${tag}> is not phrasing content and cannot appear inside <p>`);
  }
  // The tooltip and its rows/meters do render inside that <p>, just as spans.
  assert.match(paragraphInner, /jev-sentence-tooltip/);
  assert.match(paragraphInner, /jev-card-header/);
  assert.match(paragraphInner, /jev-tooltip-row/);
});

test('review is a compact kit select and claim type renders capitalised chips without non_claim', () => {
  const document = {
    id: 'test', title: 'A test article', url: '/test',
    paragraphs: [{ id: 'p1', heading: '', text: 'One factual sentence.' }],
    epistemic: [{ sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8, interpretation: 0.2 }), needsCitation: noul(0.7), qualification: noul(0.1) }],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  // Article select + Review select: exactly two native <select>s, no chips for review.
  assert.equal((html.match(/<select[ >]/g) ?? []).length, 2);
  assert.match(html, /jev-epistemic-review-field/);
  assert.match(html, /<option value="citation"><span class="jev-option-label">Citations needed<\/span><\/option>/);
  // Claim type is still a chip group.
  assert.match(html, /role="group"[^>]*aria-labelledby="[^"]*-kind"/);
  assert.match(html, /class="jev-chip jev-kind-chip"/);
  assert.match(html, />Empirical</);
  // "non_claim" is dropped as a chip entirely.
  assert.doesNotMatch(html, />Non claim</);
  assert.doesNotMatch(html, />non claim</);
  // The hint line is present.
  assert.match(html, /Hover or focus a sentence to see how Jev read it\./);
  // No Inspector / raw JSON dump.
  assert.doesNotMatch(html, /jev-inspector/);
  assert.doesNotMatch(html, /Inspect/);
});

test('the linted article sits directly on the page, without a card or Jev header', () => {
  const document = {
    id: 'test', title: 'A test article', url: '/test',
    paragraphs: [{ id: 'p1', heading: '', text: 'One factual sentence.' }],
    epistemic: [{ sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8 }), needsCitation: noul(0), qualification: noul(0) }],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  assert.match(html, /<article class="jev-linted-article">/);
  assert.doesNotMatch(html, /Jev&#x27;s reading/);
  assert.match(html, /<h4>A test article<\/h4><a class="jev-link" href="\/test">Read the original ↗<\/a>/);
});

test('long articles collapse to the first paragraphs with a quiet expand button', () => {
  const paragraphs = Array.from({ length: 7 }, (_, index) => ({
    id: `p${index + 1}`, heading: '', text: `Paragraph number ${index + 1} says something.`,
  }));
  const document = {
    id: 'long', title: 'A long article', url: '/long', paragraphs,
    epistemic: [{ sentenceId: 'p1-s1', paragraphId: 'p1', kind: answer('empirical', { empirical: 0.8 }), needsCitation: noul(0), qualification: noul(0) }],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  assert.match(html, /Paragraph number 4/);
  assert.doesNotMatch(html, /Paragraph number 5/);
  assert.match(html, /<button[^>]*class="jev-button jev-epistemic-more"[^>]*>Show the whole article \(3 more paragraphs\)/);
});

test('collapsed articles say how many flagged sentences are hidden, and review filters show everything', () => {
  const paragraphs = Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}`, heading: '', text: `Paragraph number ${index + 1} says something.` }));
  const document = {
    id: 'flags', title: 'Flags', url: '/flags', paragraphs,
    epistemic: [{ sentenceId: 'p6-s1', paragraphId: 'p6', kind: answer('empirical', { empirical: 0.8 }), needsCitation: noul(0.7), qualification: noul(0) }],
  };
  const html = renderToStaticMarkup(React.createElement(EpistemicLinter, { documents: [document] }));
  assert.doesNotMatch(html, /Paragraph number 6/);
  assert.match(html, /Show the whole article \(2 more paragraphs, 1 flagged sentence\)/);
});
