import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const featureOwners = [
  ['JevScrollSorter.astro', 'sorter.css'],
  ['SpectrumNavigation.astro', 'spectrum-navigation.css'],
  ['SemanticSearch.astro', 'semantic-search.css'],
  ['TypedRelationshipGraph.astro', 'relationship-graph.css'],
  ['EpistemicLinterExperiment.astro', 'epistemic-linter.css'],
  ['GardenTendingWorkshop.astro', 'tending-report.css'],
];

test('each Jev feature imports its owned stylesheet', async () => {
  for (const [component, stylesheet] of featureOwners) {
    const source = await fs.readFile(`src/components/unique/jev/${component}`, 'utf8');
    assert.match(source, new RegExp(`import ['"]\\./${stylesheet.replace('.', '\\.')}['"]`));
  }
});

test('the shared Jev foundation contains no feature-owned or obsolete selectors', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');

  for (const selector of [
    'jev-scroll-',
    'jev-lenses-',
    'jev-ranked-',
    'jev-search-',
    'jev-graph',
    'jev-linted-',
    'jev-sentence',
    'jev-report',
    'jev-pipeline',
    'jev-stages',
    'jev-distributions',
  ]) {
    assert.doesNotMatch(css, new RegExp(selector));
  }
});

test('the shared Jev foundation uses global design-system primitives', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');

  assert.match(css, /font-family:\s*var\(--font-sans\)/);
  assert.match(css, /font-size:\s*var\(--font-size-xs\)/);
  assert.match(css, /line-height:\s*var\(--leading-base\)/);
  assert.match(css, /border-radius:\s*var\(--border-radius-sm\)/);
  assert.doesNotMatch(css, /var\(--color-[^)]+,\s*#[0-9a-f]+\)/i);
});
