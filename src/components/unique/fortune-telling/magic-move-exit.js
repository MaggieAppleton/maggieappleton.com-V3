function overlappingImageSiblings(element) {
  if (!element.matches('img')) return [];
  const siblings = [...element.parentElement.children].filter(child => child.matches('img'));
  const boxes = new Map(siblings.map(image => [image, image.getBoundingClientRect()]));
  return siblings.filter(image => siblings.some(other => {
    if (other === image) return false;
    const a = boxes.get(image), b = boxes.get(other);
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }));
}

export function createExitFade(deck, duration = 320) {
  let layer;
  let animation;
  let timer;
  let shared = [];
  let stacked = [];

  function clear() {
    clearTimeout(timer);
    animation?.cancel();
    layer?.remove();
    for (const element of shared) element.classList.remove('magic-move-shared');
    for (const element of stacked) element.classList.remove('magic-move-stack-image');
    layer = animation = undefined;
    shared = [];
    stacked = [];
  }

  function play(fromSlide, pairs) {
    clear();
    const copy = document.createElement('div');
    copy.className = 'magic-move-exit';
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    for (const child of fromSlide.childNodes) copy.append(child.cloneNode(true));

    // Shared cards are normally lifted above the exit copy. Lift their incoming
    // image siblings equally, so a newly added card keeps its authored DOM order.
    stacked = [...new Set(pairs.flatMap(pair => overlappingImageSiblings(pair.to)))];
    for (const image of stacked) image.classList.add('magic-move-stack-image');
    const sourceStack = new Set(pairs.flatMap(pair => overlappingImageSiblings(pair.from)));
    if ([...sourceStack].some(image => !pairs.some(pair => pair.from === image))) {
      // Going backwards, the removed top card must fade above the retained stack.
      copy.classList.add('magic-move-stack-exit');
    }

    const originals = [...fromSlide.querySelectorAll('*')];
    const clones = [...copy.querySelectorAll('*')];
    originals.forEach((element, index) => {
      if (!element.matches('.title-stagger-line,.title-stagger-item,.fragment')) return;
      const style = getComputedStyle(element);
      clones[index].style.opacity = style.opacity;
      clones[index].style.transform = style.transform;
      if (element.matches('.fragment')) {
        // The exit is only a visual snapshot. Native fragment classes would
        // otherwise add phantom next/previous steps to the incoming slide.
        clones[index].style.visibility = style.visibility;
        clones[index].classList.remove('fragment', 'current-fragment');
        clones[index].removeAttribute('data-fragment-index');
      }
    });
    for (const pair of pairs) {
      const clone = clones[originals.indexOf(pair.from)];
      if (clone) {
        clone.style.visibility = 'hidden';
        // The old canvas/card must not cover a shared element on the new slide.
        for (let parent = clone.parentElement; parent && parent !== copy; parent = parent.parentElement) {
          parent.style.background = 'transparent';
          parent.style.boxShadow = 'none';
        }
      }
      pair.to.classList.add('magic-move-shared');
      const style = getComputedStyle(pair.to);
      if (pair.options.scale === false && style.display === 'inline') {
        // Inline boxes cannot transform without changing their line wrapping.
        // Relative offsets move the run visually while preserving its flow.
        const source = pair.from.getBoundingClientRect();
        const target = pair.to.getBoundingClientRect();
        const scale = deck.getScale();
        pair.options.translate = false;
        pair.options.styles = [...deck.getConfig().autoAnimateStyles,
          ...['left', 'top'].map((property, index) => {
            const coordinate = index === 0 ? 'x' : 'y';
            const baseline = parseFloat(style[property]) || 0;
            return { property, from: `${baseline + (source[coordinate] - target[coordinate]) / scale}px`, to: `${baseline}px` };
          }),
        ];
      }
      shared.push(pair.to);
    }

    for (const root of copy.children) root.style.background = 'transparent';
    copy.querySelectorAll('aside.notes,script,iframe,video,audio,.magic-move-background-exit').forEach(element => element.remove());
    copy.querySelectorAll('[id],[data-auto-animate-target]').forEach(element => {
      element.removeAttribute('id');
      element.removeAttribute('data-auto-animate-target');
    });

    // Keep the copy above the new canvas but below its shared elements.
    // Mark it as handled so Reveal does not treat it as incoming content.
    copy.setAttribute('data-auto-animate-target', 'magic-move-exit');
    deck.getCurrentSlide().append(copy);
    layer = copy;
    animation = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration, easing: 'ease-in-out', fill: 'forwards',
    });
    animation.finished.then(() => copy.remove(), () => copy.remove());
    timer = setTimeout(clear, Math.max(duration, deck.getConfig().autoAnimateDuration * 1000) + 100);
  }

  return { play, clear };
}
