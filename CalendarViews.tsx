'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { isoWeekOf } from '@/lib/iso-week';

/* ------------------------------------------------------------------ */
/* Dane próbne — do zastąpienia odczytem z IndexedDB                   */
/* ------------------------------------------------------------------ */

interface Ev {
  t: string; d: string; time?: string; dur?: number;
  allDay?: boolean; rr?: string; w: 0 | 1 | 2;
}

const SAMPLE: Ev[] = [
  { t: 'Podlewanie',       d: '2026-07-01', time: '07:00', dur: 15, rr: 'FREQ=DAILY', w: 0 },
  { t: 'Wywóz śmieci',     d: '2026-07-07', allDay: true, rr: 'FREQ=WEEKLY', w: 0 },
  { t: 'Siłownia',         d: '2026-07-02', time: '18:00', dur: 75, rr: 'FREQ=WEEKLY;INTERVAL=2', w: 0 },
  { t: 'Rachunek za prąd', d: '2026-07-10', allDay: true, rr: 'FREQ=MONTHLY', w: 1 },
  { t: 'Dentysta',         d: '2026-08-04', time: '14:00', dur: 45, w: 1 },
  { t: 'Przegląd auta',    d: '2026-08-12', time: '10:30', dur: 90, w: 2 },
  { t: 'Badania okresowe', d: '2026-08-19', time: '08:00', dur: 60, w: 1 },
  { t: 'Pociąg — zbiórka', d: '2026-07-30', time: '02:45', dur: 30, w: 2 },
  { t: 'Urodziny',         d: '2026-08-16', allDay: true, rr: 'FREQ=YEARLY', w: 1 },
];

/* ------------------------------------------------------------------ */
/* Daty cywilne                                                        */
/* ------------------------------------------------------------------ */

const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addD = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const addM = (d: Date, n: number) => {
  const x = new Date(d); const day = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last)); return x;
};
const isoDow = (d: Date) => (d.getUTCDay() + 6) % 7;
const mondayOf = (d: Date) => addD(d, -isoDow(d));
const wk = (d: Date) => isoWeekOf(d).week;

const MONTH_YEAR = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_LONG   = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const D_SHORT    = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const D_FULL     = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const DOW = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

function repLabel(rr: string) {
  const f = /FREQ=(\w+)/.exec(rr)![1];
  const iv = Number(/INTERVAL=(\d+)/.exec(rr)?.[1] ?? 1);
  if (f === 'DAILY')   return iv > 1 ? `co ${iv} dni` : 'codziennie';
  if (f === 'WEEKLY')  return iv > 1 ? `co ${iv} tygodnie` : 'co tydzień';
  if (f === 'MONTHLY') return iv > 1 ? `co ${iv} miesiące` : 'co miesiąc';
  return 'co roku';
}

/** Rozwinięcie serii w oknie. Kolejność: godzina, a przy remisie waga. */
function occurrences(from: Date, to: Date): Array<Ev & { day: Date }> {
  const out: Array<Ev & { day: Date }> = [];
  for (const e of SAMPLE) {
    const [y, m, d] = e.d.split('-').map(Number);
    const start = U(y, m - 1, d);
    if (!e.rr) { if (start >= from && start <= to) out.push({ ...e, day: start }); continue; }
    const f = /FREQ=(\w+)/.exec(e.rr)![1];
    const iv = Number(/INTERVAL=(\d+)/.exec(e.rr)?.[1] ?? 1);
    for (let n = 0; n < 800; n++) {
      const c = f === 'DAILY'   ? addD(start, n * iv)
              : f === 'WEEKLY'  ? addD(start, 7 * n * iv)
              : f === 'MONTHLY' ? addM(start, n * iv)
              :                   addM(start, 12 * n * iv);
      if (c > to) break;
      if (c >= from) out.push({ ...e, day: c });
    }
  }
  return out.sort((a, b) =>
    +a.day - +b.day ||
    (a.allDay ? -1 : b.allDay ? 1 : 0) ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    b.w - a.w);
}

const HOUR_PX = 46;

/* ------------------------------------------------------------------ */

