const normalize = text => text.replace(/\s+/g, ' ').trim();
const followingChildren = heading => [...(heading.nextElementSibling?.children || [])];
const followingElement = heading => heading.nextElementSibling ? [heading.nextElementSibling] : [];
const findHeading = (slide, rule) => [...slide.querySelectorAll('h2,p,span')]
  .find(element => normalize(element.textContent) === rule.heading);
const rules = [
  { group: 'design-engineers', heading: 'Design engineers should:',
    points: followingChildren, labels: ['title only', 'point 1', 'points 1–2', 'points 1–3'] },
  { group: 'weird-time', heading: 'We’re in a weird time. Everyone’s got whiplash from the speed of progress.',
    points: followingChildren, labels: ['headline only', 'paragraph 1', 'paragraphs 1–2'] },
  { group: 'scout-mindset', heading: 'Everyone needs a speculative designer scout mindset right now.',
    points: followingElement, labels: ['headline only', 'with explanation'] },
  { group: 'perfect-people', heading: 'Design engineers are the perfect people to figure out the shape of the future.',
    points: followingChildren, labels: ['headline only', 'paragraph 1', 'paragraphs 1–2'] },
];

export function expandProgressiveSlides(slidesElement = document.querySelector('.reveal .slides')) {
  if (!slidesElement) return [];
  return [...slidesElement.children].flatMap(original => {
    if (!original.matches('section:not([data-progressive-stage])')) return [];
    const rule = rules.find(candidate => findHeading(original, candidate));
    const heading = rule && findHeading(original, rule);
    if (!rule || rule.points(heading).length !== rule.labels.length - 1) return [];
    return expandSlide(original, rule);
  });
}

function expandSlide(original, rule) {
  const label = original.getAttribute('aria-label') || rule.heading;
  const slides = rule.labels.map((suffix, stage) => {
    const slide = original.cloneNode(true);
    slide.dataset.progressiveGroup = rule.group;
    slide.dataset.progressiveStage = stage;
    slide.setAttribute('aria-label', `${label} · ${suffix}`);
    // This source has no authored IDs; defensive removal avoids duplicate IDs
    // if a later export includes them in one of the added states.
    if (stage > 0) {
      slide.removeAttribute('id');
      slide.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    }
    const copiedHeading = findHeading(slide, rule);
    rule.points(copiedHeading).forEach((row, index) => {
      if (index < stage) return;
      row.dataset.progressiveHidden = '';
      row.style.visibility = 'hidden';
      row.setAttribute('aria-hidden', 'true');
      row.inert = true;
    });
    return slide;
  });
  original.replaceWith(...slides);
  return slides;
}
