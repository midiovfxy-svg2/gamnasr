import { useMemo, useRef, useState } from 'react';
import type { Question } from '../data/types';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { shuffle } from '../lib/storage';
import { cn } from '../utils/cn';
import { Btn, QuoteCard, SourceTag } from './ui';

type ResultFn = (ok: boolean) => void;

const LABEL: Record<Question['kind'], string> = {
  choice: 'جملهٔ استاد را کامل کنید',
  sort: 'هر مورد را در جای درستش بگذارید',
  order: 'به ترتیب درست بچینید',
  match: 'جفت‌های درست را پیدا کنید',
};

export function Quiz({
  questions,
  kids,
  onAnswer,
  onFinish,
}: {
  questions: Question[];
  kids?: boolean;
  onAnswer: (firstTry: boolean) => void;
  onFinish: (score: number, total: number) => void;
}) {
  const { NO_GUILT, REPENT } = useSite().content.library;
  const [i, setI] = useState(0);
  const [solved, setSolved] = useState(false);
  const [missed, setMissed] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const score = useRef(0);
  const q = questions[i];

  const onResult: ResultFn = (ok) => {
    if (solved) return;
    if (ok) {
      if (!missed) {
        score.current += 1;
        onAnswer(true);
      }
      setSolved(true);
    } else {
      setMistakes((m) => m + 1);
      if (!missed) {
        setMissed(true);
        onAnswer(false);
      }
    }
  };

  const next = () => {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setSolved(false);
      setMissed(false);
      setMistakes(0);
    } else onFinish(score.current, questions.length);
  };

  const muted = kids ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {questions.map((_, k) => (
          <div
            key={k}
            className={cn(
              'h-2 flex-1 rounded-full transition-all',
              k < i ? 'bg-emerald-400' : k === i ? (kids ? 'bg-orange-400' : 'bg-amber-300') : kids ? 'bg-sky-100' : 'bg-white/10',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('rounded-full px-3 py-1 text-xs font-bold', kids ? 'bg-orange-100 text-orange-700' : 'bg-amber-300/10 text-amber-200')}>
          {LABEL[q.kind]}
        </span>
        <span className={cn('text-xs', muted)}>
          {i + 1} / {questions.length}
        </span>
      </div>

      <div key={i} className="animate-pop">
        {q.kind === 'choice' && <ChoiceQ q={q} kids={kids} onResult={onResult} solved={solved} />}
        {q.kind === 'sort' && <SortQ q={q} kids={kids} onResult={onResult} solved={solved} />}
        {q.kind === 'order' && <OrderQ q={q} kids={kids} onResult={onResult} solved={solved} />}
        {q.kind === 'match' && <MatchQ q={q} kids={kids} onResult={onResult} solved={solved} />}
      </div>

      {!solved && mistakes > 0 && (
        <div className={cn('rounded-2xl border p-3 text-sm leading-7 animate-shake', kids ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-rose-300/20 bg-rose-500/10 text-rose-100')}>
          <p className="whitespace-pre-line">{(mistakes % 2 ? NO_GUILT : REPENT).t}</p>
          <div className="mt-1 flex justify-end">
            <SourceTag s={(mistakes % 2 ? NO_GUILT : REPENT).s} kids={kids} />
          </div>
        </div>
      )}

      {solved && (
        <div className="space-y-3 animate-pop">
          <div className={cn('text-sm font-extrabold', kids ? 'text-emerald-600' : 'text-emerald-300')}>
            {missed ? '✓ درست شد — متن کامل استاد:' : '✓ آفرین! متن کامل استاد:'}
          </div>
          <QuoteCard q={{ t: q.full, s: q.s }} kids={kids} />
          <Btn variant={kids ? 'kids' : 'gold'} className="w-full py-3 text-base" onClick={next}>
            {i + 1 < questions.length ? 'پرسش بعدی' : 'پایان آزمون'}
          </Btn>
        </div>
      )}

      <p className={cn('text-center text-[10px] leading-5', muted)}>
        گزینه‌های نادرست، جملهٔ استاد نیستند؛ پس از هر پاسخ، متن کامل و دقیق استاد نمایش داده می‌شود.
      </p>
    </div>
  );
}

// ————— تکمیل جمله —————
function ChoiceQ({ q, kids, onResult, solved }: { q: Extract<Question, { kind: 'choice' }>; kids?: boolean; onResult: ResultFn; solved: boolean }) {
  const opts = useMemo(() => shuffle(q.options.map((t, idx) => ({ t, idx }))), [q]);
  const [wrong, setWrong] = useState<number[]>([]);
  const parts = q.stem.split('____');
  return (
    <div className="space-y-4">
      <div className={cn('rounded-2xl border p-4 text-[17px] leading-9 whitespace-pre-line', kids ? 'border-sky-200 bg-white text-slate-800' : 'border-white/10 bg-white/[0.04]')}>
        {parts.map((p, k) => (
          <span key={k}>
            {p}
            {k < parts.length - 1 && (
              <span
                className={cn(
                  'mx-1 inline-block min-w-16 rounded-lg border-b-2 px-2 text-center font-bold',
                  solved ? 'border-emerald-400 bg-emerald-400/15 text-emerald-500' : kids ? 'border-orange-400 bg-orange-50 text-orange-400' : 'border-amber-300 bg-amber-300/10 text-amber-300',
                )}
              >
                {solved ? q.options[q.answer] : '؟'}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="grid gap-2">
        {opts.map((o) => {
          const isWrong = wrong.includes(o.idx);
          const isRight = solved && o.idx === q.answer;
          return (
            <button
              key={o.idx}
              disabled={solved || isWrong}
              onClick={() => {
                if (o.idx === q.answer) onResult(true);
                else {
                  setWrong((w) => [...w, o.idx]);
                  onResult(false);
                }
              }}
              className={cn(
                'rounded-xl border-2 px-4 py-3 text-right text-[15px] leading-7 transition active:scale-[0.98]',
                isRight
                  ? 'border-emerald-400 bg-emerald-400/15'
                  : isWrong
                    ? 'border-rose-400/60 bg-rose-500/10 line-through opacity-50'
                    : kids
                      ? 'border-sky-200 bg-white hover:border-orange-300 hover:bg-orange-50'
                      : 'border-white/10 bg-white/[0.03] hover:border-amber-300/50 hover:bg-amber-300/5',
              )}
            >
              {o.t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ————— دسته‌بندی —————
function SortQ({ q, kids, onResult, solved }: { q: Extract<Question, { kind: 'sort' }>; kids?: boolean; onResult: ResultFn; solved: boolean }) {
  const items = useMemo(() => shuffle(q.items.map((it, idx) => ({ ...it, idx }))), [q]);
  const [place, setPlace] = useState<Record<number, 0 | 1>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [bad, setBad] = useState<number[]>([]);
  const pool = items.filter((it) => place[it.idx] === undefined);

  const drop = (b: 0 | 1) => {
    if (sel === null || solved) return;
    setPlace((p) => ({ ...p, [sel]: b }));
    setSel(null);
  };
  const check = () => {
    const wrong = items.filter((it) => place[it.idx] !== it.b).map((it) => it.idx);
    if (wrong.length === 0) onResult(true);
    else {
      setBad(wrong);
      onResult(false);
      setTimeout(() => {
        setPlace((p) => {
          const n = { ...p };
          wrong.forEach((w) => delete n[w]);
          return n;
        });
        setBad([]);
      }, 900);
    }
  };

  const chip = (it: (typeof items)[number], inBin: boolean) => (
    <button
      key={it.idx}
      disabled={solved}
      onClick={(e) => {
        e.stopPropagation();
        if (inBin) {
          setPlace((p) => {
            const n = { ...p };
            delete n[it.idx];
            return n;
          });
        } else setSel(sel === it.idx ? null : it.idx);
      }}
      className={cn(
        'rounded-xl border-2 px-3 py-2 text-sm font-bold transition active:scale-95',
        bad.includes(it.idx)
          ? 'border-rose-400 bg-rose-500/20 animate-shake'
          : solved
            ? 'border-emerald-400 bg-emerald-400/15'
            : sel === it.idx
              ? kids
                ? 'border-orange-400 bg-orange-100 -translate-y-1 shadow-lg'
                : 'border-amber-300 bg-amber-300/20 -translate-y-1 shadow-lg'
              : kids
                ? 'border-sky-200 bg-white'
                : 'border-white/15 bg-white/5',
      )}
    >
      {it.e && <Glyph value={it.e} size={20} className="ml-1 inline-block" />}
      {it.t}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {q.bins.map((b, bi) => (
          <div
            key={bi}
            onClick={() => drop(bi as 0 | 1)}
            className={cn(
              'min-h-36 cursor-pointer rounded-2xl border-2 border-dashed p-3 transition',
              sel !== null ? (kids ? 'border-orange-400 bg-orange-50' : 'border-amber-300/70 bg-amber-300/5') : kids ? 'border-sky-300 bg-white/70' : 'border-white/15 bg-white/[0.02]',
            )}
          >
            <div className={cn('mb-2 text-center text-xs font-extrabold leading-5', bi === 0 ? (kids ? 'text-emerald-600' : 'text-emerald-300') : kids ? 'text-violet-600' : 'text-violet-300')}>{b}</div>
            <div className="flex flex-wrap justify-center gap-1.5">{items.filter((it) => place[it.idx] === bi).map((it) => chip(it, true))}</div>
          </div>
        ))}
      </div>
      {pool.length > 0 && (
        <div className={cn('rounded-2xl p-3', kids ? 'bg-sky-50' : 'bg-white/[0.03]')}>
          <div className={cn('mb-2 text-center text-[11px]', kids ? 'text-slate-500' : 'text-slate-400')}>یک مورد را انتخاب کنید، سپس روی دستهٔ درست بزنید</div>
          <div className="flex flex-wrap justify-center gap-2">{pool.map((it) => chip(it, false))}</div>
        </div>
      )}
      {!solved && pool.length === 0 && bad.length === 0 && (
        <Btn variant={kids ? 'kids' : 'green'} className="w-full" onClick={check}>
          بررسی
        </Btn>
      )}
    </div>
  );
}

// ————— ترتیب —————
function OrderQ({ q, kids, onResult, solved }: { q: Extract<Question, { kind: 'order' }>; kids?: boolean; onResult: ResultFn; solved: boolean }) {
  const initial = useMemo(() => {
    let s = shuffle(q.items.map((t, idx) => ({ t, idx })));
    if (s.every((x, k) => x.idx === k) && s.length > 1) s = s.reverse();
    return s;
  }, [q]);
  const [seq, setSeq] = useState<number[]>([]);
  const [bad, setBad] = useState(false);
  const pool = initial.filter((x) => !seq.includes(x.idx));

  const add = (idx: number) => {
    if (solved || bad) return;
    const n = [...seq, idx];
    setSeq(n);
    if (n.length === q.items.length) {
      if (n.every((x, k) => x === k)) onResult(true);
      else {
        setBad(true);
        onResult(false);
        setTimeout(() => {
          let keep = 0;
          while (keep < n.length && n[keep] === keep) keep++;
          setSeq(n.slice(0, keep));
          setBad(false);
        }, 1000);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className={cn('min-h-24 space-y-2 rounded-2xl border-2 border-dashed p-3', kids ? 'border-sky-300 bg-white/70' : 'border-white/15 bg-white/[0.02]')}>
        {seq.length === 0 && <div className={cn('py-6 text-center text-xs', kids ? 'text-slate-400' : 'text-slate-500')}>موارد را به ترتیب انتخاب کنید</div>}
        {seq.map((idx, k) => (
          <button
            key={idx}
            disabled={solved || bad}
            onClick={() => setSeq(seq.filter((x) => x !== idx))}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-right text-[15px] leading-7 animate-pop',
              solved ? 'border-emerald-400 bg-emerald-400/15' : bad && idx !== k ? 'border-rose-400 bg-rose-500/15 animate-shake' : kids ? 'border-orange-200 bg-orange-50' : 'border-amber-300/30 bg-amber-300/5',
            )}
          >
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black', kids ? 'bg-orange-400 text-white' : 'bg-amber-300 text-slate-900')}>{k + 1}</span>
            <span className="flex-1">{q.items[idx]}</span>
          </button>
        ))}
      </div>
      {pool.length > 0 && (
        <div className="grid gap-2">
          {pool.map((x) => (
            <button
              key={x.idx}
              onClick={() => add(x.idx)}
              className={cn(
                'rounded-xl border-2 px-4 py-2.5 text-right text-[15px] leading-7 transition active:scale-[0.98]',
                kids ? 'border-sky-200 bg-white hover:bg-sky-50' : 'border-white/10 bg-white/[0.04] hover:border-amber-300/40',
              )}
            >
              {x.t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ————— جفت‌سازی —————
function MatchQ({ q, kids, onResult, solved }: { q: Extract<Question, { kind: 'match' }>; kids?: boolean; onResult: ResultFn; solved: boolean }) {
  const left = useMemo(() => shuffle(q.pairs.map((p, idx) => ({ t: p[0], idx }))), [q]);
  const right = useMemo(() => shuffle(q.pairs.map((p, idx) => ({ t: p[1], idx }))), [q]);
  const [sl, setSl] = useState<number | null>(null);
  const [sr, setSr] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [flash, setFlash] = useState<[number, number] | null>(null);

  const tryPair = (l: number | null, r: number | null) => {
    if (l === null || r === null) return;
    if (l === r) {
      const n = [...done, l];
      setDone(n);
      setSl(null);
      setSr(null);
      if (n.length === q.pairs.length) onResult(true);
    } else {
      setFlash([l, r]);
      onResult(false);
      setTimeout(() => {
        setFlash(null);
        setSl(null);
        setSr(null);
      }, 700);
    }
  };

  const cls = (active: boolean, isDone: boolean, isBad: boolean) =>
    cn(
      'w-full rounded-xl border-2 px-3 py-2.5 text-right text-sm leading-6 transition active:scale-[0.98]',
      isDone
        ? 'border-emerald-400 bg-emerald-400/15 opacity-80'
        : isBad
          ? 'border-rose-400 bg-rose-500/15 animate-shake'
          : active
            ? kids
              ? 'border-orange-400 bg-orange-100'
              : 'border-amber-300 bg-amber-300/15'
            : kids
              ? 'border-sky-200 bg-white'
              : 'border-white/10 bg-white/[0.04]',
    );

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        {left.map((x) => (
          <button
            key={x.idx}
            disabled={solved || done.includes(x.idx) || !!flash}
            onClick={() => {
              setSl(x.idx);
              tryPair(x.idx, sr);
            }}
            className={cls(sl === x.idx, done.includes(x.idx), flash?.[0] === x.idx)}
          >
            <span className="font-bold">{x.t}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {right.map((x) => (
          <button
            key={x.idx}
            disabled={solved || done.includes(x.idx) || !!flash}
            onClick={() => {
              setSr(x.idx);
              tryPair(sl, x.idx);
            }}
            className={cls(sr === x.idx, done.includes(x.idx), flash?.[1] === x.idx)}
          >
            {x.t}
          </button>
        ))}
      </div>
    </div>
  );
}
