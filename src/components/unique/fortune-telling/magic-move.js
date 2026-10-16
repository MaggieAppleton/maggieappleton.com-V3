import { matchSharedElements } from './magic-move-match.js';
import { createExitFade } from './magic-move-exit.js';
import { createBackgroundFade } from './magic-move-background.js';
import { createTitleStagger } from './title-stagger.js';
import './magic-move.css';

export function createMagicMove() {
  let deck;
  let exit;
  let background;
  let titles;
  const originalGroups = new Map();
  const cleanupEvents = ['slidechanged', 'overviewshown', 'paused'];
  const clear = event => {
    exit?.clear(); background?.clear();
    if (event?.type !== 'slidechanged' || !deck.getConfig().autoAnimate) titles?.clear();
  };
  const ready = () => titles.play(deck.getCurrentSlide());

  return {
    id: 'magic-move',
    clear,
    init(instance) {
      deck = instance;
      exit = createExitFade(deck);
      background = createBackgroundFade(deck);
      const params = new URLSearchParams(window.location.search);
      const isPreview = params.has('receiver') || params.has('print-pdf');
      titles = createTitleStagger(deck, !isPreview);

      for (const slide of deck.getSlides()) {
        originalGroups.set(slide, [slide.getAttribute('data-auto-animate'), slide.getAttribute('data-auto-animate-id')]);
        slide.setAttribute('data-auto-animate', '');
        slide.setAttribute('data-auto-animate-id', 'magic-move');
      }
      deck.configure({
        autoAnimateMatcher(from, to) {
          const pairs = matchSharedElements(from, to);
          if (!isPreview) {
            exit.play(from, pairs);
            background.play(from, to);
          }
          titles.play(to, pairs);
          return pairs;
        },
      });
      for (const event of cleanupEvents) deck.on(event, clear);
      deck.on('ready', ready);
    },
    destroy() {
      clear();
      background.destroy();
      titles.destroy();
      deck.off('ready', ready);
      for (const event of cleanupEvents) deck.off(event, clear);
      for (const [slide, values] of originalGroups) {
        ['data-auto-animate', 'data-auto-animate-id'].forEach((name, index) => {
          if (values[index] === null) slide.removeAttribute(name);
          else slide.setAttribute(name, values[index]);
        });
      }
      originalGroups.clear();
    },
  };
}
