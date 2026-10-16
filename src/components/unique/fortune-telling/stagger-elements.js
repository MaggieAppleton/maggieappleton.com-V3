const textBlocks = 'h1,h2,h3,h4,h5,h6,p,li';
const media = 'svg,img,video,iframe';
const blockChildren = `${textBlocks},div,ul,ol,table,${media}`;
const excluded = 'aside.notes,script,style,.fragment,[data-progressive-hidden],.magic-move-exit,.magic-move-background-exit';
const numbered = element => element?.matches('span') && /^\d+$/.test(element.textContent.trim()) && element.style.borderRadius === '50%';

export function collectStaggerElements(slide) {
  if (slide.hasAttribute('data-progressive-stage')) return { items: [], markers: [] };
  const canvas = slide.querySelector(':scope > div');
  const elements = [...slide.querySelectorAll('*')].filter(element => {
    if (element.closest(excluded)) return false;
    const hidden = element.closest('[hidden]');
    if (hidden && hidden !== slide) return false;
    for (let node = element; node && node !== slide; node = node.parentElement) {
      if (node.style.display === 'none' || node.style.visibility === 'hidden') return false;
    }
    return true;
  });
  const groups = elements.filter(element => element !== canvas && element.matches('div') &&
    (numbered(element.firstElementChild) ||
      (element.children.length > 1 && numbered(element.firstElementChild?.firstElementChild) &&
        [...element.children].filter(child => numbered(child.firstElementChild)).length === 1)));
  const candidates = elements.filter(element => {
    if (element === canvas) return false;
    if (element.closest('[aria-hidden="true"]')) return false;
    const svg = element.closest('svg');
    if (svg && svg !== element) return false;
    if (groups.includes(element) || element.matches(media)) return true;
    if (!element.textContent.trim()) return false;
    if (element.matches(textBlocks)) return true;
    return element.matches('div,span,font,strong,em,i,small') && !element.querySelector(blockChildren);
  });
  // A numbered row/card or styled paragraph enters as one coherent unit.
  const items = candidates.filter(element => !candidates.some(parent => parent !== element && parent.contains(element)));
  const decoration = elements.filter(element =>
    (element.getAttribute('aria-hidden') === 'true' || (element.matches('div') && element.style.background)) &&
    !items.some(item => item === element || item.contains(element)));
  return { items, markers: [...items, ...decoration] };
}
