import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { dataBridge } from '../lib/bridge.js';
import { createEmptyDoc, normalizeDoc } from '../domain/schema.js';
import { migrate } from '../domain/migrations/index.js';
import { sealCompletedDays, clockMovedBackwards } from '../domain/resolve.js';
import { openDay } from '../domain/mutations.js';
import { todayKey } from '../domain/dates.js';

const DataContext = createContext(null);

/** Splash stages, so the loader shows real progress rather than a fake bar. */
export const LOAD_STAGES = [
  { id: 'locating', label: 'Finding your records' },
  { id: 'reading', label: 'Opening' },
  { id: 'upgrading', label: 'Checking for updates' },
  { id: 'preparing', label: 'Almost ready' },
];

export function DataProvider({ children }) {
  const [doc, setDoc] = useState(null);
  const [meta, setMeta] = useState({ readOnly: false });
  const [loadState, setLoadState] = useState({ status: 'loading', stage: 'locating', progress: 0 });
  const [repairs, setRepairs] = useState([]);
  const [saveStatus, setSaveStatus] = useState({ state: 'idle' });

  // The doc we last sent to disk, so we never post an identical payload.
  const lastSavedRef = useRef(null);
  const docRef = useRef(null);
  docRef.current = doc;

  const stage = useCallback((id, progress) => {
    setLoadState((s) => ({ ...s, stage: id, progress }));
  }, []);

  // --- load ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      stage('locating', 0.1);
      const result = await dataBridge.load();
      if (cancelled) return;

      stage('reading', 0.35);

      if (result.status === 'unconfigured' || result.status === 'missing') {
        // Onboarding has not run, or the pointer names a folder that has gone.
        // Deliberately do NOT create an empty record here — an empty record is
        // indistinguishable from data loss, and the user must get a real choice.
        setMeta({ ...(result.meta || {}), locationStatus: result.status });
        setLoadState({ status: 'needs-location', stage: 'locating', progress: 1 });
        return;
      }

      let parsed = null;
      if (result.text) {
        try {
          parsed = JSON.parse(result.text);
        } catch {
          parsed = null;
        }
      }

      stage('upgrading', 0.6);

      const migrated = migrate(parsed || createEmptyDoc());
      const readOnly = migrated.status === 'too-new' || Boolean(result.meta?.readOnly);

      const { doc: normalised, repairs: found } = normalizeDoc(migrated.doc);
      if (cancelled) return;

      stage('preparing', 0.85);

      // Seal any completed day that already has a record — but only if the clock
      // is trustworthy. A wrong BIOS clock or a district re-image must never be
      // able to rewrite history.
      let next = normalised;
      if (!readOnly && next.settings?.autoSealOnStartup && !clockMovedBackwards(next)) {
        next = sealCompletedDays(next);
      }

      const today = todayKey();
      const needsOnboarding = !next.settings?.onboardingCompletedAt;
      if (!readOnly && !needsOnboarding) {
        next = openDay(next, today);
      }

      lastSavedRef.current = readOnly ? JSON.stringify(next) : null;
      setDoc(next);
      setRepairs(found);
      setMeta({
        ...(result.meta || {}),
        readOnly,
        tooNew: migrated.status === 'too-new',
        migratedFrom: migrated.status === 'migrated' ? migrated.from : null,
        recoveredFrom: result.from || null,
        quarantined: result.quarantined || null,
        loadStatus: result.status,
      });
      setLoadState({
        status: needsOnboarding ? 'needs-onboarding' : 'ready',
        stage: 'preparing',
        progress: 1,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [stage]);

  // --- save ---------------------------------------------------------------
  useEffect(() => {
    if (!doc || meta.readOnly) return;
    const serialized = JSON.stringify(doc, null, 2);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    dataBridge.save(serialized);
  }, [doc, meta.readOnly]);

  useEffect(() => dataBridge.onStatus?.(setSaveStatus), []);

  // Flush on hide. Never rely on a clean quit — the real failure mode is a
  // laptop lid closing or district policy shutting the machine down.
  useEffect(() => {
    const flush = () => dataBridge.flush?.();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('blur', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /**
   * Apply a pure domain function to the document.
   * `mutate((doc) => nextDoc)` — returning the same reference is a no-op.
   */
  const mutate = useCallback((fn) => {
    setDoc((current) => {
      if (!current) return current;
      const next = fn(current);
      return next === current ? current : next;
    });
  }, []);

  const value = useMemo(
    () => ({
      doc,
      meta,
      loadState,
      repairs,
      saveStatus,
      mutate,
      setDoc,
      dismissRepairs: () => setRepairs([]),
      readOnly: Boolean(meta.readOnly),
    }),
    [doc, meta, loadState, repairs, saveStatus, mutate]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
