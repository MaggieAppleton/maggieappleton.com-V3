// Runs inside the isolated deck, after Reveal and its animation plugins are ready.
export function connectScrollReader(deck) {
  const states = deck.getSlides().flatMap((slide, h) => {
    const base = {
      h, v: 0, f: -1,
      source: slide.dataset.sourceSlide,
      title: slide.getAttribute('aria-label'),
      stage: slide.dataset.progressiveStage,
    };
    const fragments = [...new Set([...slide.querySelectorAll('.fragment')]
      .map(fragment => Number(fragment.dataset.fragmentIndex)))].sort((a, b) => a - b);
    return [base, ...fragments.map(f => ({ ...base, f, title: `${base.title} · reveal ${f + 1}` }))];
  });
  const send = () => parent.postMessage({ type: 'talk:ready', states }, location.origin);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'talk:connect') send();
    if (event.data?.type !== 'talk:go' || !Number.isInteger(event.data.index)) return;
    const state = states[event.data.index];
    if (state) deck.slide(state.h, state.v, state.f);
  });
  send();
}
