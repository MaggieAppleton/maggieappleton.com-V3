# Post-level Garden-tending Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Experiment 5’s flat finding queue with one expandable maintenance report per post.

**Architecture:** Move recommendation derivation and post-level grouping into a pure `tending.js` module. `TendingReport.jsx` consumes filtered report objects and renders one accessible expandable row per post; existing snapshot data and Jev answers remain unchanged.

**Tech Stack:** React 18, JavaScript, Astro, Node test runner, existing Jev snapshot.

---

### Task 1: Build one report per post

**Files:**
- Create: `src/components/unique/jev/tending.js`
- Create: `tests/jev-tending-ui.test.mjs`

- [x] **Step 1: Write the failing grouping test**

Create fixtures for two documents and assert that `buildTendingReports()` returns unique document IDs, excludes a clean document, and assigns all four categories:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTendingReports } from '../src/components/unique/jev/tending.js';

const noul = noul => ({ type: 'noul', noul });
const choice = (value, confidence = 0.8) => ({ type: 'choice', choice: value, confidence, probabilities: { [value]: confidence } });
const base = { type: 'note', description: 'A useful description', updated: '2026-08-01', inbound: ['other'], growthStage: 'budding', suggestedTopics: [], tending: { title_fit: noul(.9), description_fit: noul(.9), growth_stage: choice('budding') } };

test('groups every recommendation under one unique post report', () => {
  const documents = [
    { ...base, id: 'needs-work', title: 'Needs work', description: '', updated: '2020-01-01', inbound: [], suggestedTopics: [{ topic: 'Writing', probability: .84 }], tending: { ...base.tending, growth_stage: choice('evergreen') } },
    { ...base, id: 'clean', title: 'Clean post' },
  ];
  const relations = [{ source: 'needs-work', target: 'clean', authored: false, meaningful: noul(.75), kind: choice('continuation') }];
  const reports = buildTendingReports(documents, relations, '2026-09-19T00:00:00.000Z');
  assert.deepEqual(reports.map(report => report.doc.id), ['needs-work']);
  assert.equal(new Set(reports[0].recommendations.map(item => item.category)).size, 4);
  assert.equal(new Set(reports.map(report => report.doc.id)).size, reports.length);
});
```

- [x] **Step 2: Run the test and confirm the missing-module failure**

Run: `npm run test:jev -- --test-name-pattern='groups every recommendation'`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tending.js`.

- [x] **Step 3: Implement the pure report builder**

Export `categories` and `buildTendingReports(documents, relations, generatedAt)`. Each recommendation must have `{id, category, label, origin, probability, detail}`. Use these mappings:

```js
export const categories = ['metadata', 'classification', 'connections', 'freshness'];
export const categoryLabels = { metadata: 'Metadata', classification: 'Classification', connections: 'Connections', freshness: 'Freshness' };

// Deterministic rules
add('connections', 'Connect another post to this one', 'rule', null, { inbound: doc.inbound });
add('metadata', 'Add a description', 'rule', null, { description: doc.description });
add('freshness', `Review this post · last updated ${doc.updated}`, 'rule', null, { updated: doc.updated, ageInDays: age });

// Saved Jev judgements
add('metadata', 'Review the title', 'jev', titleFit, doc.tending.title_fit);
add('metadata', 'Review the description', 'jev', descriptionFit, doc.tending.description_fit);
add('classification', `Consider changing growth stage: ${doc.growthStage} → ${stage}`, 'jev', doc.tending.growth_stage.confidence ?? null, doc.tending.growth_stage);
add('classification', `Consider adding topic “${topic.topic}”`, 'jev', topic.probability, topic);
add('connections', `Consider a ${kind} link to “${target.title}”`, 'jev', probability(relation.meaningful), relation);
```

Return only reports whose `recommendations.length > 0`. Preserve the current exceptions for `now` and `smidgeon` descriptions and the existing thresholds: fit below `.5`, topics already prefiltered by generation, meaningful relationship at least `.5`, freshness older than 730 days.

- [x] **Step 4: Run the focused test**

