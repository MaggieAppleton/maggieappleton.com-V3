import './talk-video-controls.css';

// Native controls own play/pause, seeking, volume and fullscreen. These actions
// add the two transport controls browsers do not consistently provide.
export function createVideoPlayback(video) {
  let active = false;
  let userPaused = false;
  let controllerPause = false;
  const parent = video.parentElement;
  parent.classList.add('talk-video-container');
  const actions = document.createElement('div');
  actions.className = 'talk-video-actions';
  const play = () => video.play().catch(() => {});
  const onPlay = () => { userPaused = false; };
  const onPause = () => {
    if (active && !controllerPause) userPaused = true;
    controllerPause = false;
  };
  const restart = () => {
    userPaused = false;
    video.currentTime = 0;
    play();
  };
  const stop = () => {
    userPaused = true;
    video.pause();
    video.currentTime = 0;
  };
  for (const [label, action] of [['Restart', restart], ['Stop', stop]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', `${label} video`);
    button.addEventListener('click', action);
    actions.append(button);
  }
  parent.append(actions);
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  return {
    activate() {
      if (active) return;
      active = true;
      if (!userPaused) play();
    },
    deactivate() {
      active = false;
      if (!video.paused) {
        controllerPause = true;
        video.pause();
      }
    },
    destroy() {
      this.deactivate();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      actions.remove();
      parent.classList.remove('talk-video-container');
    },
  };
}