export default function CalendarViews() {
  const [today, setToday] = useState<Date | null>(null);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [cursor, setCursor] = useState(() => U(2026, 6, 26));
  const [selected, setSelected] = useState(() => U(2026, 6, 26));
  const scroller = useRef<HTMLDivElement>(null);

  // Ustalane po stronie klienta — inaczej serwer i przeglądarka
  // renderują różne "dziś" i React zgłasza niezgodność.
  useEffect(() => {
    const n = new Date();
    const t = U(n.getFullYear(), n.getMonth(), n.getDate());
    setToday(t); setCursor(t); setSelected(t);
  }, []);

  const label = useMemo(() => {
    if (view === 'day') {
      return {
        main: new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'UTC' }).format(cursor),
        sub: `${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(cursor)} · tydz. ${wk(cursor)}`,
      };
    }
    if (view === 'month') {
      const [mo, yr] = MONTH_YEAR.format(cursor).split(' ');
      return { main: mo, sub: yr };
    }
    const mon = mondayOf(cursor);
    return { main: `Tydzień ${wk(mon)}`, sub: `${D_SHORT.format(mon)} – ${D_FULL.format(addD(mon, 6))}` };
  }, [view, cursor]);

  /* oś przewija się do pierwszego wydarzenia, nie sztywno do 6:00 */
  useEffect(() => {
    if (view === 'month' || !scroller.current) return;
    const from = view === 'day' ? cursor : mondayOf(cursor);
    const timed = occurrences(from, view === 'day' ? cursor : addD(from, 6)).filter(e => !e.allDay);
    const min = timed.length
      ? Math.min(...timed.map(e => { const [h, m] = e.time!.split(':').map(Number); return h * 60 + m; }))
      : 7 * 60;
    scroller.current.scrollTop = Math.max(0, (min / 60) * HOUR_PX - HOUR_PX);
  }, [view, cursor]);

  const step = (n: number) =>
    setCursor(c => view === 'month' ? addM(c, n) : addD(c, view === 'week' ? 7 * n : n));

  return (
    <main className="mx-auto max-w-[620px] px-[14px] pt-[18px] pb-12">
      <header className="mb-4 flex items-start gap-2">
        <h1 className="m-0 min-w-0 flex-1 font-display text-[18px] font-medium capitalize leading-tight tracking-tight">
          {label.main}
          <small className="mt-px block font-sans text-[12.5px] font-normal normal-case tracking-normal"
                 style={{ color: 'var(--dim)' }}>{label.sub}</small>
        </h1>
        <button onClick={() => { if (!today) return; setCursor(today); setSelected(today); setView('day'); }}
                className="h-9 rounded-[10px] border px-3 text-[13px]"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
          Dziś
        </button>
        <div className="flex flex-none gap-1.5">
          {(['‹', '›'] as const).map((ch, i) => (
            <button key={ch} onClick={() => step(i === 0 ? -1 : 1)} aria-label={i === 0 ? 'Poprzedni' : 'Następny'}
                    className="grid h-9 w-9 place-items-center rounded-[10px] border"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
              {ch}
            </button>
          ))}
        </div>
      </header>

      <nav className="mb-3.5 flex gap-1.5">
        {([['day', 'Dzień'], ['week', 'Tydzień'], ['month', 'Miesiąc']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                  className="flex-1 rounded-[10px] border py-2.5 text-sm"
                  style={{
                    background: view === v ? 'var(--raised)' : 'var(--surface)',
                    borderColor: view === v ? 'var(--accent-line)' : 'var(--line)',
                    color: view === v ? 'var(--text)' : 'var(--dim)',
                    fontWeight: view === v ? 600 : 400,
                  }}>
            {t}
          </button>
        ))}
      </nav>

      {view === 'month' && (
        <MonthView cursor={cursor} today={today} selected={selected}
                   onPick={d => { if (+d === +selected) { setCursor(d); setView('day'); } else setSelected(d); }}
                   onWeek={d => { setCursor(d); setView('week'); }} />
      )}
      {view === 'week' && <WeekView cursor={cursor} today={today} scroller={scroller} />}
      {view === 'day'  && <DayView cursor={cursor} today={today} scroller={scroller} />}

      <footer className="mt-6 text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
        Numery tygodni to <code className="font-mono" style={{ color: 'var(--muted)' }}>ISO 8601</code> —
        tydzień 1 zawiera pierwszy czwartek roku, więc 1 stycznia bywa tygodniem 52 lub 53 roku poprzedniego.
        W obrębie dnia kolejność ustala godzina, a przy równych godzinach — waga.
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function MonthView({ cursor, today, selected, onPick, onWeek }: {
  cursor: Date; today: Date | null; selected: Date;
  onPick: (d: Date) => void; onWeek: (d: Date) => void;
}) {
  const first = U(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1);
  const grid = mondayOf(first);
  const map = new Map<string, Array<Ev & { day: Date }>>();
  for (const o of occurrences(grid, addD(grid, 41))) {
    const k = iso(o.day);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  const dayEvents = occurrences(selected, selected);

  return (
    <>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: '26px repeat(7,1fr)' }}>
        <div />
        {DOW.map(d => (
          <div key={d} className="pb-2 pt-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--muted)' }}>{d}</div>
        ))}
        {Array.from({ length: 6 }, (_, r) => {
          const rowStart = addD(grid, r * 7);
          return (
            <div key={r} className="contents">
              <button onClick={() => onWeek(rowStart)} title={`Tydzień ${wk(rowStart)}`}
                      className="grid place-items-center rounded-md font-mono text-[10.5px]"
                      style={{ color: 'var(--dim)' }}>{wk(rowStart)}</button>
              {Array.from({ length: 7 }, (_, c) => {
                const d = addD(rowStart, c);
                const evs = map.get(iso(d)) ?? [];
                const out = d.getUTCMonth() !== cursor.getUTCMonth();
                const isToday = today && +d === +today;
                return (
                  <button key={c} onClick={() => onPick(d)}
                          className="flex min-h-[54px] flex-col items-center gap-1 rounded-[9px] border px-1 pb-1 pt-[5px]"
                          style={{
                            background: out ? 'transparent' : +d === +selected ? 'var(--raised)' : 'var(--surface)',
                            borderColor: +d === +selected ? 'var(--accent-line)' : 'transparent',
                            opacity: out ? .45 : 1,
                          }}>
                    <span className="text-sm leading-none tabular-nums"
                          style={isToday ? {
                            background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600,
                            width: 23, height: 23, borderRadius: '50%',
                            display: 'grid', placeItems: 'center',
                          } : undefined}>{d.getUTCDate()}</span>
                    <span className="flex flex-wrap justify-center gap-[3px]">
                      {evs.slice(0, 4).map((e, i) => (
                        <i key={i} className="h-[5px] w-[5px] rounded-full"
                           style={{ background: `var(--w${e.w + 1})` }} />
                      ))}
                    </span>
                    {evs.length > 4 && (
                      <span className="text-[9.5px] leading-none" style={{ color: 'var(--dim)' }}>
                        +{evs.length - 4}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <section className="mt-[18px]">
        <h2 className="mb-2.5 flex items-baseline justify-between text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}>
          {DAY_LONG.format(selected)}
          <span className="font-mono normal-case tracking-normal" style={{ color: 'var(--dim)' }}>
            tydz. {wk(selected)}
          </span>
        </h2>
        {dayEvents.length ? (
          <ul className="m-0 grid list-none gap-[7px] p-0">
            {dayEvents.map((e, i) => (
              <li key={i} className="grid items-center gap-[11px] overflow-hidden rounded-[10px] py-[11px] pr-[13px]"
                  style={{ gridTemplateColumns: '52px 3px 1fr', background: 'var(--surface)' }}>
                <span className="pl-[11px] text-right font-mono text-[13px]" style={{ color: 'var(--dim)' }}>
                  {e.allDay ? '—' : e.time}
                </span>
                <span className="self-stretch rounded-sm" style={{ background: `var(--w${e.w + 1})` }} />
                <span>
                  <span className="text-[15px]">{e.t}</span>
                  {e.rr && <><br /><span className="text-[11.5px]" style={{ color: 'var(--dim)' }}>{repLabel(e.rr)}</span></>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-sm" style={{ color: 'var(--dim)' }}>Nic zaplanowanego.</p>}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function HourGutter() {
  return (
    <div className="grid">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="-translate-y-1.5 border-t pr-1.5 text-right font-mono text-[10.5px]"
             style={{ height: HOUR_PX, borderColor: 'var(--line)', color: 'var(--dim)' }}>
          {String(h).padStart(2, '0')}
        </div>
      ))}
    </div>
  );
}

function Lines() {
  return (
    <div className="absolute inset-0">
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} className="border-t" style={{ height: HOUR_PX, borderColor: 'var(--line)' }} />
      ))}
    </div>
  );
}

function NowLine({ show }: { show: boolean }) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!show) return;
    const t = () => { const n = new Date(); setTop((n.getHours() * 60 + n.getMinutes()) / 60 * HOUR_PX); };
    t(); const id = setInterval(t, 60_000); return () => clearInterval(id);
  }, [show]);
  if (!show || top === null) return null;
  return (
    <div className="absolute left-0 right-0 z-10 h-[1.5px]" style={{ top, background: 'var(--accent)' }}>
      <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full"
            style={{ background: 'var(--accent)' }} />
    </div>
  );
}

function Block({ e, wide }: { e: Ev & { day: Date }; wide?: boolean }) {
  const [hh, mm] = e.time!.split(':').map(Number);
  const top = (hh * 60 + mm) / 60 * HOUR_PX;
  const h = Math.max(wide ? 22 : 16, (e.dur ?? 60) / 60 * HOUR_PX - 2);
  return (
    <div className="absolute left-px right-px overflow-hidden rounded-[5px] border-l-[3px]"
         style={{
           top, height: h, background: 'var(--raised)', borderLeftColor: `var(--w${e.w + 1})`,
           padding: wide ? '5px 9px' : '3px 4px', fontSize: wide ? 13 : 10.5, lineHeight: 1.25,
         }}>
      <b className="block truncate font-medium">{e.t}</b>
      {h > (wide ? 34 : 28) && (
        <i className="font-mono not-italic" style={{ fontSize: wide ? 11 : 9, color: 'var(--dim)' }}>
          {e.time}{e.rr && wide ? ` · ${repLabel(e.rr)}` : ''}
        </i>
      )}
    </div>
  );
}

function WeekView({ cursor, today, scroller }: {
  cursor: Date; today: Date | null; scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const mon = mondayOf(cursor);
  const evs = occurrences(mon, addD(mon, 6));
  const cols = 'repeat(7,1fr)';
  return (
    <>
      <div className="mb-1 grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
        <div />
        {Array.from({ length: 7 }, (_, i) => {
          const d = addD(mon, i);
          const isToday = today && +d === +today;
          return (
            <div key={i} className="pb-1 text-center text-[10.5px] font-semibold uppercase tracking-wide"
                 style={{ color: 'var(--muted)' }}>
              {DOW[i]}
              <b className="block text-[15px] font-medium normal-case tracking-normal tabular-nums"
                 style={{ color: isToday ? 'var(--accent)' : 'var(--text)' }}>{d.getUTCDate()}</b>
            </div>
          );
        })}
      </div>

      <div className="mb-1.5 grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
        <div className="grid place-items-center text-center text-[9.5px]" style={{ color: 'var(--dim)' }}>
          cały<br />dzień
        </div>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addD(mon, i);
          return (
            <div key={i} className="grid min-h-[20px] content-start gap-0.5">
              {evs.filter(e => e.allDay && +e.day === +d).map((e, j) => (
                <div key={j} className="truncate rounded-[3px] border-l-2 px-[3px] py-[2px] text-[9.5px]"
                     style={{ background: 'var(--raised)', borderLeftColor: `var(--w${e.w + 1})` }}>{e.t}</div>
              ))}
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="max-h-[58vh] overflow-y-auto border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="relative grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
          <HourGutter />
          {Array.from({ length: 7 }, (_, i) => {
            const d = addD(mon, i);
            const isToday = Boolean(today && +d === +today);
            return (
              <div key={i} className="relative border-l"
                   style={{ borderColor: 'var(--line)', background: isToday ? 'rgba(143,184,217,.05)' : undefined }}>
                <Lines />
                {evs.filter(e => !e.allDay && +e.day === +d).map((e, j) => <Block key={j} e={e} />)}
                <NowLine show={isToday} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DayView({ cursor, today, scroller }: {
  cursor: Date; today: Date | null; scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const evs = occurrences(cursor, cursor);
  const allDay = evs.filter(e => e.allDay);
  const isToday = Boolean(today && +cursor === +today);
  return (
    <>
      <div className="mb-1.5 grid gap-0.5" style={{ gridTemplateColumns: '44px 1fr' }}>
        <div className="grid place-items-center text-center text-[9.5px]" style={{ color: 'var(--dim)' }}>
          cały<br />dzień
        </div>
        <div className="grid min-h-[22px] content-start gap-[3px]">
          {allDay.length ? allDay.map((e, i) => (
            <div key={i} className="rounded-[5px] border-l-[3px] px-[9px] py-1.5 text-[12.5px]"
                 style={{ background: 'var(--surface)', borderLeftColor: `var(--w${e.w + 1})` }}>{e.t}</div>
          )) : <div className="pl-0.5 pt-1 text-xs" style={{ color: 'var(--dim)' }}>—</div>}
        </div>
      </div>

      <div ref={scroller} className="max-h-[58vh] overflow-y-auto border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="relative grid gap-0.5" style={{ gridTemplateColumns: '44px 1fr' }}>
          <HourGutter />
          <div className="relative border-l" style={{ borderColor: 'var(--line)' }}>
            <Lines />
            {evs.filter(e => !e.allDay).map((e, i) => <Block key={i} e={e} wide />)}
            <NowLine show={isToday} />
          </div>
        </div>
      </div>
    </>
  );
}
