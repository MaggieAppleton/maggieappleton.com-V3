import test from 'node:test';
import assert from 'node:assert/strict';
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
