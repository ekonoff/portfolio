/* Audio previews appear only after their files exist on GitHub Pages.
   This lets the portfolio remain functional while media is being added. */
(() => {
  const wrappers = document.querySelectorAll('.project-audio-wrap[data-src]');
  wrappers.forEach(async (wrap) => {
    const audio = wrap.querySelector('audio');
    if (!audio) return;
    try {
      const response = await fetch(wrap.dataset.src, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) return;
      audio.hidden = false;
      const pending = wrap.querySelector('.media-pending');
      if (pending) pending.remove();
    } catch (_) {
      /* Leave the upload placeholder visible if the media is not available. */
    }
  });
  wrappers.forEach((wrap) => {
    const audio = wrap.querySelector('audio');
    if (!audio) return;
    audio.addEventListener('play', () => {
      wrappers.forEach(other => {
        const otherAudio = other.querySelector('audio');
        if (otherAudio && otherAudio !== audio) otherAudio.pause();
      });
    });
  });
})();

/* Show the featured sound redesign only when the video upload is available. */
(() => {
  const feature = document.getElementById('regular-show-project');
  const video = document.getElementById('regular-show-player');
  if (!feature || !video) return;
  const showFeature = () => {
    if (!feature.hidden) return;
    feature.hidden = false;
    const heading = document.querySelector('.projects-heading .kicker');
    if (heading) heading.textContent = '02 — 04 / Listen now';
    document.querySelectorAll('.project-index').forEach((index, i) => {
      index.textContent = String(i + 2).padStart(2, '0');
    });
  };
  video.addEventListener('loadedmetadata', showFeature);
  if (video.readyState >= 1) showFeature();
  const audios = document.querySelectorAll('.project-audio');
  video.addEventListener('play', () => audios.forEach(audio => audio.pause()));
  audios.forEach(audio => audio.addEventListener('play', () => video.pause()));
})();
