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
import { backfillDays, backfillRange } from '../domain/seed.js';
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
  /**
   * True for the one render where the board appears straight out of onboarding.
   *
   * The board plays a slower, choreographed entrance that once, so it reads as
   * growing out of the same scene the outro left behind. Every launch after that
   * gets the ordinary faster one, because a teacher opening the app for the
   * fortieth time wants their board, not a performance.
   */
  const [firstRun, setFirstRun] = useState(false);
  // Stable, so the board's cascade effect is not restarted by an unrelated
  // document change while it is running.
  const clearFirstRun = useCallback(() => setFirstRun(false), []);

  // The doc we last sent to disk, so we never post an identical payload.
  const lastSavedRef = useRef(null);
  const docRef = useRef(null);
  docRef.current = doc;

  const stage = useCallback((id, progress) => {
    setLoadState((s) => ({ ...s, stage: id, progress }));
  }, []);

  // --- load ---------------------------------------------------------------

  /*
    One loader, called at mount and again on request.

    It was the body of a mount-only effect, which meant the ONLY way a document
    ever entered the app was at startup. Onboarding's location step could point
    at a folder that already held a teacher's year and had no way to read it -
    so it carried on and, at the end, wrote a fresh record over it. `reload` is
    what that step calls now when the folder turns out not to be empty.

    The token lets a run that has been superseded (unmount, or a second reload)
    stop before it sets state.
  */
  const loadToken = useRef({ cancelled: false });

  const load = useCallback(async () => {
    loadToken.current.cancelled = true;
    const token = { cancelled: false };
    loadToken.current = token;

    stage('locating', 0.1);
    const result = await dataBridge.load();
    if (token.cancelled) return;

    stage('reading', 0.35);

    if (result.status === 'unconfigured' || result.status === 'missing') {
      // Onboarding has not run, or the pointer names a folder that has gone.
      // Deliberately do NOT create an empty record here - an empty record is
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
    if (token.cancelled) return;

    stage('preparing', 0.85);

    // Seal any completed day that already has a record - but only if the clock
    // is trustworthy. A wrong BIOS clock or a district re-image must never be
    // able to rewrite history.
    let next = normalised;
    if (!readOnly && next.settings?.autoSealOnStartup && !clockMovedBackwards(next)) {
      next = sealCompletedDays(next);
    }

    const today = todayKey();
    const needsOnboarding = !next.settings?.onboardingCompletedAt;
    if (!readOnly && !needsOnboarding) {
      // Lay out any school day between the start of the year and today that
      // does not have a record yet, so the teacher never has to create a day
      // before they can fill it in. Every day this creates is flagged
      // `backfilled`, which is what stops a laid-out day from reading as
      // documented non-delivery - see backfillDays.
      //
      // Runs AFTER sealing on purpose: sealing must only ever see days a
      // teacher actually worked, never ones this just created.
      const range = backfillRange(next);
      if (range) next = backfillDays(next, range).doc;

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
  }, [stage]);

  useEffect(() => {
    load();
    return () => {
      loadToken.current.cancelled = true;
    };
  }, [load]);

  /** Read the record from disk again, from wherever the pointer now names. */
  const reload = useCallback(() => {
    setLoadState({ status: 'loading', stage: 'locating', progress: 0 });
    return load();
  }, [load]);

  // --- save ---------------------------------------------------------------
  useEffect(() => {
    if (!doc || meta.readOnly) return;
    const serialized = JSON.stringify(doc, null, 2);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    dataBridge.save(serialized);
  }, [doc, meta.readOnly]);

  useEffect(() => dataBridge.onStatus?.(setSaveStatus), []);

  // Flush on hide. Never rely on a clean quit - the real failure mode is a
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
   * `mutate((doc) => nextDoc)` - returning the same reference is a no-op.
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
      // `setDoc(next, { firstRun: true })` is how onboarding hands over.
      setDoc: (next, options) => {
        if (options?.firstRun) setFirstRun(true);
        setDoc(next);
      },
      firstRun,
      clearFirstRun,
      /*
        Read the file again from wherever the pointer now names. Onboarding's
        location step calls this when the folder it was pointed at already
        holds a record, so that record is opened rather than written over.
      */
      reload,
      dismissRepairs: () => setRepairs([]),
      readOnly: Boolean(meta.readOnly),
      /*
        Where the file lives, changed after the fact. Only the location moves -
        the document is the same one, already in hand, so re-reading it would be
        a load screen for a file we just copied. See RecordsFolderModal.
      */
      patchMeta: (changes) => setMeta((m) => ({ ...m, ...changes })),
    }),
    [doc, meta, loadState, repairs, saveStatus, mutate, firstRun, clearFirstRun, reload]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
