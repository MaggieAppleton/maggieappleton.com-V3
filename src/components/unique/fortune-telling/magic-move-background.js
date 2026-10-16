// Keep the exported canvas background outside Reveal's content fade.
export function createBackgroundFade(deck, duration = 320) {
  const originals = new Map();
  let layer;
  let animation;

  for (const slide of deck.getSlides()) {
    const root = slide.querySelector(':scope > div');
    if (!root?.style.background || parseFloat(root.style.width) !== deck.getConfig().width ||
        parseFloat(root.style.height) !== deck.getConfig().height) continue;
    originals.set(slide, { root, canvas: root.style.background, slide: slide.style.background });
    slide.style.background = root.style.background;
    root.style.background = 'transparent';
  }

  function clear() {
    animation?.cancel();
    layer?.remove();
    layer = animation = undefined;
  }

  function play(from, to) {
    clear();
    const previous = getComputedStyle(from).background;
    if (previous === getComputedStyle(to).background) return;
    const copy = document.createElement('div');
    copy.className = 'magic-move-background-exit';
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('data-auto-animate-target', 'magic-move-background');
    copy.style.background = previous;
    to.append(copy);
    layer = copy;
    animation = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration, easing: 'ease-in-out', fill: 'forwards',
    });
    animation.finished.then(() => copy.remove(), () => copy.remove());
  }

  function destroy() {
    clear();
    for (const [slide, original] of originals) {
      original.root.style.background = original.canvas;
      slide.style.background = original.slide;
    }
    originals.clear();
  }

  return { play, clear, destroy };
}
