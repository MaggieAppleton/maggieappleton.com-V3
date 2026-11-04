import { createVideoPlayback } from './talk-video-controls.js';

export function setupMobileTalkVideos(section) {
  const videos = [...section.querySelectorAll('.mobile-image video')];
  const mobile = matchMedia('(max-width: 1200px)');
  const players = new Map(videos.map(video => [video, createVideoPlayback(video)]));
  const visible = new Set();
  const update = () => {
    for (const [video, player] of players) {
      if (mobile.matches && visible.has(video)) player.activate();
      else player.deactivate();
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    update();
  }, { threshold: [0, 0.5] });
  videos.forEach(video => observer.observe(video));
  mobile.addEventListener('change', update);
  return () => {
    observer.disconnect();
    mobile.removeEventListener('change', update);
    players.forEach(player => player.destroy());
  };
}
