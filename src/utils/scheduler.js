export function debounce(fn, wait = 120) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

export function throttle(fn, wait = 120) {
  let lastRun = 0;
  let trailingId;
  return (...args) => {
    const now = Date.now();
    const elapsed = now - lastRun;
    window.clearTimeout(trailingId);
    if (elapsed >= wait) {
      lastRun = now;
      fn(...args);
      return;
    }
    trailingId = window.setTimeout(() => {
      lastRun = Date.now();
      fn(...args);
    }, wait - elapsed);
  };
}

export function idle(fn) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(fn, { timeout: 800 });
    return;
  }
  window.setTimeout(fn, 120);
}
