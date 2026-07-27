/**
 * Next Door Callendar — cykl życia wydarzenia
 *
 * Usunięcie nie jest jedną akcją. Użytkownik wybiera cel:
 *
 *   KOSZ      — to nie miało się wydarzyć. Znika wszędzie, także z osi życia.
 *               Odwracalne przez czas retencji, potem czyszczone automatycznie.
 *
 *   ARCHIWUM  — to się wydarzyło, ale nie chcę tego widzieć na co dzień.
 *               Znika z widoków kalendarza, ZOSTAJE na osi życia i w wyszukiwarce.
 *               Nigdy nie czyszczone automatycznie.
 *
 * To rozstrzyga sprzeczność między koszem a obietnicą, że historia nie ginie:
 * odwołana wizyta nie jest historią, odbyta jest. Różnicy nie da się wyliczyć
 * z samych danych — wie ją tylko użytkownik, więc go pytamy.
 */

export type Lifecycle = 'active' | 'archived' | 'trashed' | 'purged';

export interface LifecycleRow {
  archivedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  purgedAt?: string | Date | null;
  /** początek wydarzenia (ISO) — potrzebny tylko do doboru domyślnej akcji */
  startUtc?: string | Date | null;
  completedAt?: string | Date | null;
}

const ts = (v: string | Date | null | undefined): number | null =>
  v == null ? null : (v instanceof Date ? v : new Date(v)).getTime();

/**
 * Stany wykluczają się wzajemnie. Kolejność sprawdzania jest istotna:
 * rekord z ustawionym i archivedAt, i deletedAt jest w koszu — wrzucenie
 * do kosza czyści archiwizację, ale gdyby dane przyszły z innego urządzenia
 * w niespójnym stanie, kosz ma pierwszeństwo jako bardziej ukrywający.
 */
export function stateOf(row: LifecycleRow): Lifecycle {
  if (ts(row.purgedAt) !== null) return 'purged';
  if (ts(row.deletedAt) !== null) return 'trashed';
  if (ts(row.archivedAt) !== null) return 'archived';
  return 'active';
}

/**
 * Podpowiedź, nie rozstrzygnięcie — interfejs pokazuje OBIE opcje,
 * ta jest tylko wyróżniona.
 * Zdarzenie, które już się odbyło, domyślnie idzie do archiwum;
 * przyszłe albo nieodbyte — do kosza.
 */
export function defaultAction(row: LifecycleRow, now: Date = new Date()): 'archive' | 'trash' {
  if (ts(row.completedAt) !== null) return 'archive';
  const start = ts(row.startUtc);
  if (start !== null && start <= now.getTime()) return 'archive';
  return 'trash';
}

/* ------------------------------------------------------------------ */
/* Przejścia — zwracają łatkę pól, nie mutują rekordu                  */
/* ------------------------------------------------------------------ */

export type Patch = Record<string, string | null>;

const iso = (d: Date) => d.toISOString();

export function archive(now: Date = new Date()): Patch {
  return { archivedAt: iso(now), deletedAt: null };
}

export function trash(now: Date = new Date()): Patch {
  return { deletedAt: iso(now), archivedAt: null };
}

/** Powrót do stanu czynnego — działa i z kosza, i z archiwum. */
export function restore(): Patch {
  return { deletedAt: null, archivedAt: null };
}

/**
 * Trwałe usunięcie. Wiersz NIE znika z bazy — zostaje nagrobek:
 * identyfikator, świeży `rev` i `purgedAt`, reszta pól wyczyszczona.
 * Bez nagrobka pozostałe urządzenia nigdy by się nie dowiedziały,
 * że rekord ma zniknąć, i odesłałyby go z powrotem przy synchronizacji.
 */
export function purge(row: { id: string }, now: Date = new Date()): Patch & { id: string } {
  return {
    id: row.id,
    purgedAt: iso(now),
    deletedAt: iso(now),
    archivedAt: null,
    // Pusty łańcuch, nie null: `title` jest w schemacie NOT NULL,
    // a nagrobek musi przejść zapis tak samo jak każdy inny wiersz.
    title: '',
    description: null,
    location: null,
  };
}

/* ------------------------------------------------------------------ */
/* Widoczność                                                          */
/* ------------------------------------------------------------------ */

export type View = 'calendar' | 'timeline' | 'search' | 'trash' | 'archive';

const VISIBILITY: Record<Lifecycle, Record<View, boolean>> = {
  //          kalendarz  oś życia  szukaj  kosz   archiwum
  active:   { calendar: true,  timeline: true,  search: true,  trash: false, archive: false },
  archived: { calendar: false, timeline: true,  search: true,  trash: false, archive: true  },
  trashed:  { calendar: false, timeline: false, search: false, trash: true,  archive: false },
  purged:   { calendar: false, timeline: false, search: false, trash: false, archive: false },
};

export function visibleIn(row: LifecycleRow, view: View): boolean {
  return VISIBILITY[stateOf(row)][view];
}

/** Warunek WHERE dla zapytań — trzymany obok tabeli widoczności, żeby się nie rozjechały. */
export const SQL_FILTER: Record<View, string> = {
  calendar:  'deleted_at IS NULL AND archived_at IS NULL',
  timeline:  'deleted_at IS NULL',
  search:    'deleted_at IS NULL',
  trash:     'deleted_at IS NOT NULL AND purged_at IS NULL',
  archive:   'archived_at IS NOT NULL AND deleted_at IS NULL',
};

/* ------------------------------------------------------------------ */
/* Automatyczne czyszczenie kosza                                      */
/* ------------------------------------------------------------------ */

export const DEFAULT_RETENTION_DAYS = 30;

/**
 * Czyszczony jest WYŁĄCZNIE kosz. Archiwum nie wygasa nigdy — na tym polega
 * cała różnica między jednym a drugim.
 */
export function shouldAutoPurge(
  row: LifecycleRow,
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): boolean {
  if (stateOf(row) !== 'trashed') return false;
  const deleted = ts(row.deletedAt)!;
  return now.getTime() - deleted >= retentionDays * 86_400_000;
}
