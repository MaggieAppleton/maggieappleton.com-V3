import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  getWinningCategory,
  validateSorterConfig,
} from '../src/lib/jev/sorter.js';
import { placePopover } from '../src/lib/jev/popover.js';

const config = {
  question: 'Is this a sandwich?',
  categories: [
    { id: 'no', label: 'No', detailText: "it's not a sandwich" },
    { id: 'yes', label: 'Yes', detailText: "it's a sandwich" },
  ],
  items: [
    {
      id: 'burrito',
      label: 'Burrito',
      visual: { type: 'emoji', value: '🌯' },
      probabilities: { no: 0.31, yes: 0.69 },
    },
    {
      id: 'doughnut',
      label: 'Doughnut',
      visual: { type: 'emoji', value: '🍩' },
      probabilities: { no: 0.91, yes: 0.09 },
    },
  ],
};

test('winning category uses the highest authored probability', () => {
  assert.equal(getWinningCategory(config.items[0], config.categories), 'yes');
  assert.equal(getWinningCategory(config.items[1], config.categories), 'no');
});

test('popover placement follows its anchor and flips at viewport edges', () => {
  const base = {
    width: 150,
    height: 64,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  assert.deepEqual(
    placePopover({ ...base, anchorX: 200, anchorY: 180 }),
    { x: 212, y: 192, originX: 'left', originY: 'top' },
  );
  assert.deepEqual(
    placePopover({ ...base, anchorX: 780, anchorY: 580 }),
    { x: 618, y: 504, originX: 'right', originY: 'bottom' },
  );
  assert.deepEqual(
    placePopover({
      ...base,
      anchorX: -20,
      anchorY: -10,
      viewportWidth: 180,
      viewportHeight: 100,
    }),
    { x: 8, y: 8, originX: 'left', originY: 'top' },
  );
});

test('valid configuration is returned unchanged', () => {
  assert.equal(validateSorterConfig(config), config);
});

test('configuration validation rejects ambiguous authored data', () => {
  const invalidCases = [
    [{ ...config, question: '' }, /question/],
    [{ ...config, categories: [config.categories[0]] }, /at least two categories/],
    [{ ...config, categories: [config.categories[0], config.categories[0]] }, /Duplicate category ID "no"/],
    [{
      ...config,
      categories: [{ id: 'no', label: 'No' }, config.categories[1]],
    }, /detail text/],
    [{ ...config, items: [config.items[0], config.items[0]] }, /Duplicate item ID "burrito"/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: 0.5 } }],
    }, /exactly the configured categories/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: -0.1, yes: 1.1 } }],
    }, /between 0 and 1/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: 0.2, yes: 0.2 } }],
    }, /total must be between 0.99 and 1.01/],
    [{
      ...config,
      items: [{ ...config.items[0], visual: { type: 'emoji', value: '' } }],
    }, /emoji value/],
    [{
      ...config,
      items: [{ ...config.items[0], visual: { type: 'image', src: '/burrito.png' } }],
    }, /image src and alt/],
  ];

  for (const [candidate, message] of invalidCases) {
    assert.throws(() => validateSorterConfig(candidate), message);
  }
});

test('sorter model exposes classification helpers without reader-choice state', async () => {
  const model = await import('../src/lib/jev/sorter.js');

  assert.equal(typeof model.validateSorterConfig, 'function');
  assert.equal(typeof model.getWinningCategory, 'function');
  assert.equal('applySorterChoice' in model, false);
  assert.equal('createInitialSorterState' in model, false);
});

test('motion transitions produce eased progress and visible spring overshoot', async () => {
  const {
    createProgressSampler,
    scaleOvershootProgress,
  } = await import('../src/lib/jev/motion.js');

  const easing = createProgressSampler({
    type: 'easing',
    duration: 0.45,
    ease: [0.16, 1.25, 0.3, 1],
  });
  const spring = createProgressSampler({
    type: 'spring',
    visualDuration: 0.45,
    bounce: 0.35,
  });

  assert.ok(easing.peak > 1);
  assert.ok(spring.peak > 1.05);
  assert.ok(spring.duration > 0);
  assert.equal(scaleOvershootProgress(spring.peak, spring.peak, 0.72, 1.23), 1.23);
  assert.equal(scaleOvershootProgress(1, spring.peak, 0.72, 1.23), 1);
});

