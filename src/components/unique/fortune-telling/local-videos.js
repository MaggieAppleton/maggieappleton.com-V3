import media from '../../../data/talks/fortune-telling.json';
import { createVideoPlayback } from '../../../scripts/talk-video-controls.js';

// Load only the visible slide's clip, retaining native streaming and seeking.
export function createLocalVideos(root = document.querySelector('.reveal .slides')) {
  const videos = [...(root?.querySelectorAll('video.slide-video') || [])];
  const players = new Map(videos.map(video => [video, createVideoPlayback(video)]));
  for (const video of videos) {
    for (const source of video.querySelectorAll('source[src]')) {
      source.dataset.localSrc = source.getAttribute('src');
      const entry = media.find(item => typeof item !== 'string' && item.src === source.dataset.localSrc);
      if (entry?.background) {
        video.style.backgroundColor = entry.background;
        video.parentElement.style.backgroundColor = entry.background;
        video.closest('section').style.backgroundColor = entry.background;
      }
      video.poster ||= source.dataset.localSrc.replace(/\.mp4$/i, '-poster.jpg');
      source.removeAttribute('src');
    }
    video.preload = 'none';
    video.load();
  }

  let deck;
  let active;
  let enabled = true;
  const clear = () => {
    if (!active) return;
    const { video, ready, error } = active;
    active = undefined;
    video.removeEventListener('loadeddata', ready);
    video.removeEventListener('error', error);
    players.get(video).deactivate();
    video.removeAttribute('src');
    video.load();
    delete video.dataset.videoState;
  };
  const update = () => {
    if (!enabled) return;
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
    players.get(video).activate();
  };

  return {
    id: 'local-videos',
    suspend() { enabled = false; clear(); },
    resume() { enabled = true; update(); },
    init(instance) {
      deck = instance;
      deck.on('ready', update);
      deck.on('slidechanged', update);
    },
    destroy() {
      clear();
      players.forEach(player => player.destroy());
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
