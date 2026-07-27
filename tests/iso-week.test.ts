import { isoWeekOf, isoWeekLabel, isoWeekRange, weeksInIsoYear, parseWeekQuery, isoWeekPretty } from '../lib/iso-week.ts';

let pass=0; const fails:string[]=[];
const ok=(n:string,c:boolean,d='')=>c?pass++:fails.push(`  ✗ ${n}${d?'  →  '+d:''}`);

// Przypadki graniczne przełomu roku — tu numeracja ISO zaskakuje
const CASES: Array<[string,string]> = [
  ['2026-01-01','2026-W01'],   // czwartek → własny rok
  ['2025-12-29','2026-W01'],   // poniedziałek już należy do 2026
  ['2025-12-28','2025-W52'],   // niedziela jeszcze do 2025
  ['2026-12-31','2026-W53'],   // 2026 ma 53 tygodnie
  ['2027-01-01','2026-W53'],   // piątek wpada do POPRZEDNIEGO roku ISO
  ['2027-01-04','2027-W01'],
  ['2024-12-30','2025-W01'],
  ['2026-07-24','2026-W30'],
];
for (const [d,exp] of CASES) {
  const got = isoWeekLabel(isoWeekOf(d));
  ok(`${d} → ${exp}`, got===exp, got);
}

ok('2026 ma 53 tygodnie', weeksInIsoYear(2026)===53, String(weeksInIsoYear(2026)));
ok('2025 ma 52 tygodnie', weeksInIsoYear(2025)===52, String(weeksInIsoYear(2025)));

const r = isoWeekRange(2026,30);
ok('zakres W30 zaczyna się w poniedziałek', r.start==='2026-07-20', r.start);
ok('zakres W30 kończy się w niedzielę',    r.end==='2026-07-26', r.end);

// spójność w obie strony przez cały rok
let roundtrip=true;
for(let w=1;w<=weeksInIsoYear(2026);w++){
  const {start}=isoWeekRange(2026,w);
  if(isoWeekLabel(isoWeekOf(start))!==`2026-W${String(w).padStart(2,'0')}`)roundtrip=false;
}
ok('zakres → numer → zakres zgadza się dla wszystkich tygodni 2026', roundtrip);

// wyszukiwarka
ok('parse "31"',        JSON.stringify(parseWeekQuery('31',2026))==='{"year":2026,"week":31}');
ok('parse "W31"',       JSON.stringify(parseWeekQuery('W31',2026))==='{"year":2026,"week":31}');
ok('parse "2027-W05"',  JSON.stringify(parseWeekQuery('2027-W05',2026))==='{"year":2027,"week":5}');
ok('parse "tydzień 9"', JSON.stringify(parseWeekQuery('tydzień 9',2026))==='{"year":2026,"week":9}');
ok('parse "54" odrzucone', parseWeekQuery('54',2026)===null);
ok('parse "abc" odrzucone', parseWeekQuery('abc',2026)===null);

console.log(`\n${pass}/${pass+fails.length} testów przechodzi\n`);
if(fails.length)console.log(fails.join('\n')+'\n');
console.log('  '+isoWeekPretty(2026,31)+'\n');
