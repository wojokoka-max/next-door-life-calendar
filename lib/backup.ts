/**
 * Next Door Callendar — kopia zapasowa
 *
 * Bez serwera to jest JEDYNE zabezpieczenie danych. Zgubiony telefon,
 * wyczyszczona pamięć przeglądarki albo odinstalowana aplikacja oznaczają
 * utratę wszystkiego, czego nie ma w wyeksportowanym pliku.
 *
 * Dlatego:
 *  - eksport jest zwykłym plikiem, który da się wrzucić gdziekolwiek,
 *  - format jest czytelnym JSON-em, więc da się go odzyskać nawet bez tej aplikacji,
 *  - aplikacja przypomina o kopii, gdy minie zbyt dużo czasu od ostatniej.
 */

import { all, put, settings, saveSettings, type EventRecord, type Settings } from './store';

export const BACKUP_FORMAT = 1;

export interface Backup {
  format: number;
  app: 'next-door-callendar';
  exportedAt: string;
  events: EventRecord[];
  settings: Settings;
}

export async function exportBackup(): Promise<Backup> {
  return {
    format: BACKUP_FORMAT,
    app: 'next-door-callendar',
    exportedAt: new Date().toISOString(),
    events: await all(),
    settings: await settings(),
  };
}

/** Pobranie pliku. Nazwa z datą, żeby kolejne kopie się nie nadpisywały. */
export async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const name = `callendar-${data.exportedAt.slice(0, 10)}.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  await saveSettings({ lastBackupAt: data.exportedAt });
}

export interface ImportResult { added: number; updated: number; skipped: number }

/**
 * Wczytanie kopii. Domyślnie SCALA, nie zastępuje: rekord o tym samym
 * identyfikatorze zostaje nadpisany tylko wtedy, gdy w pliku jest nowszy.
 * Dzięki temu wczytanie starej kopii nie cofa nowszych zmian.
 */
export async function importBackup(
  raw: unknown,
  mode: 'merge' | 'replace' = 'merge',
): Promise<ImportResult> {
  const b = raw as Backup;
  if (!b || b.app !== 'next-door-callendar' || typeof b.format !== 'number') {
    throw new Error('To nie jest plik kopii Next Door Callendar.');
  }
  if (b.format > BACKUP_FORMAT) {
    throw new Error('Kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację.');
  }

  const existing = new Map((await all()).map(e => [e.id, e]));
  const res: ImportResult = { added: 0, updated: 0, skipped: 0 };

  for (const e of b.events ?? []) {
    const cur = existing.get(e.id);
    if (!cur) { await put(e); res.added++; continue; }
    if (mode === 'replace' || new Date(e.updatedAt) > new Date(cur.updatedAt)) {
      await put(e); res.updated++;
    } else res.skipped++;
  }

  if (b.settings) await saveSettings(b.settings);
  return res;
}

/** Czy wypada przypomnieć o kopii. */
export function backupOverdue(last: string | null, days = 14): boolean {
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > days * 86_400_000;
}
