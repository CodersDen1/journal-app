import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { mockJournals } from '../data/mockJournals';
import { api } from '../lib/api';
import { createId, entryPreview } from '../lib/format';
import { storage } from '../lib/storage';
import type { JournalEntry, NewEntryInput } from '../types';
import { useAuth } from './AuthContext';

interface JournalsContextValue {
  loading: boolean;
  entries: JournalEntry[];
  /** Not archived, not deleted — newest first. The default list. */
  activeEntries: JournalEntry[];
  /** Archived, not deleted — newest first. */
  archivedEntries: JournalEntry[];
  getEntry: (id: string) => JournalEntry | undefined;
  createEntry: (input: NewEntryInput) => JournalEntry;
  updateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  toggleFavorite: (id: string) => void;
  archiveEntry: (id: string) => void;
  deleteEntry: (id: string) => void;
  restoreEntry: (id: string) => void;
  search: (query: string) => JournalEntry[];
}

const JournalsContext = createContext<JournalsContextValue | undefined>(undefined);

function sortByNewest(list: JournalEntry[]): JournalEntry[] {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function JournalsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const entriesRef = useRef<JournalEntry[]>(entries);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const signedIn = Boolean(user);

  // Load entries. When signed in, the backend (Firestore) is the source of
  // truth; otherwise we run local-first with a one-time seed for exploration.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (user) {
        try {
          const remote = await api.listEntries();
          if (cancelled) return;
          setEntries(remote);
          void storage.saveEntries(remote);
        } catch {
          const local = await storage.loadEntries();
          if (!cancelled && local) setEntries(local);
        }
      } else {
        const saved = await storage.loadEntries();
        if (cancelled) return;
        if (saved && saved.length > 0) {
          setEntries(saved);
        } else if (!(await storage.hasSeeded())) {
          setEntries(mockJournals);
          void storage.saveEntries(mockJournals);
          void storage.markSeeded();
        } else {
          setEntries([]);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist local cache on change.
  useEffect(() => {
    if (!loading) void storage.saveEntries(entries);
  }, [entries, loading]);

  const createEntry = useCallback(
    (input: NewEntryInput): JournalEntry => {
      const now = new Date().toISOString();
      const entry: JournalEntry = {
        id: createId(),
        createdAt: input.createdAt ?? now,
        updatedAt: now,
        type: input.type,
        text: input.text ?? '',
        transcript: input.transcript ?? '',
        audioUri: input.audioUri ?? null,
        audioDuration: input.audioDuration ?? 0,
        photos: input.photos ?? [],
        favorite: false,
        archived: false,
        deleted: false,
      };
      setEntries((prev) => [entry, ...prev]);
      if (signedIn) void api.createEntry(entry).catch(() => undefined);
      return entry;
    },
    [signedIn],
  );

  // Apply a patch locally and push the full updated entry to the backend.
  const mutate = useCallback(
    (id: string, changes: Partial<JournalEntry>) => {
      const current = entriesRef.current.find((e) => e.id === id);
      if (!current) return;
      const updated: JournalEntry = { ...current, ...changes, updatedAt: new Date().toISOString() };
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      if (signedIn) void api.updateEntry(updated).catch(() => undefined);
    },
    [signedIn],
  );

  const updateEntry = useCallback((id: string, changes: Partial<JournalEntry>) => mutate(id, changes), [mutate]);
  const toggleFavorite = useCallback(
    (id: string) => {
      const current = entriesRef.current.find((e) => e.id === id);
      if (current) mutate(id, { favorite: !current.favorite });
    },
    [mutate],
  );
  const archiveEntry = useCallback((id: string) => mutate(id, { archived: true }), [mutate]);
  const deleteEntry = useCallback((id: string) => mutate(id, { deleted: true }), [mutate]);
  const restoreEntry = useCallback((id: string) => mutate(id, { archived: false, deleted: false }), [mutate]);

  const getEntry = useCallback((id: string) => entries.find((e) => e.id === id), [entries]);

  const activeEntries = useMemo(
    () => sortByNewest(entries.filter((e) => !e.archived && !e.deleted)),
    [entries],
  );
  const archivedEntries = useMemo(
    () => sortByNewest(entries.filter((e) => e.archived && !e.deleted)),
    [entries],
  );

  const search = useCallback(
    (query: string): JournalEntry[] => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return activeEntries.filter((e) => entryPreview(e.text, e.transcript).toLowerCase().includes(q));
    },
    [activeEntries],
  );

  const value = useMemo<JournalsContextValue>(
    () => ({
      loading,
      entries,
      activeEntries,
      archivedEntries,
      getEntry,
      createEntry,
      updateEntry,
      toggleFavorite,
      archiveEntry,
      deleteEntry,
      restoreEntry,
      search,
    }),
    [
      loading,
      entries,
      activeEntries,
      archivedEntries,
      getEntry,
      createEntry,
      updateEntry,
      toggleFavorite,
      archiveEntry,
      deleteEntry,
      restoreEntry,
      search,
    ],
  );

  return <JournalsContext.Provider value={value}>{children}</JournalsContext.Provider>;
}

export function useJournals(): JournalsContextValue {
  const ctx = useContext(JournalsContext);
  if (!ctx) throw new Error('useJournals must be used within a JournalsProvider');
  return ctx;
}
