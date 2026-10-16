import { collectStaggerElements } from './stagger-elements.js';

const staticIntroSources = new Set(['html/47-weak-signals-copy-9.html']);
const punchlineSource = 'html/35-the-politics-copy.html';
const introEnabled = slide => slide.dataset.slideIntro !== 'none' && !staticIntroSources.has(slide.dataset.sourceSlide);

export function createTitleStagger(deck, enabled = true) {
  const slides = new Map();
  let animations = [];

  function register(slide, items, markers = items) {
    const addedItems = items.filter(el => !el.classList.contains('title-stagger-item'));
    for (const item of addedItems) item.classList.add('title-stagger-item');
    const intro = introEnabled(slide);
    const punchline = slide.dataset.sourceSlide === punchlineSource && items.find(item =>
      item.textContent.trim() === 'A whole different talk' && item.style.transform.includes('rotate('));
    const addedPunchline = punchline && !punchline.classList.contains('title-stagger-punchline');
    if (addedPunchline) punchline.classList.add('title-stagger-punchline');
    slides.set(slide, { markers, items, addedItems, intro, punchline, addedPunchline });
  }

  for (const slide of deck.getSlides()) {
    if (slide.hasAttribute('data-progressive-stage')) continue;
    if (!introEnabled(slide)) {
      const { items, markers } = collectStaggerElements(slide);
      register(slide, items, markers);
      continue;
    }
    const definition = [...slide.querySelectorAll('h3')].find(el => el.textContent.trim() === 'My preferred definition');
    if (definition) {
      const items = [...definition.parentElement.children].filter(el => el.matches('h2,h3'));
      register(slide, items);
      continue;
    }
    const cover = [...slide.querySelectorAll('h1')].find(el =>
      el.textContent.includes('Fortune Telling') && el.textContent.includes('and Speculative Design'));
    if (cover) {
      const root = cover.parentElement.parentElement;
      const items = [...root.querySelectorAll(':scope > div > span, :scope > div > svg, :scope > div > h1, :scope > div > p')];
      const glow = root.querySelector(':scope > div[aria-hidden="true"]');
      // Keep the glow outside Reveal's content fade without animating it.
      register(slide, items, glow ? [...items, glow] : items);
      continue;
    }
    const label = [...slide.querySelectorAll('h6')].find(el => el.textContent.trim() === 'My past titles');
    const heading = label && slide.querySelector('h2');
    if (!heading?.querySelector('br')) {
      const { items, markers } = collectStaggerElements(slide);
      register(slide, items, markers);
      continue;
    }
    const original = [...heading.childNodes];
    const titles = [];
    for (const node of original) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const span = document.createElement('span');
      span.className = 'title-stagger-line';
      node.before(span);
      span.append(node);
      titles.push(span);
    }
    slides.set(slide, { markers: [label, heading], items: titles, heading, original });
  }

  function clear() {
    animations.forEach(animation => animation.cancel());
    animations = [];
  }

  function play(slide, pairs = []) {
    clear();
    const content = slides.get(slide);
    if (!content || !enabled || !deck.getConfig().autoAnimate || deck.isOverview() || deck.isPaused?.()) return;
    // Reveal must not fade a text block while its own entrance runs.
    for (const element of content.markers) {
      element.setAttribute('data-auto-animate-target', 'title-stagger');
    }
    // Static builds are handled too, so Reveal does not add its unmatched fade.
    if (content.intro === false) return;
    const items = content.items.filter(item => !pairs.some(pair => item.contains(pair.to) || pair.to.contains(item)));
    const gap = items.length > 1 ? Math.min(110, 660 / (items.length - 1)) : 0;
    animations = items.map((title, index) => {
      const style = getComputedStyle(title);
      const isPunchline = title === content.punchline;
      const from = { opacity: 0 };
      const to = { opacity: style.opacity };
      // Inline runs fade without changing display or their paragraph wrapping.
      if (!isPunchline && (style.display !== 'inline' || title.matches('svg'))) {
        from.transform = `${style.transform === 'none' ? '' : style.transform} translateY(12px)`;
        to.transform = style.transform;
      }
      return title.animate([from, to], {
        // Let departing text clear, then cap even dense slides at 1.17 seconds.
        duration: isPunchline ? 140 : 260, delay: isPunchline ? 0 : 250 + index * gap,
        easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'both',
      });
    });
  }

  function destroy() {
    clear();
    for (const { markers, heading, original, addedItems = [], punchline, addedPunchline } of slides.values()) {
      if (heading) heading.replaceChildren(...original);
      for (const item of addedItems) item.classList.remove('title-stagger-item');
      if (addedPunchline) punchline.classList.remove('title-stagger-punchline');
      for (const element of markers) {
        if (element.dataset.autoAnimateTarget === 'title-stagger') element.removeAttribute('data-auto-animate-target');
      }
    }
    slides.clear();
  }

  return { play, clear, destroy };
}
