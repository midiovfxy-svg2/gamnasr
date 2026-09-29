import { useMemo, useState } from 'react';
import type { Traveler } from '../data/types';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { shuffle } from '../lib/storage';
import { cn } from '../utils/cn';
import { Btn, QuoteCard, SourceTag } from './ui';

// مراحل سیر تکاملی رهرو (همه با واژه‌های استاد)
const STAGES = ['مانع ذهنی', 'نجواي شيطان و نداي خداوند', 'باور', 'تسلیم', 'مدار بالاتر'];
const MOODS = ['😔', '😟', '🤔', '🙂', '😊'];

export function TravelerStory({ t, kids, onDone }: { t: Traveler; kids?: boolean; onDone: () => void }) {
  const { FALL, HIGHER, NO_GUILT, REPENT, REPENT_LABEL, SURRENDER, TWO_VOICES } = useSite().content.library;
  const [stage, setStage] = useState(0);
  const [fell, setFell] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [beliefOk, setBeliefOk] = useState(false);
  const beliefs = useMemo(() => shuffle(t.beliefs), [t]);
  const sides = useMemo(() => (Math.random() > 0.5 ? ['w', 'c'] : ['c', 'w']), []);

  const panel = kids ? 'bg-white border-sky-200' : 'bg-white/[0.04] border-white/10';

  return (
    <div className="space-y-4">
      {/* هدر رهرو */}
      <div className={cn('flex items-center gap-4 rounded-3xl border p-4', panel)}>
        <div className="relative">
          <div
            className={cn(
              'grid h-20 w-20 place-items-center rounded-full text-5xl transition-all duration-700',
              stage >= 3 ? 'bg-gradient-to-br from-amber-200 to-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)]' : kids ? 'bg-sky-100' : 'bg-slate-700/60',
            )}
          >
            <Glyph value={t.avatar} size={46} />
          </div>
          <span className="absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-full bg-white text-lg shadow">{fell ? '😣' : MOODS[Math.min(stage + (beliefOk ? 1 : 0), 4)]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-xs', kids ? 'text-slate-500' : 'text-slate-400')}>رهرو</div>
          <div className="text-xl font-black">{t.name}</div>
          <div className={cn('mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold', stage >= 3 ? 'bg-emerald-400/20 text-emerald-500' : 'bg-rose-400/15 text-rose-400')}>
            {stage >= 3 ? '✨ تسلیم' : `مانع: ${t.obstacleTitle}`}
          </div>
        </div>
      </div>

      {/* مسیر مراحل */}
      <div className="flex items-center gap-1">
        {STAGES.map((s, k) => (
          <div key={s} className="flex-1 text-center">
            <div className={cn('mx-auto h-2 rounded-full transition-all', k <= stage ? 'bg-gradient-to-l from-amber-300 to-emerald-400' : kids ? 'bg-sky-100' : 'bg-white/10')} />
            <div className={cn('mt-1 text-[9px] leading-4', k <= stage ? (kids ? 'text-slate-700' : 'text-amber-100') : kids ? 'text-slate-400' : 'text-slate-500')}>{s}</div>
          </div>
        ))}
      </div>

      {/* مرحله ۰: مانع ذهنی */}
      {stage === 0 && (
        <div className="space-y-3 animate-pop">
          <h4 className="text-sm font-extrabold text-rose-400">مانع ذهنی</h4>
          {t.obstacle.map((q, k) => (
            <QuoteCard key={k} q={q} kids={kids} />
          ))}
          <Btn variant={kids ? 'kids' : 'gold'} className="w-full" onClick={() => setStage(1)}>
            ادامه
          </Btn>
        </div>
      )}

      {/* مرحله ۱: دو صدا */}
      {stage === 1 && !fell && (
        <div className="space-y-3 animate-pop">
          <QuoteCard q={TWO_VOICES} kids={kids} />
          <p className={cn('text-center text-sm font-bold', kids ? 'text-slate-700' : 'text-amber-100')}>رهرو کدام صدا را دنبال کند؟</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {sides.map((side) =>
              side === 'w' ? (
                <button key="w" onClick={() => setFell(true)} className="rounded-2xl border-2 border-slate-600/50 bg-gradient-to-b from-slate-800 to-slate-900 p-3 text-right text-slate-200 transition hover:border-rose-400/60 active:scale-[0.98]">
                  <div className="mb-2 text-xs font-extrabold text-rose-300">🌑 نجواي شيطان</div>
                  <div className="space-y-2">
                    {t.whisper.map((q, k) => (
                      <p key={k} className={cn('whitespace-pre-line leading-7', q.ar ? 'quran text-center text-xl' : 'text-sm')}>
                        {q.t}
                      </p>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <SourceTag s={t.whisper[0].s} />
                  </div>
                </button>
              ) : (
                <button key="c" onClick={() => setStage(2)} className="rounded-2xl border-2 border-amber-300/50 bg-gradient-to-b from-amber-50 to-yellow-100 p-3 text-right text-slate-800 transition hover:border-amber-400 active:scale-[0.98]">
                  <div className="mb-2 text-xs font-extrabold text-amber-700">☀️ نداي اميد بخش خداوند</div>
                  <div className="space-y-2">
                    {t.call.map((q, k) => (
                      <p key={k} className={cn('whitespace-pre-line leading-7', q.ar ? 'quran text-center text-xl text-emerald-800' : 'text-sm')}>
                        {q.t}
                      </p>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <SourceTag s={t.call[0].s} kids />
                  </div>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* سقوط به مدار پایین‌تر و توبه */}
      {stage === 1 && fell && (
        <div className="space-y-3 animate-pop">
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3">
            <div className="mb-1 text-xs font-extrabold text-rose-400">⬇ مدار پایین‌تر</div>
            <p className={cn('whitespace-pre-line text-sm leading-7', kids ? 'text-rose-900' : 'text-rose-100')}>{FALL.t}</p>
            <div className="mt-1 flex justify-end">
              <SourceTag s={FALL.s} kids={kids} />
            </div>
          </div>
          <QuoteCard q={REPENT} kids={kids} />
          <Btn variant="green" className="w-full" onClick={() => setFell(false)}>
            🤲 {REPENT_LABEL}
          </Btn>
        </div>
      )}

      {/* مرحله ۲: انتخاب باور */}
      {stage === 2 && (
        <div className="space-y-3 animate-pop">
          <p className={cn('text-center text-sm font-bold', kids ? 'text-slate-700' : 'text-amber-100')}>کدام باور، راه عبور از این مانع است؟</p>
          <div className="grid gap-2">
            {beliefs.map((b) => {
              const isWrong = wrong.includes(b.t);
              const isOk = beliefOk && b.ok;
              return (
                <button
                  key={b.t}
                  disabled={beliefOk || isWrong}
                  onClick={() => (b.ok ? setBeliefOk(true) : setWrong((w) => [...w, b.t]))}
                  className={cn(
                    'rounded-xl border-2 px-4 py-3 text-right text-[15px] transition active:scale-[0.98]',
                    isOk ? 'border-emerald-400 bg-emerald-400/15' : isWrong ? 'border-rose-400/50 opacity-40 line-through' : kids ? 'border-sky-200 bg-white' : 'border-white/10 bg-white/[0.04] hover:border-amber-300/50',
                  )}
                >
                  💡 {b.t}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <SourceTag s={t.beliefSrc} kids={kids} />
          </div>
          {!beliefOk && wrong.length > 0 && <QuoteCard q={NO_GUILT} kids={kids} />}
          {beliefOk && (
            <div className="space-y-3">
              {t.remedy.map((q, k) => (
                <QuoteCard key={k} q={q} kids={kids} />
              ))}
              <Btn variant={kids ? 'kids' : 'gold'} className="w-full" onClick={() => setStage(3)}>
                ادامه
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* مرحله ۳: تسلیم */}
      {stage === 3 && (
        <div className="space-y-3 animate-pop">
          <h4 className="text-center text-sm font-extrabold text-emerald-400">✨ تسلیم ✨</h4>
          <QuoteCard q={SURRENDER} kids={kids} big />
          <Btn variant={kids ? 'kids' : 'gold'} className="w-full" onClick={() => setStage(4)}>
            ادامه
          </Btn>
        </div>
      )}

      {/* مرحله ۴: مدار بالاتر */}
      {stage === 4 && (
        <div className="space-y-3 animate-pop">
          <div className="relative mx-auto grid h-40 w-40 place-items-center">
            {[1, 2, 3].map((r) => (
              <div key={r} className="absolute rounded-full border border-amber-300/50 animate-glow" style={{ width: r * 48, height: r * 48, animationDelay: `${r * 0.3}s` }} />
            ))}
            <div className="text-5xl animate-float"><Glyph value={t.avatar} size={46} /></div>
          </div>
          <QuoteCard q={HIGHER} kids={kids} />
          {t.result.map((q, k) => (
            <QuoteCard key={k} q={q} kids={kids} />
          ))}
          <Btn variant="green" className="w-full py-3 text-base" onClick={onDone}>
            پایان سیر تکاملی {t.name}
          </Btn>
        </div>
      )}
    </div>
  );
}
