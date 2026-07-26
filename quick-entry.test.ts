import { parseQuickEntry, describeDraft, type Category } from './quick-entry.ts';

const CATEGORIES: Category[] = [
  { id: 'c-zdrowie', name: 'Zdrowie' },
  { id: 'c-samochod', name: 'Samochod' },
  { id: 'c-dom', name: 'Dom' },
];

// piątek, 24 lipca 2026, 10:00 czasu warszawskiego
const NOW = new Date('2026-07-24T08:00:00Z');
const OPTS = { timeZone: 'Europe/Warsaw', categories: CATEGORIES };

interface Case {
  input: string;
  title?: string;
  start?: string;
  allDay?: boolean;
  duration?: number | null;
  rrule?: string | null;
  category?: string | null;
  priority?: number;
}

const CASES: Case[] = [
  // --- dni względne ---
  { input: 'Dentysta jutro o 14', title: 'Dentysta', start: '2026-07-25T14:00', duration: 60 },
  { input: 'Zakupy dzisiaj wieczorem', title: 'Zakupy', start: '2026-07-24T19:00' },
  { input: 'Wyjazd pojutrze', title: 'Wyjazd', start: '2026-07-26', allDay: true },

  // --- dni tygodnia ---
  { input: 'Dentysta w przyszly wtorek o 14', title: 'Dentysta', start: '2026-08-04T14:00' },
  { input: 'Spotkanie we wtorek o 9', title: 'Spotkanie', start: '2026-07-28T09:00' },
  { input: 'Trening w sobote rano', title: 'Trening', start: '2026-07-25T09:00' },

  // --- przesunięcia ---
  { input: 'Badania za 6 miesiecy', title: 'Badania', start: '2027-01-24', allDay: true },
  { input: 'Przeglad za rok', title: 'Przeglad', start: '2027-07-24', allDay: true },
  { input: 'Telefon za 3 dni', title: 'Telefon', start: '2026-07-27', allDay: true },
  { input: 'Kontrola za pol roku', title: 'Kontrola', start: '2027-01-24', allDay: true },

  // --- daty jawne ---
  { input: 'Urodziny 15 marca', title: 'Urodziny', start: '2027-03-15', allDay: true },
  { input: 'Wizyta 15.03.2027 o 11:30', title: 'Wizyta', start: '2027-03-15T11:30' },
  { input: 'Rachunek 10.08', title: 'Rachunek', start: '2026-08-10', allDay: true },

  // --- godziny i zakresy ---
  { input: 'Spotkanie jutro 10:00-11:30', title: 'Spotkanie', start: '2026-07-25T10:00', duration: 90 },
  { input: 'Warsztat jutro od 9 do 12', title: 'Warsztat', start: '2026-07-25T09:00', duration: 180 },
  { input: 'Kawa jutro o wpol do trzeciej', title: 'Kawa', start: '2026-07-25T02:30' },
  { input: 'Kawa jutro o wpol do trzeciej po poludniu', title: 'Kawa', start: '2026-07-25T14:30' },
  { input: 'Spacer jutro na 45 minut o 17', title: 'Spacer', start: '2026-07-25T17:00', duration: 45 },

  // --- cykliczność ---
  { input: 'Siłownia co drugi czwartek o 18', title: 'Siłownia', rrule: 'FREQ=WEEKLY;BYDAY=TH;INTERVAL=2' },
  { input: 'Podlewanie codziennie o 7', title: 'Podlewanie', rrule: 'FREQ=DAILY' },
  { input: 'Raport co tydzien', title: 'Raport', rrule: 'FREQ=WEEKLY' },
  { input: 'Czynsz co miesiac', title: 'Czynsz', rrule: 'FREQ=MONTHLY' },
  { input: 'Przeglad co roku', title: 'Przeglad', rrule: 'FREQ=YEARLY' },
  { input: 'Bieganie w kazdy piatek', title: 'Bieganie', rrule: 'FREQ=WEEKLY;BYDAY=FR' },
  { input: 'Filtry co 3 miesiace', title: 'Filtry', rrule: 'FREQ=MONTHLY;INTERVAL=3' },

  // --- kategorie i priorytet ---
  { input: 'Tomografia @zdrowie jutro o 8', title: 'Tomografia', category: 'c-zdrowie', start: '2026-07-25T08:00' },
  { input: 'Wymiana oleju Samochod za 2 tygodnie', title: 'Wymiana oleju', category: 'c-samochod', start: '2026-08-07' },
  { input: 'Zaplacic rachunek !1 jutro', title: 'Zaplacic rachunek', priority: 1 },

  // --- brak sygnału czasu ---
  { input: 'Kupic mleko', title: 'Kupic mleko', allDay: true, start: '2026-07-24' },

  // --- godzina, która już minęła → jutro ---
  { input: 'Telefon o 8', title: 'Telefon', start: '2026-07-25T08:00' },

  // --- pora dnia: uzus polski ---
  // "o 7" to siódma rano, nie dziewiętnasta
  { input: 'Pobudka o 7', title: 'Pobudka', start: '2026-07-25T07:00' },
  { input: 'Bieganie jutro o 6', title: 'Bieganie', start: '2026-07-25T06:00' },
  // godzina zapisana wprost NIE jest przesuwana — nocne pociągi istnieją
  { input: 'Spotkanie jutro o 3', title: 'Spotkanie', start: '2026-07-25T03:00' },
  { input: 'Zbiorka na pociag jutro o 2:45', title: 'Zbiorka na pociag', start: '2026-07-25T02:45' },
  { input: 'Lot jutro o 4:20', title: 'Lot', start: '2026-07-25T04:20' },
  { input: 'Odbior jutro o 5', title: 'Odbior', start: '2026-07-25T05:00' },
  // dopiero dookreślenie przesuwa
  { input: 'Spotkanie jutro o 3 po poludniu', title: 'Spotkanie', start: '2026-07-25T15:00' },

  // --- godziny podane słownie ---
  { input: 'Kawa jutro o trzeciej', title: 'Kawa', start: '2026-07-25T03:00' },
  { input: 'Obiad jutro o pierwszej', title: 'Obiad', start: '2026-07-25T01:00' },
  { input: 'Kolacja jutro o siodmej wieczorem', title: 'Kolacja', start: '2026-07-25T19:00' },
  // dookreślenie wygrywa z heurystyką
  { input: 'Kolacja jutro o 7 wieczorem', title: 'Kolacja', start: '2026-07-25T19:00' },
  { input: 'Trening jutro o 6 rano', title: 'Trening', start: '2026-07-25T06:00' },
  { input: 'Powrot jutro o 11 w nocy', title: 'Powrot', start: '2026-07-25T23:00' },
  { input: 'Alarm jutro o 2 w nocy', title: 'Alarm', start: '2026-07-25T02:00' },
];

