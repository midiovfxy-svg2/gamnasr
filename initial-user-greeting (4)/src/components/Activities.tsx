import { useState, type MouseEvent } from 'react';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { faNum, todayKey, type Profile } from '../lib/storage';
import { cn } from '../utils/cn';
import { QuoteCard, SourceTag } from './ui';

// ————— نعمت‌یاب: شکر تک به تک نعمت‌ها —————
export function BlessingsGame({ kids, collected, onCollect }: { kids?: boolean; collected: string[]; onCollect: (t: string) => void }) {
  const { BLESSING_END, BLESSING_INTRO, BLESSING_MAN_INTRO, BLESSINGS_MAN, BLESSINGS_NATURE, THANK_EACH, THANKS_WORD } = useSite().content.library;
  const [floats, setFloats] = useState<{ id: number; x: number; y: number }[]>([]);
  const all = [...BLESSINGS_NATURE, ...BLESSINGS_MAN];
  const count = all.filter((b) => collected.includes(b.t)).length;

  const tap = (t: string, e: MouseEvent) => {
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
    if (!collected.includes(t)) onCollect(t);
  };

  const tile = (b: { t: string; e: string }) => {
    const got = collected.includes(b.t);
    return (
      <button
        key={b.t}
        onClick={(e) => tap(b.t, e)}
        className={cn(
          'relative flex flex-col items-center gap-1 rounded-2xl border-2 p-2 transition active:scale-90',
          got ? 'border-amber-300 bg-gradient-to-b from-amber-100 to-yellow-200 text-slate-800' : kids ? 'border-sky-200 bg-white text-slate-700' : 'border-white/10 bg-white/5 text-slate-100',
        )}
      >
        <Glyph value={b.e} size={30} />
        <span className="text-[11px] font-bold leading-4">{b.t}</span>
        {got && <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <QuoteCard q={THANK_EACH} kids={kids} />
      <div className={cn('flex items-center justify-between rounded-2xl px-4 py-2 text-sm font-bold', kids ? 'bg-amber-100 text-amber-800' : 'bg-amber-300/10 text-amber-200')}>
        <span>🤲 نعمت‌های شکرشده</span>
        <span>
          {faNum(count)} / {faNum(all.length)}
        </span>
      </div>
      <QuoteCard q={BLESSING_INTRO} kids={kids} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{BLESSINGS_NATURE.map(tile)}</div>
      <QuoteCard q={BLESSING_MAN_INTRO} kids={kids} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{BLESSINGS_MAN.map(tile)}</div>
      {count === all.length && <QuoteCard q={BLESSING_END} kids={kids} big />}
      {floats.map((f) => (
        <span key={f.id} className="quran pointer-events-none fixed z-[70] -translate-x-1/2 text-lg font-bold text-emerald-500 animate-rise" style={{ left: f.x, top: f.y - 20 }}>
          {THANKS_WORD}
        </span>
      ))}
    </div>
  );
}

// ————— برنامهٔ روزانه (هدف.docx) —————
export function DailyProgram({ kids, profile, onToggle }: { kids?: boolean; profile: Profile; onToggle: (id: string) => void }) {
  const { DAILY_FOOT, DAILY_HEAD, DAILY_ITEMS, SMALL_STEPS } = useSite().content.library;
  const today = todayKey();
  const done = profile.daily[today] || [];
  let streak = 0;
  const d = new Date();
  if ((profile.daily[todayKey(d)] || []).length < DAILY_ITEMS.length) d.setDate(d.getDate() - 1);
  while ((profile.daily[todayKey(d)] || []).length >= DAILY_ITEMS.length) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const fullDays = Object.values(profile.daily).filter((v) => v.length >= DAILY_ITEMS.length).length;

  return (
    <div className="space-y-4">
      <div className={cn('rounded-3xl p-4 text-center', kids ? 'bg-gradient-to-l from-orange-300 to-pink-300 text-white' : 'bg-gradient-to-l from-amber-300/20 to-emerald-400/10')}>
        <div className="text-xl font-black">{DAILY_HEAD.t}</div>
        <div className="mt-1">
          <SourceTag s={DAILY_HEAD.s} kids={kids} />
        </div>
        <div className="mt-3 flex justify-center gap-6 text-sm">
          <div>
            🔥 <b>{faNum(streak)}</b> روز پیاپی
          </div>
          <div>
            📅 <b>{faNum(fullDays)}</b> روز کامل
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {DAILY_ITEMS.map((it) => {
          const on = done.includes(it.id);
          return (
            <button
              key={it.id}
              onClick={() => onToggle(it.id)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 p-3 text-right transition active:scale-[0.98]',
                on ? 'border-emerald-400 bg-emerald-400/15' : kids ? 'border-sky-200 bg-white' : 'border-white/10 bg-white/[0.04]',
              )}
            >
              <Glyph value={it.e} size={30} />
              <span className="flex-1 text-[15px] font-bold">{it.t}</span>
              <span className={cn('grid h-8 w-8 place-items-center rounded-full border-2 text-sm', on ? 'border-emerald-400 bg-emerald-400 text-white' : 'border-slate-400/40')}>{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <SourceTag s="hd" kids={kids} />
      </div>
      <QuoteCard q={SMALL_STEPS} kids={kids} />
      <QuoteCard q={DAILY_FOOT} kids={kids} />
    </div>
  );
}

// ————— تکرار باور تا یقین —————
export function RepeatBelief({ kids, profile, onRepeat }: { kids?: boolean; profile: Profile; onRepeat: (key: string) => void }) {
  const { REF_BELIEFS, REPEAT_Q } = useSite().content.library;
  const [sel, setSel] = useState(0);
  const [pulse, setPulse] = useState(0);
  const key = `ref-${sel}`;
  const n = profile.repeats[key] || 0;
  const total = Object.values(profile.repeats).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      <QuoteCard q={REPEAT_Q} kids={kids} />
      <div className="flex justify-center gap-2">
        {REF_BELIEFS.map((_, k) => (
          <button
            key={k}
            onClick={() => setSel(k)}
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full text-sm font-black transition',
              sel === k ? (kids ? 'bg-orange-400 text-white' : 'bg-amber-300 text-slate-900') : kids ? 'bg-white text-slate-600' : 'bg-white/10 text-slate-300',
            )}
          >
            {faNum(k + 1)}
          </button>
        ))}
      </div>
      <QuoteCard q={REF_BELIEFS[sel] || REF_BELIEFS[0]} kids={kids} big />
      <button
        onClick={() => {
          onRepeat(key);
          setPulse((p) => p + 1);
        }}
        className={cn(
          'relative w-full overflow-hidden rounded-3xl py-6 text-lg font-black transition active:scale-95',
          kids ? 'bg-gradient-to-l from-orange-400 to-pink-500 text-white' : 'bg-gradient-to-l from-amber-300 to-yellow-500 text-slate-900',
        )}
      >
        <span key={pulse} className="inline-block animate-pop">
          🔁 تکرار کردم
        </span>
        <div className="mt-1 text-sm font-bold opacity-80">{faNum(n)} بار</div>
      </button>
      <div>
        <div className={cn('mb-1 flex justify-between text-xs', kids ? 'text-slate-500' : 'text-slate-400')}>
          <span>هزاران بار</span>
          <span>{faNum(Math.min(n, 1000))} / {faNum(1000)}</span>
        </div>
        <div className={cn('h-2.5 overflow-hidden rounded-full', kids ? 'bg-sky-100' : 'bg-white/10')}>
          <div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-emerald-400 transition-all" style={{ width: `${Math.min(100, n / 10)}%` }} />
        </div>
        <div className={cn('mt-2 text-center text-xs', kids ? 'text-slate-500' : 'text-slate-400')}>مجموع تکرار همهٔ باورها: {faNum(total)}</div>
      </div>
    </div>
  );
}
