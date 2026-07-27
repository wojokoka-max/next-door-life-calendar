/**
 * Next Door Callendar — pamięć urządzenia
 *
 * Wszystko siedzi w IndexedDB w przeglądarce. Nie ma serwera, nie ma bazy
 * w chmurze, nie ma logowania. Dane nie opuszczają telefonu.
 *
 * Konsekwencja, o której trzeba wiedzieć: dane NIE synchronizują się między
 * urządzeniami i giną razem z telefonem albo po wyczyszczeniu danych
 * przeglądarki. Dlatego kopia zapasowa (lib/backup.ts) nie jest dodatkiem,
 * tylko jedynym zabezpieczeniem — patrz uwaga tam.
 *
 * Bez bibliotek: IndexedDB jest rozwlekłe, ale opakowanie w obietnice
 * mieści się w kilkudziesięciu linijkach i nie starzeje się razem z zależnością.
 */

const DB_NAME = 'ndc';
const DB_VERSION = 1;

export type Weight = 0 | 1 | 2;

export interface EventRecord {
  /** UUID nadawany przy zapisie */
  id: string;
  title: string;
  notes?: string | null;

  /** "YYYY-MM-DD" — dzień rozpoczęcia, zawsze obecny */
  date: string;
  /** "HH:MM" albo null dla całodniowych */
  time: string | null;
  durationMinutes: number | null;
  /** strefa zapisana przy tworzeniu, żeby serie przetrwały podróż i zmianę czasu */
  timezone: string;

  /** reguła RFC 5545 bez DTSTART, np. "FREQ=WEEKLY;INTERVAL=2" */
  rrule: string | null;
  /** odwołane wystąpienia serii, jako "YYYY-MM-DD" */
  skipped: string[];
  /** wspólny identyfikator części serii rozdzielonej edycją "od tego dnia" */
  seriesId: string | null;

  /** minuty przed początkiem; pusta tablica = bez przypomnienia */
  reminders: number[];
  weight: Weight;
  tags: string[];

  completedAt: string | null;
  pinnedAt: string | null;
  /** cykl życia — patrz lib/lifecycle.ts */
  archivedAt: string | null;
  deletedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  theme: string;
  holidayCountry?: 'PL' | 'DE';
  weekStart: 0 | 1;
  defaultReminder: number | null;
  lastBackupAt: string | null;
}

/* ------------------------------------------------------------------ */

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) {
        const s = db.createObjectStore('events', { keyPath: 'id' });
        // Odczyt zawsze idzie po zakresie dat — to jedyny indeks, który zarabia na siebie.
        s.createIndex('date', 'date');
        // Serie trzeba brać w całości niezależnie od okna, bo ich data startu
        // bywa daleko w przeszłości.
        s.createIndex('rrule', 'rrule');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode,
               fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/* ------------------------------------------------------------------ */

export const uuid = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

export async function put(e: EventRecord): Promise<EventRecord> {
  const rec = { ...e, updatedAt: nowIso() };
  await tx('events', 'readwrite', s => s.put(rec));
  return rec;
}

export async function create(
  input: Omit<EventRecord, 'id' | 'createdAt' | 'updatedAt' | 'skipped' | 'seriesId'
    | 'completedAt' | 'pinnedAt' | 'archivedAt' | 'deletedAt'>
    & Partial<Pick<EventRecord, 'skipped' | 'seriesId'>>,
): Promise<EventRecord> {
  const t = nowIso();
  return put({
    skipped: [], seriesId: null, completedAt: null, pinnedAt: null,
    archivedAt: null, deletedAt: null, createdAt: t, updatedAt: t,
    ...input, id: uuid(),
  } as EventRecord);
}

export const get = (id: string) =>
  tx<EventRecord | undefined>('events', 'readonly', s => s.get(id));

export const all = () =>
  tx<EventRecord[]>('events', 'readonly', s => s.getAll());

/**
 * Wydarzenia potrzebne do narysowania okna: jednorazowe z zakresu
 * plus WSZYSTKIE serie, bo ich data startu bywa daleko przed oknem.
 * Przy skali kalendarza jednej osoby serii jest kilkadziesiąt — to nie jest koszt.
 */
export async function forRange(from: string, to: string): Promise<EventRecord[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('events', 'readonly');
    const s = t.objectStore('events');
    const out: EventRecord[] = [];
    const seen = new Set<string>();

    const push = (r: EventRecord) => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } };

    const a = s.index('date').openCursor(IDBKeyRange.bound(from, to));
    a.onsuccess = () => {
      const c = a.result;
      if (c) { push(c.value as EventRecord); c.continue(); return; }

      const b = s.getAll();
      b.onsuccess = () => {
        for (const r of b.result as EventRecord[]) if (r.rrule) push(r);
        resolve(out);
      };
      b.onerror = () => reject(b.error);
    };
    a.onerror = () => reject(a.error);
  });
}

export const remove = (id: string) =>
  tx<undefined>('events', 'readwrite', s => s.delete(id));

/* ------------------------------------------------------------------ */

const DEFAULTS: Settings = {
  id: 'settings', theme: 'granat', holidayCountry: 'PL', weekStart: 1,
  defaultReminder: 30, lastBackupAt: null,
};

export async function settings(): Promise<Settings> {
  const s = await tx<Settings | undefined>('settings', 'readonly', st => st.get('settings'));
  return s ?? DEFAULTS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await settings()), ...patch, id: 'settings' as const };
  await tx('settings', 'readwrite', s => s.put(next));
  return next;
}

/**
 * Czyszczenie kosza. Wywoływane przy starcie aplikacji — nie ma serwera,
 * który mógłby to zrobić w tle.
 */
export async function purgeOldTrash(retentionDays = 30): Promise<number> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const rows = await all();
  let n = 0;
  for (const r of rows) {
    if (r.deletedAt && !r.archivedAt && new Date(r.deletedAt).getTime() < cutoff) {
      await remove(r.id); n++;
    }
  }
  return n;
}
