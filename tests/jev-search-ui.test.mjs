import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Search from '../src/components/unique/jev/Search.jsx';

test('search offers six distinct, keyboard-accessible example questions below the form', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  const examples = html.match(/<div[^>]*aria-label="Example questions"[^>]*>(.*?)<\/div>/s)?.[1] || '';
  const buttons = [...examples.matchAll(/<button\b[^>]*type="button"[^>]*>(.*?)<\/button>/gs)];
  assert.equal(buttons.length, 6);
  assert.equal(new Set(buttons.map(match => match[1])).size, 6);
  for (const button of buttons) assert.match(button[1], /\?$/);
  assert.ok(html.indexOf('aria-label="Example questions"') > html.indexOf('</form>'));
});

test('uses the shared Jev kit controls, not bespoke or browser-default ones', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.match(html, /class="jev-kit jev-search"/);
  assert.match(html, /class="jev-input"/);
  assert.match(html, /class="jev-button"/);
  assert.match(html, /class="jev-chip"/);
  // Every example is a toggle-style chip that reports pressed state.
  assert.match(html, /class="jev-chip" aria-pressed="false"/);
});

test('the search field carries a real label wired to the input', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.match(html, /for="jev-search-input"[^>]*>Search the garden/);
  assert.match(html, /id="jev-search-input"/);
});

test('keeps a single calm aria-live status region and drops the chatty narration', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.match(html, /class="jev-search-status" role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /Waiting to evaluate/);
  assert.doesNotMatch(html, /Evaluating candidate passages/);
  assert.doesNotMatch(html, /Relevant candidate:/);
});

test('removes the raw JSON inspector and the old ranked-table markup', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.doesNotMatch(html, /jev-inspector/);
  assert.doesNotMatch(html, /Inspect request and response/);
  assert.doesNotMatch(html, /jev-search-head/);
  assert.doesNotMatch(html, /jev-article-title/);
});
