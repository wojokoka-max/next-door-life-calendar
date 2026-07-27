import { easterSunday, holidaysFor, holidaysInRange, isDayOff } from '../lib/holidays.ts';

let pass=0; const fails:string[]=[];
const ok=(n:string,c:boolean,d='')=>c?pass++:fails.push(`  ✗ ${n}${d?'  →  '+d:''}`);
const iso=(d:Date)=>d.toISOString().slice(0,10);

// Daty Wielkanocy — weryfikowalne niezależnie, dowolny kalendarz je potwierdzi
const EASTER: Array<[number,string]> = [
  [2023,'2023-04-09'], [2024,'2024-03-31'], [2025,'2025-04-20'],
  [2026,'2026-04-05'], [2027,'2027-03-28'], [2028,'2028-04-16'],
  [2030,'2030-04-21'], [2038,'2038-04-25'],  // najpóźniejsza możliwa data
  [1981,'1981-04-19'],
];
for (const [y,exp] of EASTER) {
  const got=iso(easterSunday(y));
  ok(`Wielkanoc ${y}`, got===exp, got);
}

// Wielkanoc zawsze wypada w niedzielę — niezależny sprawdzian na 200 lat
let allSunday=true, outOfRange=false;
for(let y=1900;y<2100;y++){
  const e=easterSunday(y);
  if(e.getUTCDay()!==0)allSunday=false;
  const s=iso(e).slice(5);
  if(s<'03-22'||s>'04-25')outOfRange=true;   // kanoniczny przedział
}
ok('Wielkanoc zawsze w niedzielę (1900–2099)', allSunday);
ok('Wielkanoc mieści się w 22 III – 25 IV', !outOfRange);

// Daty ruchome liczone od Wielkanocy
const h2026=holidaysFor(2026);
const find=(n:string)=>h2026.find(h=>h.name===n)?.date;
ok('Poniedziałek Wielkanocny 2026', find('Poniedziałek Wielkanocny')==='2026-04-06', find('Poniedziałek Wielkanocny'));
ok('Boże Ciało 2026',               find('Boże Ciało')==='2026-06-04', find('Boże Ciało'));
ok('Środa Popielcowa 2026',         find('Środa Popielcowa')==='2026-02-18', find('Środa Popielcowa'));
ok('Zielone Świątki 2026', find('Zielone Świątki · Zesłanie Ducha Świętego')==='2026-05-24', find('Zielone Świątki · Zesłanie Ducha Świętego'));
ok('Tłusty czwartek 2026',          find('Tłusty czwartek')==='2026-02-12', find('Tłusty czwartek'));

// Daty stałe
ok('Nowy Rok',            find('Nowy Rok')==='2026-01-01');
ok('Niepodległości',      find('Narodowe Święto Niepodległości')==='2026-11-11');
ok('Wszystkich Świętych', find('Wszystkich Świętych')==='2026-11-01');

// Filtrowanie zbiorów
const tylkoWolne=holidaysFor(2026,['urzedowe']);
ok('zbiór urzędowy ma 14 pozycji', tylkoWolne.length===14, String(tylkoWolne.length));
ok('wszystkie urzędowe są wolne',  tylkoWolne.every(h=>h.free));
ok('zwyczajowe nie są wolne',      holidaysFor(2026,['zwyczajowe']).every(h=>!h.free));

// Zakres na przełomie roku
const przelom=holidaysInRange('2026-12-20','2027-01-10');
ok('zakres przez sylwestra łapie oba lata',
   przelom.some(h=>h.date==='2026-12-25') && przelom.some(h=>h.date==='2027-01-06'),
   przelom.map(h=>h.date).join(','));
ok('zakres jest posortowany',
   przelom.every((h,i)=>i===0||przelom[i-1].date<=h.date));

// Dni wolne
ok('3 maja 2026 wolny',        isDayOff('2026-05-03'));
ok('zwykły wtorek nie wolny', !isDayOff('2026-07-28'));
ok('niedziela zawsze wolna',   isDayOff('2026-07-26'));

const de2026 = holidaysFor(2026, ['urzedowe'], 'DE');
const findDe = (n:string) => de2026.find(h => h.name === n)?.date;
ok('DE Neujahr 2026', findDe('Neujahr') === '2026-01-01', findDe('Neujahr'));
ok('DE Karfreitag 2026', findDe('Karfreitag') === '2026-04-03', findDe('Karfreitag'));
ok('DE Ostermontag 2026', findDe('Ostermontag') === '2026-04-06', findDe('Ostermontag'));
ok('DE Tag der Arbeit 2026', findDe('Tag der Arbeit') === '2026-05-01', findDe('Tag der Arbeit'));
ok('DE Christi Himmelfahrt 2026', findDe('Christi Himmelfahrt') === '2026-05-14', findDe('Christi Himmelfahrt'));
ok('DE Pfingstmontag 2026', findDe('Pfingstmontag') === '2026-05-25', findDe('Pfingstmontag'));
ok('DE Tag der Deutschen Einheit 2026', findDe('Tag der Deutschen Einheit') === '2026-10-03', findDe('Tag der Deutschen Einheit'));
ok('DE Erster Weihnachtstag 2026', findDe('Erster Weihnachtstag') === '2026-12-25', findDe('Erster Weihnachtstag'));
ok('DE Zweiter Weihnachtstag 2026', findDe('Zweiter Weihnachtstag') === '2026-12-26', findDe('Zweiter Weihnachtstag'));
ok('DE zwykly wtorek nie wolny', !isDayOff('2026-07-28', 'DE'));

console.log(`\n${pass}/${pass+fails.length} testów przechodzi\n`);
if(fails.length)console.log(fails.join('\n')+'\n');
