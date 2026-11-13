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
      const ambient = document.getElementById('play');
      if (ambient && ambient.getAttribute('aria-pressed') === 'true') ambient.click();
    });
  });
})();
