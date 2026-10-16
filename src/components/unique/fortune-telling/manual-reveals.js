const rules = [
  { source: 'html/22-two-things-today.html', left: 'How GitHub Next does speculative design', right: 'Practical tools to do this yourself' },
  { source: 'html/55-play-flip-it-split-it.html', left: 'Invert it', right: 'Split it' },
  { source: 'html/56-play-ask-why-exaggerate.html', left: 'Maximise and minimise', right: 'Brutethink' },
];

export function configureManualReveals(slidesElement = document.querySelector('.reveal .slides')) {
  const columns = rules.flatMap(rule => {
    const slide = slidesElement?.querySelector(`[data-source-slide="${rule.source}"]`);
    const headings = [...(slide?.querySelectorAll('span') || [])];
    const left = headings.find(element => element.textContent.trim() === rule.left);
    const heading = headings.find(element => element.textContent.trim() === rule.right);
    if (!left || !heading) return [];
    let right = heading?.parentElement;
    // Find the full column whose sibling contains the left heading. This works
    // for the exported flex and grid layouts without touching their markup.
    while (right && right !== slide && !(right.parentElement.children.length === 2 &&
      [...right.parentElement.children].some(sibling => sibling !== right && sibling.contains(left)))) {
      right = right.parentElement;
    }
    if (!right || right === slide) return [];

    // One native fragment preserves space and lets Reveal handle navigation.
    markFragment(slide, right, 0);
    return [right];
  });
  return [...columns, ...configureArtefactReveals(slidesElement), ...configureTheoryReveals(slidesElement)];
}

function markFragment(slide, element, index) {
  slide.dataset.manualReveal = '';
  element.classList.add('fragment', 'fade-up');
  element.dataset.fragmentIndex = index;
}

function configureArtefactReveals(slidesElement) {
  const slide = slidesElement?.querySelector('[data-source-slide="html/62-play-with-your-ideas-copy-5.html"]');
  const heading = [...(slide?.querySelectorAll('h2') || [])].find(element =>
    element.textContent.replace(/\s+/g, ' ').trim() === 'What artefact would make this future evocative?');
  const items = [...(heading?.parentElement.children || [])];
  if (items.length !== 4 || items[0] !== heading || !items.slice(1).every(element => element.matches('p'))) return [];
  // Keep the section label automatic; reveal the question and each paragraph
  // independently in their authored order without changing their geometry.
  items.forEach((element, index) => markFragment(slide, element, index));
  return items;
}

function configureTheoryReveals(slidesElement) {
  const slide = slidesElement?.querySelector('[data-source-slide="html/66-play-with-your-ideas-copy-9.html"]');
  const firstNumber = [...(slide?.querySelectorAll('span') || [])].find(element => element.textContent.trim() === '01');
  const items = [...(firstNumber?.parentElement.parentElement.children || [])];
  if (items.length !== 3 || !items.every((element, index) =>
    element.firstElementChild?.textContent.trim() === `0${index + 1}` && element.querySelector(':scope > p'))) return [];
  items.forEach((element, index) => markFragment(slide, element, index));
  return items;
}
