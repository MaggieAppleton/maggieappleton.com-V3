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

test('the search field carries a real label wired to the input', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.match(html, /for="jev-search-input"[^>]*>Search the garden/);
  assert.match(html, /id="jev-search-input"/);
});

test('search results have one polite status region', () => {
  const html = renderToStaticMarkup(React.createElement(Search, { documents: [] }));
  assert.equal((html.match(/role="status" aria-live="polite"/g) ?? []).length, 1);
});
