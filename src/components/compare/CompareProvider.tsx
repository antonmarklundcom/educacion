'use client';

/**
 * CLIENT COMPONENT — the comparador's selection state.
 *
 * Justification: a checkbox that responds to a click, a ceiling that has to
 * refuse the fifth one with a message, and a `localStorage` mirror are all
 * browser-only behaviour. Nothing else about the browse page becomes a client
 * component because of it: the provider takes the server-rendered table as
 * `children`, and the only client leaves inside it are the checkboxes and the
 * bar.
 *
 * ### Why toggling does not navigate
 *
 * The obvious implementation — `router.replace` on every check — would refetch
 * the whole RSC payload of a `force-dynamic` page on every click, which is a
 * database round-trip per checkbox. Instead the selection lives in React state,
 * is mirrored into `localStorage`, and the URL is updated with
 * `history.replaceState`, which keeps the address bar shareable without
 * re-rendering the server tree.
 *
 * The cost of that choice, stated plainly: links the server already rendered
 * (facets, sort, pagination) still carry the selection as of page load. That is
 * what the `localStorage` mirror is for — it restores the selection after any
 * navigation, which is also what makes it survive a trip to a program page and
 * back (architecture.md §5).
 *
 * ### Why the labels are stored too
 *
 * The URL carries ids, because ids are what `/comparar` re-reads from the
 * database. But the sticky bar has to name what you picked, and a program
 * selected three pages ago is not in the current page's results. Rather than
 * query for it, the label travels with the selection in `localStorage`. It is
 * only ever a display string that the user already saw — never a fact the page
 * would otherwise have to assert.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { sendEvent } from '@/lib/analytics/beacon';

import {
  COMPARE_LABELS_STORAGE_KEY,
  COMPARE_STORAGE_KEY,
  compareFullMessage,
  parseCompareIds,
  parseCompareLabels,
  serializeCompareIds,
  toggleCompareId,
  type CompareLabel,
} from '@/lib/compare/state';
// The contract, never the barrel — see the note in `@/lib/compare/state`.
import { COMPARE_PARAM, MAX_COMPARE } from '@/lib/search/contract';

interface CompareContextValue {
  ids: number[];
  entries: CompareLabel[];
  isSelected: (id: number) => boolean;
  toggle: (label: CompareLabel) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** Set when the user tried to add one too many; cleared on the next change. */
  limitMessage: string | null;
  isFull: boolean;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function useCompare(): CompareContextValue {
  const context = useContext(CompareContext);
  if (!context) throw new Error('useCompare must be used inside <CompareProvider>');
  return context;
}

export interface CompareProviderProps {
  /** The selection as the server read it out of the URL. */
  initialIds: number[];
  /** Labels for whatever the current page happens to render. */
  catalog?: CompareLabel[];
  children: React.ReactNode;
}

export function CompareProvider({ initialIds, catalog = [], children }: CompareProviderProps) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [labels, setLabels] = useState<Record<number, CompareLabel>>(() => indexLabels(catalog));
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  // Until the mirror has been read, the server's URL value is authoritative.
  const [hydrated, setHydrated] = useState(false);

  // A URL selection wins over the mirror: a shared link must show what it says.
  useEffect(() => {
    setHydrated(true);
    try {
      const storedLabels = parseCompareLabels(
        window.localStorage.getItem(COMPARE_LABELS_STORAGE_KEY),
      );
      if (storedLabels.length) {
        setLabels((current) => ({ ...indexLabels(storedLabels), ...current }));
      }
      if (initialIds.length > 0) return;
      const restored = parseCompareIds(window.localStorage.getItem(COMPARE_STORAGE_KEY));
      if (restored.length) setIds(restored);
    } catch {
      // Private mode, or storage disabled. The comparador still works from the
      // URL; it just does not survive navigation.
    }
  }, [initialIds]);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, serializeCompareIds(ids));
      const kept = ids
        .map((id) => labels[id])
        .filter((entry): entry is CompareLabel => entry != null);
      window.localStorage.setItem(COMPARE_LABELS_STORAGE_KEY, JSON.stringify(kept));
    } catch {
      /* see above */
    }

    // Keep the address bar shareable without re-running the server component.
    const url = new URL(window.location.href);
    if (ids.length) {
      url.searchParams.set(COMPARE_PARAM, serializeCompareIds(ids));
    } else {
      url.searchParams.delete(COMPARE_PARAM);
    }
    window.history.replaceState(null, '', url.toString());
  }, [ids, labels, hydrated]);

  // `compare_add` is reported from `toggle`, not from inside the state updater:
  // React invokes an updater twice in development strict mode, and an event
  // that double-counts is worse than one that is not recorded at all. The ref
  // is what lets a pure updater stay pure (architecture.md §12).
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  const toggle = useCallback((label: CompareLabel) => {
    const isAdd = !idsRef.current.includes(label.id) && idsRef.current.length < MAX_COMPARE;

    setLabels((current) => ({ ...current, [label.id]: label }));
    setIds((current) => {
      const result = toggleCompareId(current, label.id, MAX_COMPARE);
      setLimitMessage(result.rejected ? compareFullMessage(MAX_COMPARE) : null);
      return result.ids;
    });

    // Only a real addition counts. A removal is not an event we have a use for,
    // and a rejected fifth pick is not an addition at all.
    if (isAdd) sendEvent('compare_add', { offeringId: label.id });
  }, []);

  const remove = useCallback((id: number) => {
    setLimitMessage(null);
    setIds((current) => current.filter((entry) => entry !== id));
  }, []);

  const clear = useCallback(() => {
    setLimitMessage(null);
    setIds([]);
  }, []);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      entries: ids.map((id) => labels[id] ?? fallbackLabel(id)),
      isSelected: (id: number) => ids.includes(id),
      toggle,
      remove,
      clear,
      limitMessage,
      isFull: ids.length >= MAX_COMPARE,
    }),
    [ids, labels, toggle, remove, clear, limitMessage],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

function indexLabels(entries: readonly CompareLabel[]): Record<number, CompareLabel> {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

/** An id whose label we never saw. Says so instead of guessing a name. */
function fallbackLabel(id: number): CompareLabel {
  return { id, programName: 'Carrera seleccionada', institutionShort: '', brandColor: null };
}
