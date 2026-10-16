// The normal talk layout owns scrolling; the frame owns slide rendering only.
export function setupRevealTalk(section) {
  if (section.dataset.revealInitialized) return;
  section.dataset.revealInitialized = 'true';
  const frame = section.querySelector('.reveal-frame');
  const steps = [...section.querySelectorAll('[data-slide]')];
  const desktop = matchMedia('(min-width: 1201px)');
  let active = -1;
  let pending = 0;
  let ready = false;
  const send = () => {
    if (ready && active >= 0) frame.contentWindow?.postMessage({ type: 'talk:go', index: Number(steps[active].dataset.slide) }, location.origin);
  };
  const update = () => {
    pending = 0;
    if (!desktop.matches || !steps.length) return;
    let next = 0;
    steps.forEach((step, index) => {
      if (step.getBoundingClientRect().top <= innerHeight * 0.5) next = index;
    });
    if (next === active) return;
    active = next;
    section.toggleAttribute('data-first-slide', next === 0);
    send();
  };
  const schedule = () => { if (!pending) pending = requestAnimationFrame(update); };
  const message = event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'talk:ready') return;
    ready = true;
    update();
    send();
  };
  window.addEventListener('message', message);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  frame.contentWindow?.postMessage({ type: 'talk:connect' }, location.origin);
  update();
  document.addEventListener('astro:before-swap', () => {
    window.removeEventListener('message', message);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(pending);
    delete section.dataset.revealInitialized;
  }, { once: true });
}