let pass = 0;
const fails: string[] = [];

for (const c of CASES) {
  const d = parseQuickEntry(c.input, NOW, OPTS);
  const errs: string[] = [];

  if (c.title !== undefined && d.title !== c.title) errs.push(`title "${d.title}" ≠ "${c.title}"`);
  if (c.start !== undefined && d.startLocal !== c.start) errs.push(`start ${d.startLocal} ≠ ${c.start}`);
  if (c.allDay !== undefined && d.allDay !== c.allDay) errs.push(`allDay ${d.allDay} ≠ ${c.allDay}`);
  if (c.duration !== undefined && d.durationMinutes !== c.duration) errs.push(`duration ${d.durationMinutes} ≠ ${c.duration}`);
  if (c.rrule !== undefined && d.rrule !== c.rrule) errs.push(`rrule ${d.rrule} ≠ ${c.rrule}`);
  if (c.category !== undefined && d.categoryId !== c.category) errs.push(`cat ${d.categoryId} ≠ ${c.category}`);
  if (c.priority !== undefined && d.priority !== c.priority) errs.push(`prio ${d.priority} ≠ ${c.priority}`);

  if (errs.length) fails.push(`  ✗ "${c.input}"\n      ${errs.join('\n      ')}`);
  else pass++;
}

// --- flaga niejednoznaczności ---
const amb = parseQuickEntry('Pobudka o 7', NOW, OPTS);
if (amb.startLocal !== '2026-07-25T07:00' || amb.hourAmbiguous) {
  fails.push(`  ✗ "o 7" ma być 07:00 i jednoznaczne (${amb.startLocal}, amb=${amb.hourAmbiguous})`);
} else pass++;

// zapis cyfrowy jest w polskich kalendarzach 24-godzinny — żadnej alternatywy
const night = parseQuickEntry('Zbiorka jutro o 2:45', NOW, OPTS);
if (night.startLocal !== '2026-07-25T02:45' || night.hourAmbiguous) {
  fails.push(`  ✗ "o 2:45" ma być 02:45 i jednoznaczne (${night.startLocal}, amb=${night.hourAmbiguous})`);
} else pass++;

const digits = parseQuickEntry('Spotkanie jutro o 3', NOW, OPTS);
if (digits.startLocal !== '2026-07-25T03:00' || digits.hourAmbiguous) {
  fails.push(`  ✗ "o 3" ma być 03:00 i jednoznaczne (${digits.startLocal}, amb=${digits.hourAmbiguous})`);
} else pass++;

// forma słowna — tu alternatywa ma sens
const words = parseQuickEntry('Kawa jutro o trzeciej', NOW, OPTS);
if (!words.hourAmbiguous || words.alternativeHour !== 15) {
  fails.push(`  ✗ "o trzeciej" ma być niejednoznaczne z alternatywą 15 (amb=${words.hourAmbiguous}, alt=${words.alternativeHour})`);
} else pass++;

const noon = parseQuickEntry('Zebranie jutro o 13', NOW, OPTS);
if (noon.hourAmbiguous) {
  fails.push('  ✗ "o 13" jest jednoznaczne, nie powinno mieć alternatywy');
} else pass++;

const explicit = parseQuickEntry('Kolacja jutro o 7 wieczorem', NOW, OPTS);
if (explicit.hourAmbiguous) {
  fails.push('  ✗ "o 7 wieczorem" jest dookreślone, nie powinno być niejednoznaczne');
} else pass++;

console.log(`\n${pass}/${pass + fails.length} przypadków przechodzi\n`);
if (fails.length) console.log(fails.join('\n') + '\n');

console.log('--- podgląd dla UI ---\n');
for (const s of [
  'Dentysta w przyszly wtorek o 14',
  'Siłownia co drugi czwartek o 18',
  'Badania za 6 miesiecy',
  'Spotkanie jutro 10:00-11:30',
]) {
  console.log(`  ${s}`);
  console.log(`  → ${describeDraft(parseQuickEntry(s, NOW, OPTS), CATEGORIES)}\n`);
}
