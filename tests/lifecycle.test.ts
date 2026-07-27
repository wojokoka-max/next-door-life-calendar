import { stateOf, defaultAction, archive, trash, restore, purge,
         visibleIn, shouldAutoPurge, DEFAULT_RETENTION_DAYS } from '../lib/lifecycle.ts';

let pass=0; const fails:string[]=[];
const ok=(n:string,c:boolean,d='')=>c?pass++:fails.push(`  ✗ ${n}${d?'  →  '+d:''}`);

const NOW=new Date('2026-07-26T12:00:00Z');
const days=(n:number)=>new Date(NOW.getTime()-n*86400000);

const ACTIVE={};
const ARCH={archivedAt:days(5).toISOString()};
const TRASH={deletedAt:days(5).toISOString()};
const OLD_TRASH={deletedAt:days(31).toISOString()};
const PURGED={deletedAt:days(40).toISOString(),purgedAt:days(9).toISOString()};

ok('stan: aktywne',  stateOf(ACTIVE)==='active',   stateOf(ACTIVE));
ok('stan: archiwum', stateOf(ARCH)==='archived',   stateOf(ARCH));
ok('stan: kosz',     stateOf(TRASH)==='trashed',   stateOf(TRASH));
ok('stan: nagrobek', stateOf(PURGED)==='purged',   stateOf(PURGED));

// Widoczność — sedno rozstrzygnięcia
ok('kalendarz pokazuje tylko aktywne', visibleIn(ACTIVE,'calendar') && !visibleIn(ARCH,'calendar') && !visibleIn(TRASH,'calendar'));
ok('OŚ ŻYCIA widzi archiwum',          visibleIn(ARCH,'timeline'));
ok('oś życia NIE widzi kosza',        !visibleIn(TRASH,'timeline'));
ok('wyszukiwarka widzi archiwum',      visibleIn(ARCH,'search'));
ok('nagrobek niewidoczny nigdzie',
   (['calendar','timeline','search','trash','archive'] as const).every(v=>!visibleIn(PURGED,v)));

// Domyślny wybór — podpowiedź, nie decyzja za użytkownika
ok('odbyte → archiwum',   defaultAction({startUtc:days(3).toISOString()},NOW)==='archive');
ok('przyszłe → kosz',     defaultAction({startUtc:new Date(NOW.getTime()+86400000).toISOString()},NOW)==='trash');
ok('zrealizowane → archiwum', defaultAction({completedAt:days(1).toISOString()},NOW)==='archive');

// Przejścia
ok('archiwizacja czyści kosz', archive(NOW).deletedAt===null);
ok('przywrócenie czyści oba', restore().deletedAt===null && restore().archivedAt===null);
const p=purge({id:'e1'},NOW);
ok('nagrobek zachowuje id',   p.id==='e1');
ok('nagrobek zeruje tytuł',   p.title==='');

// Automatyczne opróżnianie — tylko kosz
ok('kosz po 31 dniach czyszczony', shouldAutoPurge(OLD_TRASH,NOW));
ok('kosz po 5 dniach zostaje',    !shouldAutoPurge(TRASH,NOW));
ok('ARCHIWUM NIGDY nie wygasa',   !shouldAutoPurge({archivedAt:days(4000).toISOString()},NOW));

console.log(`\n${pass}/${pass+fails.length} testów przechodzi  (retencja: ${DEFAULT_RETENTION_DAYS} dni)\n`);
if(fails.length)console.log(fails.join('\n')+'\n');