test('shared scroll sorter renders a single-item stage, buckets, and accessible final summary', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');
  const itemSource = await fs.readFile('src/components/unique/jev/JevSorterItem.astro', 'utf8');

  assert.match(source, /data-jev-scroll-sorter/);
  assert.match(source, /class="jev-scroll-eyebrow">Ask Jev/);
  assert.match(source, /class="jev-scroll-top"/);
  assert.match(source, /jev-scroll-source-stage/);
  assert.match(source, /data-jev-source-slot/);
  assert.match(source, /data-jev-moving-item/);
  assert.match(source, /data-jev-target/);
  assert.match(source, /<section class="jev-scroll-bucket">\s*<h3>\{category\.label\}<\/h3>\s*<div/s);
  assert.match(source, /data-item-count=\{items\.filter\(item => item\.categoryId === category\.id\)\.length\}/);
  assert.match(source, /jev-scroll-summary/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /getWinningCategory/);
  assert.match(source, /validateSorterConfig/);
  assert.match(source, /probabilityLabel,/);
  assert.match(source, /summaryLabel: `\$\{category\.label\},/);
  assert.match(source, /detailLabel: `\$\{probabilityLabel\} sure \$\{category\.detailText\}`/);
  assert.match(source, /<JevSorterItem[\s\S]*detailLabel=\{item\.detailLabel\}[\s\S]*interactive/);
  assert.doesNotMatch(source, /confidenceText|confidenceLabel/);
  assert.doesNotMatch(source, /class="jev-scroll-buckets"[\s\S]{0,120}aria-hidden="true"/);
  assert.doesNotMatch(source, /aria-live|Start over|You sorted|agrees|disagrees/);
  assert.match(source, /class="jev-scroll-popover"/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /data-jev-popover-name/);
  assert.match(source, /data-jev-popover-probability/);
  assert.match(source, /data-jev-popover-copy/);
  assert.match(itemSource, /<button/);
  assert.match(itemSource, /type="button"/);
  assert.match(itemSource, /data-jev-detail-item/);
  assert.match(itemSource, /data-jev-food-label=\{item\.label\}/);
  assert.match(itemSource, /data-jev-probability-label=\{probabilityLabel\}/);
  assert.match(itemSource, /data-jev-detail-text=\{item\.detailText\}/);
  assert.match(itemSource, /aria-label=\{`\$\{item\.label\}: \$\{detailLabel\}`\}/);
  assert.doesNotMatch(itemSource, /jev-scroll-name|jev-scroll-probability-detail|jev-scroll-probability-positioner/);
});

test('scroll sorter uses tunable curved flights, delayed score pops, and lifecycle cleanup', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');
  const css = await fs.readFile('src/components/unique/jev/sorter.css', 'utf8');
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

  assert.match(source, /import scrollama from "scrollama"/);
  assert.match(source, /onPageLifecycle/);
  assert.match(source, /onStepProgress/);
  assert.match(source, /onStepExit/);
  assert.match(source, /quadraticPoint/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /scroller\.destroy/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /scrollOffset:\s*0\.08/);
  assert.match(source, /itemWindow:\s*0\.14/);
  assert.match(source, /revealEnd:\s*0\.22/);
  assert.match(source, /flightStart:\s*0\.26/);
  assert.match(source, /flightEnd:\s*0\.82/);
  assert.match(source, /scoreStart:\s*0\.86/);
  assert.match(source, /scoreWindow:\s*0\.06/);
  assert.doesNotMatch(source, /settleEnd/);
  assert.match(
    source,
    /type:\s*"spring"[\s\S]*visualDuration:\s*0\.7[\s\S]*bounce:\s*0/s,
  );
  assert.match(
    source,
    /lateralArc:\s*128[\s\S]*verticalLift:\s*56[\s\S]*arcPeak:\s*0\.5[\s\S]*scaleDip:\s*0\.025/s,
  );
  assert.match(source, /overshootScale:\s*1\.1/);
  assert.match(source, /createProgressSampler/);
  assert.match(source, /scaleOvershootProgress/);
  assert.match(source, /sizeScale = 1 \+ \(\(coordinates\.scale - 1\) \* progress\)/);
  assert.match(source, /- \(direction \* motionTuning\.flight\.lateralArc\)/);
  assert.match(
    source,
    /\(coordinates\.y \* motionTuning\.flight\.arcPeak\)\s*-\s*motionTuning\.flight\.verticalLift/,
  );
  assert.doesNotMatch(source, /const settledProgress/);
  assert.doesNotMatch(source, /coordinates\.finalItem\.style\.opacity/);
  assert.match(source, /coordinates\.finalLabel\.style\.opacity/);
  assert.match(source, /transition:\s*\{\s*type:\s*"spring"[\s\S]*overshootScale/s);
  assert.match(source, /translateY\(\$\{scoreLift\}px\) scale\(\$\{scoreScale\}\)/);
  assert.match(source, /index === 0\s*\?\s*1\s*:/);
  assert.match(source, /item\.style\.opacity/);
  assert.match(source, /\.jev-scroll-final \.jev-scroll-item/);
  assert.doesNotMatch(source, /source\.style\.width/);
  assert.match(source, /scale:\s*target\.width \/ source\.width/);
  assert.match(source, /step: `\[data-jev-scroll-sorter="\$\{rootIndex\}"\]`/);
  assert.match(source, /offset:\s*TIMING\.scrollOffset/);
  assert.doesNotMatch(source, /dialkit|DialKit|import\.meta\.env\.DEV/);
  assert.match(source, /const scroller = scrollama\(\);\s*measure\(\);\s*scroller\s*\.setup/);
  assert.equal((source.match(/measure\(\);\s*scroller\.resize\(\)/g) || []).length, 1);
  assert.match(
    css,
    /\.jev-scroll-sorter\.is-ready \.jev-scroll-final :is\(img, \.jev-scroll-emoji\)\s*\{\s*opacity:\s*0;/,
  );
  assert.doesNotMatch(
    css,
    /\.jev-scroll-sorter\.is-ready \.jev-scroll-final\s*\{\s*opacity:\s*0;/,
  );
  assert.equal(packageJson.dependencies.dialkit, undefined);
});

test('sorter popover follows pointer input and cleans up every listener', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');

  assert.match(source, /import \{ placePopover \} from "\.\.\/\.\.\/\.\.\/lib\/jev\/popover\.js"/);
  assert.match(source, /querySelectorAll<HTMLElement>\("\[data-jev-detail-item\]"\)/);
  assert.match(source, /pointerenter/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerleave/);
  assert.match(source, /aria-describedby/);
  assert.match(source, /popover\.hidden = false/);
  assert.match(source, /popover\.hidden = true/);
  assert.match(source, /window\.innerWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /removeEventListener\("pointermove"/);
  assert.match(source, /removeEventListener\("focus"/);
  assert.match(source, /item\.removeAttribute\("data-expanded"\)/);
  assert.match(source, /finalItem\.toggleAttribute\("data-settled", scoreProgress >= 1\)/);
  assert.match(source, /finalItem\.tabIndex = scoreProgress >= 1 \? 0 : -1/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /root\.addEventListener\("click", handleDetailClick\)/);
  assert.match(source, /root\.addEventListener\("keydown", handleDetailKeydown\)/);
  assert.match(source, /root\.removeEventListener\("click", handleDetailClick\)/);
  assert.match(source, /root\.removeEventListener\("keydown", handleDetailKeydown\)/);
});

test('the sandwich wrapper passes binary data without React hydration', async () => {
  const sandwich = await fs.readFile('src/components/unique/jev/SandwichSorter.astro', 'utf8');
  const burrito = await fs.readFile('public/images/posts/jev/burrito.png');
  const doughnut = await fs.readFile('public/images/posts/jev/doughnut.png');
  const croissant = await fs.readFile('public/images/posts/jev/croissant.png');
  const popTart = await fs.readFile('public/images/posts/jev/pop-tart.png');
  const empanada = await fs.readFile('public/images/posts/jev/empanada.png');

  assert.match(sandwich, /import JevScrollSorter/);
  assert.match(sandwich, /<JevScrollSorter \{\.\.\.config\} \/>/);
  assert.doesNotMatch(sandwich, /client:load|<noscript>|JevSorter\.jsx/);
  assert.match(sandwich, /id: 'yes'/);
  assert.match(sandwich, /id: 'no'/);
  assert.match(sandwich, /detailText: "it's not a sandwich"/);
  assert.match(sandwich, /detailText: "it's a sandwich"/);
  assert.match(sandwich, /id: 'burrito'[\s\S]*type: 'image'[\s\S]*src: '\/images\/posts\/jev\/burrito\.png'/);
  assert.match(sandwich, /id: 'doughnut'[\s\S]*type: 'image'[\s\S]*src: '\/images\/posts\/jev\/doughnut\.png'/);
  assert.match(sandwich, /id: 'croissant'[\s\S]*type: 'image'[\s\S]*src: '\/images\/posts\/jev\/croissant\.png'/);
  assert.match(sandwich, /id: 'pop-tart'[\s\S]*type: 'image'[\s\S]*src: '\/images\/posts\/jev\/pop-tart\.png'/);
  assert.match(sandwich, /id: 'empanada'[\s\S]*type: 'image'[\s\S]*src: '\/images\/posts\/jev\/empanada\.png'/);
  assert.deepEqual([...burrito.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...doughnut.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...croissant.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...popTart.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...empanada.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(sandwich, /id: 'burrito'[\s\S]*id: 'doughnut'[\s\S]*id: 'croissant'[\s\S]*id: 'pop-tart'[\s\S]*id: 'empanada'/);
});

test('scroll sorter CSS defines sticky staging and a non-sticky reduced-motion final state', async () => {
  const css = await fs.readFile('src/components/unique/jev/sorter.css', 'utf8');

  assert.match(css, /--jev-sorter-max-width:\s*800px/);
  assert.match(css, /--jev-sorter-viewport-inset:\s*1\.5rem/);
  assert.match(css, /--jev-sorter-scroll-distance:\s*320vh/);
  assert.match(css, /\.jev-scroll-sorter\s*\{[^}]*margin:\s*var\(--space-3xs\) auto var\(--space-l\)/s);
  assert.match(css, /\.jev-scroll-sorter:is\(\.is-measuring, \.is-ready\)\s*\{[^}]*height:\s*var\(--jev-sorter-scroll-distance\)/s);
  assert.match(css, /\.jev-scroll-sorter:is\(\.is-measuring, \.is-ready\) \.jev-scroll-sticky\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.jev-scroll-sorter:is\(\.is-measuring, \.is-ready\) \.jev-scroll-sticky\s*\{[^}]*top:\s*var\(--jev-sorter-viewport-inset\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*height:\s*calc\(100dvh - 2 \* var\(--jev-sorter-viewport-inset\)\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*grid-template-rows:\s*42% 58%[^}]*padding:\s*0/s);
  assert.match(css, /\.jev-scroll-top\s*\{[^}]*padding:\s*var\(--space-s\) var\(--space-s-m\)/s);
  assert.match(css, /\.jev-scroll-top\s*\{[^}]*padding-block-start:\s*calc\(var\(--space-s\) \+ var\(--space-s-m\)\)/s);
  assert.match(css, /\.jev-scroll-buckets\s*\{[^}]*gap:\s*0[^}]*padding:\s*0[^}]*border-top:\s*1px solid rgb\(0 0 0 \/ 10%\)/s);
  assert.match(css, /\.jev-scroll-bucket \+ \.jev-scroll-bucket\s*\{[^}]*border-left:\s*1px solid rgb\(0 0 0 \/ 10%\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*max-width:\s*var\(--jev-sorter-max-width\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*border:\s*1px solid rgb\(0 0 0 \/ 10%\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*border-radius:\s*var\(--border-radius-lg\)/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*box-shadow:\s*var\(--box-shadow-sm\)/s);
  assert.match(css, /\.jev-scroll-question\s*\{[^}]*margin:\s*0 !important/s);
  assert.match(css, /\.jev-scroll-eyebrow\s*\{[^}]*font-family:\s*var\(--font-sans\)[^}]*font-size:\s*var\(--font-size-sm\)/s);
  assert.match(css, /\.jev-scroll-eyebrow\s*\{[^}]*width:\s*fit-content[^}]*border-radius:\s*999px[^}]*background:\s*var\(--color-crimson-10\)[^}]*color:\s*var\(--color-crimson\)/s);
  assert.match(css, /\.jev-scroll-question\s*\{[^}]*font-size:\s*var\(--font-size-xl\)/s);
  assert.match(css, /\.jev-scroll-sorter:is\(\.is-measuring, \.is-ready\) \.jev-scroll-top\s*\{[^}]*grid-template-rows:\s*auto var\(--jev-sorter-source-height\)[^}]*gap:\s*var\(--space-3xs\)/s);
  assert.match(css, /\.jev-scroll-source-slot\s*\{[^}]*top:\s*calc\(-1 \* var\(--space-2xs\)\)[^}]*width:\s*var\(--jev-sorter-source-item-max\)/s);
  assert.match(css, /grid-template-columns:\s*repeat\(var\(--bucket-items\),\s*minmax\(0,\s*var\(--jev-sorter-item-max\)\)\)/);
  assert.match(css, /\.jev-scroll-targets\[data-item-count='3'\]\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*var\(--jev-sorter-item-max\)\)\)/s);
  assert.match(css, /\.jev-scroll-targets\[data-item-count='3'\] \.jev-scroll-target:first-child\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*width:\s*var\(--jev-sorter-item-max\)/s);
  assert.match(css, /\.jev-scroll-targets\s*\{[^}]*column-gap:\s*var\(--space-xl\)[^}]*row-gap:\s*var\(--space-xs\)/s);
  assert.match(css, /\.jev-scroll-bucket h3\s*\{[^}]*font-size:\s*var\(--font-size-lg\)/s);
  assert.match(css, /\.jev-scroll-bucket h3\s*\{[^}]*color:\s*var\(--color-gray-800\)[^}]*font-family:\s*var\(--font-serif\)/s);
  assert.match(css, /\.jev-scroll-bucket\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto 1fr/s);
  assert.match(css, /\.jev-scroll-bucket\s*\{[^}]*padding-block-start:\s*calc\(var\(--space-s-m\) \+ 0\.5rem\)/s);
  assert.match(css, /--jev-sorter-item-max:\s*100px/);
  assert.match(css, /--jev-sorter-visual-max:\s*100px/);
  assert.match(css, /\.jev-scroll-item img,[\s\S]*max-width:\s*var\(--jev-sorter-visual-max\)/s);
  assert.match(css, /\[data-jev-item-id='burrito'\] img\s*\{[^}]*transform:\s*scale\(1\.4\)/s);
  assert.match(css, /\[data-jev-item-id='doughnut'\] img\s*\{[^}]*transform:\s*scale\(1\.2\)/s);
  assert.match(css, /\[data-jev-item-id='croissant'\] img\s*\{[^}]*transform:\s*scale\(1\.3\)/s);
  assert.match(css, /\[data-jev-item-id='pop-tart'\] img\s*\{[^}]*transform:\s*scale\(1\.2\)/s);
  assert.match(css, /\[data-jev-item-id='empanada'\] img\s*\{[^}]*transform:\s*scale\(1\.3\)/s);
  assert.match(css, /\.jev-scroll-item\s*\{[^}]*row-gap:\s*calc\(\(var\(--space-2xs\) \+ var\(--space-3xs\)\) \/ 2\)/s);
  assert.match(css, /\.jev-scroll-probability\s*\{[^}]*width:\s*fit-content[^}]*padding:\s*calc\(var\(--space-3xs\) \/ 2\) var\(--space-2xs\)[^}]*border-radius:\s*999px[^}]*background:\s*var\(--color-crimson-10\)[^}]*color:\s*var\(--color-crimson\)[^}]*font-size:\s*var\(--font-size-xs\)/s);
  assert.match(css, /\.jev-scroll-final \.jev-scroll-item\s*\{[^}]*appearance:\s*none[^}]*border:\s*0[^}]*background:\s*transparent[^}]*cursor:\s*pointer !important/s);
  assert.match(css, /\.jev-scroll-popover\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*10/s);
  assert.match(css, /\.jev-scroll-popover\s*\{[^}]*border:\s*1px solid rgb\(0 0 0 \/ 7%\)[^}]*border-radius:\s*var\(--border-radius-lg\)[^}]*background:\s*#fff[^}]*box-shadow:\s*var\(--box-shadow-md\)/s);
  assert.match(css, /\.jev-scroll-popover\s*\{[^}]*translate3d\(var\(--jev-popover-x\), var\(--jev-popover-y\), 0\)[^}]*scale:\s*0\.98/s);
  assert.match(css, /\.jev-scroll-popover-name\s*\{[^}]*font-weight:\s*600/s);
  assert.match(css, /\.jev-scroll-popover-detail\s*\{[^}]*font-size:\s*var\(--font-size-xs\)[^}]*font-weight:\s*400/s);
  assert.match(css, /\.jev-scroll-popover-probability\s*\{[^}]*color:\s*var\(--color-crimson\)[^}]*font-weight:\s*700/s);
  assert.match(css, /\.jev-scroll-popover\[data-open\]\s*\{[^}]*opacity:\s*1[^}]*scale:\s*1/s);
  assert.doesNotMatch(css, /\.jev-scroll-name|\.jev-scroll-probability-detail|\.jev-scroll-probability-positioner|\.jev-scroll-metadata/);
  assert.doesNotMatch(css, /transition:[^;]*transform/);
  assert.match(css, /\.jev-scroll-item:not\(\[data-settled\]\)\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /prefers-reduced-motion[\s\S]*\.jev-scroll-popover[\s\S]*transition:\s*none/s);
  assert.match(css, /\.jev-scroll-emoji\s*\{[^}]*font-size:\s*var\(--jev-sorter-visual-max\)/s);
  assert.match(css, /\.jev-scroll-moving\s*\{/);
  assert.match(css, /\.jev-scroll-moving\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /grid-template-columns:\s*repeat\(var\(--bucket-items\),/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.jev-scroll-targets,\s*\.jev \.jev-scroll-targets\[data-item-count='3'\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?--jev-sorter-source-item-max:\s*80px[\s\S]*?--jev-sorter-source-visual-max:\s*80px[\s\S]*?--jev-sorter-item-max:\s*60px[\s\S]*?--jev-sorter-visual-max:\s*60px/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /prefers-reduced-motion[\s\S]*height:\s*auto/);
  assert.match(css, /prefers-reduced-motion[\s\S]*position:\s*relative/);
});

test('the Jev note mounts only the sandwich sorter and drops the spectrum pseudocode', async () => {
  const article = await fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8');

  assert.match(article, /import SandwichSorter from/);
  assert.doesNotMatch(article, /import FlavourSorter from/);
  assert.match(article, /Quick decisions, gut feelings, and first impressions\.[\s\S]*\n<SandwichSorter \/>/);
  assert.doesNotMatch(article, /<FlavourSorter \/>/);
  assert.doesNotMatch(article, /\[interactive:|safe to unsafe|beach ball/);
});

test('sandwich sorter is backed only by saved authored probabilities', async () => {
  const source = await fs.readFile('src/components/unique/jev/SandwichSorter.astro', 'utf8');
  assert.match(source, /probabilities:\s*\{\s*no:/);
  assert.doesNotMatch(source, /fetch\s*\(|api\/jev|TYPESAFE_API_KEY|evaluate\s*\(/);
});
