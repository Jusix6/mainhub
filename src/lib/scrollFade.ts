/**
 * Rows of chips that scroll sideways on a phone fade out at the edge where
 * there is more to see (data-fade = start | end | both | none, styled in
 * global.css). Without it the last chip is simply cut off and nobody swipes.
 */
export function scrollFade(el: HTMLElement) {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft < max - 4;
    el.dataset.fade = max <= 4 ? 'none' : start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
  };
  if (!el.dataset.fadeReady) {
    el.dataset.fadeReady = '1';
    el.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(el);
  }
  update();
}
