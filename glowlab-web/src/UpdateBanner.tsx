import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 60 * 1000;
const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;
const SEEN_KEY = 'glowlab.bundle';
const SNOOZE_MS = 10 * 60 * 1000;
/** After 'Later', don't pop up again until this time. */
let snoozedUntil = 0;

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
  const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'text/html' } });
  if (!res.ok) return null;
  return BUNDLE_RE.exec(await res.text())?.[0] ?? null;
}

function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

/**
 * Update pop-up. A page left open (or a home-screen app) keeps running the code it loaded;
 * this notices a newer deploy and pops up a one-tap "Update now". After an update (or when
 * the phone reloaded the app on its own) it briefly says the app was updated.
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    const running = runningBundle();
    if (!running) return; // dev server: nothing to compare

    // Opened on a newer version than last time: say so for a moment.
    const seen = read(SEEN_KEY);
    write(SEEN_KEY, running);
    let hideUpdated: ReturnType<typeof setTimeout> | undefined;
    if (seen && seen !== running) {
      setUpdated(true);
      hideUpdated = setTimeout(() => setUpdated(false), 4000);
    }

    let stopped = false;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const latest = await latestBundle();
        if (!stopped && latest && latest !== running && Date.now() >= snoozedUntil) setAvailable(true);
      } catch {
        /* offline or flaky signal: try again later */
      } finally {
        checking = false;
      }
    };
    const onWake = () => { void check(); };

    const first = setTimeout(onWake, 1500);
    const timer = setInterval(onWake, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    window.addEventListener('online', onWake);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearTimeout(hideUpdated);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      window.removeEventListener('online', onWake);
    };
  }, []);

  const [reloading, setReloading] = useState(false);
  function update() {
    setReloading(true);
    window.location.reload();
  }

  if (available) {
    return (
      <div className="update-overlay" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-card">
          <img src="/icon-192.png" alt="" className="update-mark" />
          <h3 id="update-title">Update available</h3>
          <p>A new version of GlowLab is ready. Save anything you're working on, then update.</p>
          <button type="button" className="primary big" onClick={update} disabled={reloading}>{reloading ? 'Updating…' : 'Update now'}</button>
          <button type="button" className="link" onClick={() => { snoozedUntil = Date.now() + SNOOZE_MS; setAvailable(false); }}>Later</button>
        </div>
      </div>
    );
  }
  if (updated) return <div className="update-toast" role="status">✓ GlowLab updated to the latest version</div>;
  return null;
}
