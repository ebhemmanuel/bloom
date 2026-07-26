import { useEffect, useState } from 'react';
import { appBridge, isDesktop } from './lib/bridge.js';

/**
 * Phase 0 shell. This exists to prove the packaging path end to end — that the
 * renderer loads over file://, the preload bridge is attached, and the CSP has not
 * broken anything — before any feature code depends on it.
 *
 * Replaced by AppShell + Board in Phase 2.
 */
export default function App() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    appBridge.getInfo().then(setInfo);
  }, []);

  return (
    <main className="acc-boot">
      <h1 className="acc-display">Accommodations Tracker</h1>
      <p className="acc-body-muted">
        Offline daily accommodation tracking. Data stays on this machine.
      </p>
      <dl className="acc-boot__facts acc-selectable">
        <dt>Shell</dt>
        <dd>{isDesktop ? 'Electron (preload bridge attached)' : 'Browser (dev fallback)'}</dd>
        <dt>Version</dt>
        <dd>{info?.version ?? '…'}</dd>
        <dt>Electron</dt>
        <dd>{info?.electron ?? '—'}</dd>
        <dt>Packaged</dt>
        <dd>{info ? String(info.packaged) : '—'}</dd>
      </dl>
    </main>
  );
}