Run: `npm run test:jev -- --test-name-pattern='groups every recommendation'`

Expected: PASS.

### Task 2: Filter and sort reports

**Files:**
- Modify: `src/components/unique/jev/tending.js`
- Modify: `tests/jev-tending-ui.test.mjs`

- [x] **Step 1: Add failing filter and ordering tests**

```js
import { filterTendingReports } from '../src/components/unique/jev/tending.js';

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
    { doc: { id: 'a', title: 'Apple' }, recommendations: [{ id: '2', category: 'metadata', label: 'Two' }, { id: '3', category: 'connections', label: 'Three' }] },
  ];
  assert.deepEqual(filterTendingReports(reports, { category: 'all', query: '', sort: 'count' }).map(row => row.doc.id), ['a', 'z']);
  assert.deepEqual(filterTendingReports(reports, { category: 'all', query: '', sort: 'title' }).map(row => row.doc.id), ['a', 'z']);
});
```

- [x] **Step 2: Run the focused tests and confirm the missing export failure**

Run: `npm run test:jev -- --test-name-pattern='filters recommendations|sorts by visible'`

Expected: FAIL because `filterTendingReports` is not exported.

- [x] **Step 3: Implement filtering and stable ordering**

```js
export function filterTendingReports(reports, { category = 'all', query = '', sort = 'count' }) {
  const needle = query.trim().toLowerCase();
  return reports.flatMap(report => {
    const recommendations = category === 'all'
      ? report.recommendations
      : report.recommendations.filter(item => item.category === category);
    const matches = !needle || `${report.doc.title} ${recommendations.map(item => item.label).join(' ')}`.toLowerCase().includes(needle);
    return recommendations.length && matches ? [{ ...report, recommendations }] : [];
  }).sort((a, b) => sort === 'title'
    ? a.doc.title.localeCompare(b.doc.title)
    : b.recommendations.length - a.recommendations.length || a.doc.title.localeCompare(b.doc.title));
}
```

- [x] **Step 4: Run the focused tests**

Run: `npm run test:jev -- --test-name-pattern='filters recommendations|sorts by visible'`

Expected: both PASS.

### Task 3: Render accessible post reports

**Files:**
- Modify: `src/components/unique/jev/TendingReport.jsx`
- Modify: `tests/jev-tending-ui.test.mjs`

- [x] **Step 1: Add a failing server-render test**

Add `React`, `renderToStaticMarkup`, and `TendingReport` imports, render the component with the Task 1 fixtures, and assert:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TendingReport from '../src/components/unique/jev/TendingReport.jsx';

const html = renderToStaticMarkup(React.createElement(TendingReport, { documents, relations, generatedAt: '2026-09-19T00:00:00.000Z' }));
assert.equal((html.match(/class="jev-report-toggle"/g) ?? []).length, 1);
assert.match(html, /aria-expanded="false"/);
assert.match(html, /aria-controls="jev-report-needs-work"/);
assert.match(html, /id="jev-report-needs-work"[^>]*hidden/);
assert.match(html, /Find a post/);
assert.match(html, /All recommendations/);
assert.doesNotMatch(html, /Find a finding|Code \+ Jev/);
```

- [x] **Step 2: Run the focused test and confirm the old flat UI fails**

Run: `npm run test:jev -- --test-name-pattern='renders one expandable report'`

Expected: FAIL because the old component renders `.jev-finding` buttons and the old labels.

- [x] **Step 3: Replace flat finding state with report state**

Import `buildTendingReports`, `categories`, `categoryLabels`, and `filterTendingReports`. Use state for `category`, `query`, `sort`, `expanded` as a `Set`, and `limit`. Derive `reports` and `visible` with `useMemo`.

Render three controls:

```jsx
<label className="jev-field">Find a post<input type="search" value={query} onChange={...} /></label>
<label className="jev-field">Recommendation type<select value={category} onChange={...}>
  <option value="all">All recommendations</option>
  {categories.map(value => <option key={value} value={value}>{categoryLabels[value]}</option>)}
