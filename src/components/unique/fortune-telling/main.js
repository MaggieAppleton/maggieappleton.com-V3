import Reveal from 'reveal.js';
import { connectScrollReader } from './scroll-reader.js';
import { createMagicMove } from './magic-move.js';
import { expandProgressiveSlides } from './progressive-slides.js';
import { configureManualReveals } from './manual-reveals.js';
import { createLocalVideos } from './local-videos.js';
import 'reveal.js/reveal.css';
import './fonts.css';
import './deck.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const magicMove = createMagicMove();

expandProgressiveSlides();
configureManualReveals();
const localVideos = createLocalVideos();
const deck = new Reveal({
  width: 1280,
  height: 720,
  margin: 0,
  center: false,
  view: 'slide',
  scrollActivationWidth: 0,
  transition: reducedMotion.matches ? 'none' : 'fade',
  transitionSpeed: 'fast',
  autoAnimate: !reducedMotion.matches,
  autoAnimateDuration: 0.45,
  autoAnimateEasing: 'ease-in-out',
  autoAnimateUnmatched: true,
  plugins: [magicMove, localVideos],
  hash: false, embedded: true, keyboard: false, touch: false, overview: false, help: false, pause: false, mouseWheel: false,
  controls: false,
  progress: false,
  slideNumber: false,
});
deck.initialize().then(() => connectScrollReader(deck));

window.deck = deck;

reducedMotion.addEventListener('change', ({ matches }) => {
  magicMove.clear();
  deck.configure({
    autoAnimate: !matches,
    transition: matches ? 'none' : 'fade',
  });
});
