import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60 * 1000;
const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;

/** The hashed bundle this page is running, e.g. "/assets/index-VT_o-hvF.js" (null in dev). */
function runningBundle(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const m = BUNDLE_RE.exec(s.getAttribute('src') ?? '');
    if (m) return m[0];
  }
  return null;
}

/** The bundle the server is handing out right now, read from a fresh copy of the page. */
async function latestBundle(): Promise<string | null> {
  const res = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
  if (!res.ok) return null;
  return BUNDLE_RE.exec(await res.text())?.[0] ?? null;
}

/**
 * "A new version is available" bar. A page left open (or an installed app window) keeps
 * running the code it loaded; this notices a newer deploy and offers a one-tap reload.
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const running = runningBundle();
    if (!running) return; // dev server: nothing to compare

    let stopped = false;
    const check = async () => {
      try {
        const latest = await latestBundle();
        if (!stopped && latest && latest !== running) setAvailable(true);
      } catch {
        /* offline or flaky signal: try again later */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && check();

    const first = setTimeout(check, 3000);
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  async function update() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  }

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of GlowLab is available.</span>
      <button type="button" onClick={update}>
        Update
      </button>
    </div>
  );
}
