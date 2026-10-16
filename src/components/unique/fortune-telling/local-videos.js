// Load only the visible slide's video. Native MP4 playback supports streaming
// and byte-range requests without downloading the entire clip into a Blob.
export function createLocalVideos(root = document.querySelector('.reveal .slides')) {
  const videos = [...(root?.querySelectorAll('video.slide-video') || [])];
  for (const video of videos) {
    for (const source of video.querySelectorAll('source[src]')) {
      source.dataset.localSrc = source.getAttribute('src');
      source.removeAttribute('src');
    }
    video.preload = 'none';
    video.load();
  }

  let deck;
  let active;
  const clear = () => {
    if (!active) return;
    const { video, ready, error } = active;
    active = undefined;
    video.removeEventListener('loadeddata', ready);
    video.removeEventListener('error', error);
    video.pause();
    video.removeAttribute('src');
    video.load();
    delete video.dataset.videoState;
  };
  const update = () => {
    const video = deck.getCurrentSlide()?.querySelector('video.slide-video');
    if (active?.video === video) return;
    clear();
    if (!video) return;
    const source = [...video.querySelectorAll('source[data-local-src]')]
      .find(source => video.canPlayType(source.type));
    const ready = () => { if (active?.video === video) video.dataset.videoState = 'ready'; };
    const error = () => { if (active?.video === video) video.dataset.videoState = 'error'; };
    active = { video, ready, error };
    if (!source) { error(); return; }
    video.dataset.videoState = 'loading';
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', error, { once: true });
    video.src = source.dataset.localSrc;
    video.load();
    if (video.hasAttribute('data-autoplay')) {
      video.muted = video.hasAttribute('muted');
      video.play().catch(() => { /* Native controls allow playback if autoplay is blocked. */ });
    }
  };

  return {
    id: 'local-videos',
    init(instance) {
      deck = instance;
      deck.on('ready', update);
      deck.on('slidechanged', update);
    },
    destroy() {
      clear();
      deck.off('ready', update);
      deck.off('slidechanged', update);
      for (const video of videos) {
        for (const source of video.querySelectorAll('source[data-local-src]')) {
          source.src = source.dataset.localSrc;
          delete source.dataset.localSrc;
        }
      }
    },
  };
}
