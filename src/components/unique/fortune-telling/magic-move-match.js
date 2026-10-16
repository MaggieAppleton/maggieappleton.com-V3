const textTags = 'h1,h2,h3,h4,h5,h6,p,li,span,font,div,strong,em,small';
const blockChildren = 'h1,h2,h3,h4,h5,h6,p,li,div,ul,ol,table,svg,img,video,iframe';
const mediaTags = 'svg,img,video,iframe';
const normalize = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
const measure = element => element.getBoundingClientRect();

function changesTextLayout(from, to) {
  if (!/\s/.test(from.textContent.trim())) return false;
  const a = getComputedStyle(from), b = getComputedStyle(to);
  // FLIP can move a stable text box, but interpolating type across different
  // alignments and widths makes its words jump between destination line wraps.
  return a.textAlign !== b.textAlign && (a.fontSize !== b.fontSize ||
    Math.abs(from.getBoundingClientRect().width - to.getBoundingClientRect().width) > 1);
}

function graphicKey(element) {
  if (element.matches('svg')) {
    // Compare vector geometry, allowing size, colour, and placement to change.
    const geometry = [...element.querySelectorAll('path,circle,ellipse,rect,line,polyline,polygon,use,text')]
      .map(node => [node.tagName, ...[...node.attributes]
        .filter(attr => !/^(style|fill|stroke|id|class|data-)/.test(attr.name))
        .map(attr => `${attr.name}=${attr.value}`).sort(), normalize(node.textContent)].join('|'))
      .join(';');
    return geometry ? `svg:${element.getAttribute('viewBox')}:${geometry}` : null;
  }
  const source = element.getAttribute('src') || element.getAttribute('data-src');
  return source ? `${element.tagName}:${source}` : null;
}

function candidates(slide) {
  const items = [...slide.querySelectorAll(`${textTags},${mediaTags},[data-id]`)].flatMap(element => {
    if (element.closest('aside.notes,.magic-move-exit,.magic-move-background-exit,[data-progressive-hidden]')) return [];
    // Reveal marks the outgoing section hidden before asking us to match it.
    const hidden = element.closest('[hidden]');
    if (hidden && hidden !== slide && slide.contains(hidden)) return [];
    const identity = element.getAttribute('data-id');
    const graphic = element.matches(mediaTags);
    const text = normalize(element.textContent);
    if (!identity && !graphic && (!text || element.querySelector(blockChildren))) return [];

    const key = identity ? `id:${identity}` : graphic ? graphicKey(element) : `text:${text}`;
    if (!key) return [];
    const box = element.getBoundingClientRect();
    return [{ element, key, graphic, priority: identity ? 0 : graphic ? 1 : 2,
      x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  });

  // A heading containing an identical span is one visual element, not two.
  return items.filter(item => !items.some(parent => parent !== item &&
    parent.key === item.key && parent.element.contains(item.element)));
}

export function matchSharedElements(fromSlide, toSlide) {
  const from = candidates(fromSlide);
  const to = candidates(toSlide);
  const possible = from.flatMap(a => to.filter(b => a.key === b.key &&
    (!a.key.startsWith('text:') || !changesTextLayout(a.element, b.element))).map(b => ({
    a, b, distance: (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
  })));
  possible.sort((a, b) => a.a.priority - b.a.priority || a.distance - b.distance);

  const pairs = [];
  for (const { a, b } of possible) {
    const overlaps = pairs.some(pair =>
      pair.from.contains(a.element) || a.element.contains(pair.from) ||
      pair.to.contains(b.element) || b.element.contains(pair.to));
    if (overlaps) continue;
    pairs.push({ from: a.element, to: b.element,
      options: { scale: a.graphic && b.graphic, measure } });
  }
  return pairs;
}