</select></label>
<label className="jev-field">Sort<select value={sort} onChange={...}>
  <option value="count">Most recommendations</option>
  <option value="title">Post title</option>
</select></label>
```

Render one report per post. The toggle uses `aria-expanded` and `aria-controls`; the associated region remains in the DOM with `hidden={!isExpanded}`. The collapsed row shows the post title, `${count} recommendation(s)`, and unique category labels. The expanded region groups recommendations in `categories` order. Each recommendation shows its label, `Rule` or `Jev`, and `percent(probability)` only when finite. Include `<Source document={report.doc} />` and `<Inspector data={report.recommendations} label="Inspect recommendations" />`.

- [x] **Step 4: Run the focused component test**

Run: `npm run test:jev -- --test-name-pattern='renders one expandable report'`

Expected: PASS.

### Task 4: Clarify styling, copy, and responsive behavior

**Files:**
- Modify: `src/components/unique/jev/Experiments.jsx`
- Modify: `src/components/unique/jev/jev.css`
- Modify: `planning/jev-experiments.md`

- [x] **Step 1: Update the section description**

Use: `Review maintenance recommendations grouped by post. Expand a post to see suggested metadata, classification, connection, and freshness changes; nothing edits your garden.`

- [x] **Step 2: Replace the obsolete finding styles**

Replace the obsolete finding styles with:

```css
.jev .jev-report { border-top: 1px solid var(--jev-rule); }
.jev .jev-report-toggle { display: grid; grid-template-columns: minmax(0, 1fr) auto 18px; align-items: center; gap: 20px; width: 100%; padding: 18px 8px; border: 0; border-radius: 0; text-align: left; }
.jev .jev-report-toggle[aria-expanded='true'] { background: color-mix(in srgb, var(--jev-accent) 5%, transparent); }
.jev .jev-report-summary { display: grid; gap: 4px; }
.jev .jev-report-count { color: var(--jev-muted); font-size: 11px; white-space: nowrap; }
.jev .jev-report-categories { color: var(--jev-muted); font-size: 11px; }
.jev .jev-report-panel { padding: 5px 32px 26px; }
.jev .jev-recommendation-group { margin-top: 20px; }
.jev .jev-recommendation-group h4 { margin: 0 0 8px; font: 400 17px/1.35 'Canela Deck', Georgia, serif; }
.jev .jev-recommendation { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; padding: 9px 0; border-top: 1px solid color-mix(in srgb, var(--jev-rule) 70%, transparent); }
.jev .jev-recommendation-meta { display: flex; align-items: baseline; gap: 8px; color: var(--jev-muted); font-size: 11px; }
.jev .jev-recommendation-origin { text-transform: uppercase; letter-spacing: .04em; }
```

At `max-width: 600px`, stack the title, count, and category summary; keep the toggle and panel within `width: 100%` and allow long post titles to wrap.

```css
.jev .jev-report-toggle { grid-template-columns: minmax(0, 1fr) 16px; gap: 8px; }
.jev .jev-report-count { grid-column: 1; white-space: normal; }
.jev .jev-report-panel { padding-inline: 8px; }
.jev .jev-recommendation { grid-template-columns: 1fr; gap: 4px; }
```

- [x] **Step 3: Run all focused verification**

Run:

```bash
npm run test:jev
npm run jev:check
git diff --check
```

Expected: 0 test failures, snapshot verification succeeds, and `git diff --check` prints nothing.

- [x] **Step 4: Verify in the existing browser preview**

At `/jev-experiments`, verify:

- each post appears once;
- expanding via click and keyboard reveals grouped recommendations;
- category filtering changes both post count and visible recommendations;
- title and recommendation searches work;
- both sorts work;
- the normal viewport and 375×812 have no horizontal overflow;
- the console has no warnings or errors.

- [x] **Step 5: Record the verified behavior**

Update `planning/jev-experiments.md` with the post report count, test count, browser behavior, and the fact that no Jev regeneration or full image build was needed.

No commits are included in this plan because the current managed worktree is detached and contains the larger uncommitted Jev experiment.
