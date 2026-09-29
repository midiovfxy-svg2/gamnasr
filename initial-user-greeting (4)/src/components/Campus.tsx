import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Degree, Lesson, Traveler } from '../data/types';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { faNum, studentNo, type Profile } from '../lib/storage';
import type { Voice } from '../lib/voices';
import { cn } from '../utils/cn';
import { BlessingsGame, DailyProgram, RepeatBelief } from './Activities';
import { Btn, FreqMeter, QuoteCard, SourceTag, Stars, VoicePlayer } from './ui';

type Tab = 'map' | 'travelers' | 'practice' | 'certs';

const DEG_STYLE: Record<Degree['color'], { ring: string; chip: string; grad: string }> = {
  emerald: { ring: 'ring-emerald-400', chip: 'bg-emerald-400/15 text-emerald-400', grad: 'from-emerald-400 to-teal-500' },
  sky: { ring: 'ring-sky-400', chip: 'bg-sky-400/15 text-sky-400', grad: 'from-sky-400 to-indigo-500' },
  amber: { ring: 'ring-amber-300', chip: 'bg-amber-300/15 text-amber-400', grad: 'from-amber-300 to-orange-500' },
};

const ZIG = [0, 56, 84, 56, 0, -56, -84, -56];

export function Campus({
  profile,
  degrees,
  homeVoices,
  onOpenLesson,
  onOpenTraveler,
  onShowCert,
  onSwitch,
  onOpenAdmin,
  onOpenAccount,
  onOpenLibrary,
  onToast,
  onCollect,
  onToggleDaily,
  onRepeat,
}: {
  profile: Profile;
  degrees: Degree[];
  homeVoices: Voice[];
  onOpenLesson: (id: string) => void;
  onOpenTraveler: (t: Traveler, lessonId: string) => void;
  onShowCert: (degreeId: string) => void;
  onSwitch: () => void;
  onOpenAdmin: () => void;
  onOpenAccount: () => void;
  onOpenLibrary: () => void;
  onToast: (node: ReactNode) => void;
  onCollect: (t: string) => void;
  onToggleDaily: (id: string) => void;
  onRepeat: (k: string) => void;
}) {
  const { content } = useSite();
  const { FEELING_Q, LOCKED, MOMENTUM_Q, NOOR } = content.library;
  const kids = profile.track === 'kids';
  const [tab, setTab] = useState<Tab>('map');
  const [practice, setPractice] = useState<'blessings' | 'daily' | 'repeat'>('blessings');
  const all: { l: Lesson; d: Degree }[] = degrees.flatMap((d) => d.lessons.map((l) => ({ l, d })));
  const firstOpen = all.findIndex((x) => !profile.progress[x.l.id]?.done);
  const currentIdx = firstOpen === -1 ? all.length - 1 : firstOpen;
  const doneCount = all.filter((x) => profile.progress[x.l.id]?.done).length;
  const orbit = doneCount + 1;
  const curRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (tab === 'map') {
      const timer = setTimeout(() => curRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      return () => clearTimeout(timer);
    }
  }, [tab]);

  const text = kids ? 'text-slate-800' : 'text-slate-100';
  const muted = kids ? 'text-slate-500' : 'text-slate-400';
  const card = kids ? 'bg-white/90 border-sky-200 shadow-sm' : 'bg-white/[0.04] border-white/10';

  const travelers = all.filter((x) => x.l.traveler).map((x) => ({ t: x.l.traveler!, l: x.l, d: x.d }));

  return (
    <div className={cn('mx-auto min-h-screen max-w-2xl pb-28', text)}>
      {/* ——— HUD ——— */}
      <div className={cn('sticky top-0 z-30 border-b px-4 pb-3 pt-3 backdrop-blur-md', kids ? 'border-sky-200 bg-sky-50/85' : 'border-white/10 bg-[#0a0f24]/80')}>
        <div className="flex items-center gap-3">
          <button onClick={onOpenAccount} title={content.settings.labels.account} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-black', kids ? 'bg-gradient-to-br from-orange-400 to-pink-500 text-white' : 'bg-gradient-to-br from-amber-300 to-yellow-600 text-slate-900')}>
            <Glyph value={content.settings.icons.account} size={22} />
          </button>
          <button onClick={onOpenAccount} className="min-w-0 flex-1 text-right" title="حساب، موبایل و ارتباط با ما">
            <div className="truncate font-black">{profile.name}</div>
            <div className={cn('text-[11px]', muted)}>
              {kids ? 'ردهٔ کودکان' : 'ردهٔ بزرگسالان'} · ش.د {studentNo(profile)}
            </div>
          </button>
          <button onClick={onOpenAdmin} className={cn('grid h-10 w-10 place-items-center rounded-full', kids ? 'bg-white shadow' : 'bg-white/10')} title={content.settings.labels.admin}>
            <ShieldCheck size={18} />
          </button>
          <button onClick={onOpenLibrary} className={cn('grid h-10 w-10 place-items-center rounded-full', kids ? 'bg-white shadow' : 'bg-white/10')} title="کتابخانه باورها">
            📚
          </button>
          <button onClick={onSwitch} className={cn('grid h-10 w-10 place-items-center rounded-full', kids ? 'bg-white shadow' : 'bg-white/10')} title="تغییر دانشجو">
            ⇄
          </button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
          <button className="text-right" onClick={() => onToast(<QuoteMini q={FEELING_Q} />)}>
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
              <span className={muted}>ترس، نگرانی و خشم</span>
              <span className={kids ? 'text-orange-600' : 'text-amber-200'}>📡 فرکانس {faNum(Math.round(profile.frequency))}</span>
              <span className={muted}>امید، شادی و آرامش</span>
            </div>
            <FreqMeter value={profile.frequency} kids={kids} />
          </button>
          <button onClick={() => onToast(<QuoteMini q={MOMENTUM_Q} />)} className={cn('rounded-xl px-2.5 py-1.5 text-center text-xs font-black', kids ? 'bg-orange-100 text-orange-700' : 'bg-orange-400/15 text-orange-300')}>
            🔥 {faNum(profile.momentum)}
            <div className="text-[9px] font-bold opacity-70">مومنتوم</div>
          </button>
          <div className={cn('rounded-xl px-2.5 py-1.5 text-center text-xs font-black', kids ? 'bg-sky-100 text-sky-700' : 'bg-sky-400/15 text-sky-300')}>
            🪐 {faNum(orbit)}
            <div className="text-[9px] font-bold opacity-70">مدار</div>
          </div>
        </div>
      </div>

      {/* ——— نقشهٔ مدارها ——— */}
      {tab === 'map' && (
        <div className="px-4 pt-5">
          <div className="mb-6 text-center">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[radial-gradient(circle,#fff7d6_0%,#fcd34d_45%,transparent_70%)] animate-float">
              <Glyph value={content.settings.icons.light} size={31} />
            </div>
            <p className={cn('quran -mt-2 text-2xl', kids ? 'text-amber-700' : 'text-amber-100')}>{NOOR.t}</p>
            <SourceTag s={NOOR.s} kids={kids} />
          </div>

          {homeVoices.length > 0 && (
            <div className="mb-6 space-y-2">
              {homeVoices.map((v) => (
                <VoicePlayer key={v.id} voice={v} kids={kids} />
              ))}
            </div>
          )}

          {[...degrees].reverse().map((d) => {
            const st = DEG_STYLE[d.color];
            const dDone = d.lessons.filter((l) => profile.progress[l.id]?.done).length;
            const earned = profile.certs[d.id];
            return (
              <section key={d.id} className="mb-8">
                <div className={cn('relative overflow-hidden rounded-3xl border p-4', card)}>
                  <div className={cn('absolute -left-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-md', st.grad)} />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-lg font-black"><Glyph value={d.icon || 'icon:graduation'} size={23} />{d.name}</div>
                      <div className={cn('mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold', st.chip)}>{d.rankLine}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-2xl font-black">
                        {faNum(dDone)}/{faNum(d.lessons.length)}
                      </div>
                      {earned ? (
                        <button onClick={() => onShowCert(d.id)} className="text-xs font-bold text-emerald-400 underline">
                          📜 مشاهده مدرک
                        </button>
                      ) : (
                        <SourceTag s="k1" kids={kids} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative mt-4 flex flex-col-reverse items-center gap-5">
                  {d.lessons.map((l) => {
                    const idx = all.findIndex((x) => x.l.id === l.id);
                    const p = profile.progress[l.id];
                    const locked = idx > currentIdx;
                    const isCur = idx === currentIdx && !p?.done;
                    return (
                      <div key={l.id} className="flex flex-col items-center" style={{ transform: `translateX(${ZIG[idx % ZIG.length]}px)` }}>
                        <button
                          ref={isCur ? curRef : undefined}
                          onClick={() => (locked ? onToast(<QuoteMini q={LOCKED} />) : onOpenLesson(l.id))}
                          className={cn(
                            'relative grid h-20 w-20 place-items-center rounded-full text-3xl transition active:scale-90',
                            locked
                              ? kids
                                ? 'bg-slate-200 grayscale'
                                : 'bg-slate-700/50 grayscale'
                              : p?.done
                                ? cn('bg-gradient-to-br shadow-xl ring-4', st.grad, st.ring)
                                : cn('bg-gradient-to-br from-amber-200 to-yellow-400 shadow-xl animate-glow ring-4 ring-amber-200/60'),
                          )}
                        >
                          <span className="absolute inset-[-10px] rounded-full border border-dashed border-current opacity-20" />
                           <Glyph value={locked ? content.settings.icons.locked : l.icon} size={30} />
                          {l.traveler && (
                            <span className={cn('absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-full text-lg shadow', kids ? 'bg-white' : 'bg-slate-800')}>
                              <Glyph value={p?.traveler ? content.settings.icons.complete : l.traveler.avatar} size={19} />
                            </span>
                          )}
                          <span className={cn('absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full text-[10px] font-black', kids ? 'bg-white text-slate-700' : 'bg-slate-900 text-amber-200')}>
                            {faNum(idx + 1)}
                          </span>
                        </button>
                        <div className={cn('mt-2 max-w-40 text-center text-xs font-bold leading-5', locked ? muted : '')}>{l.title}</div>
                        {p?.done && <Stars n={p.stars} size="text-sm" />}
                        {isCur && <div className={cn('mt-1 rounded-full px-2 py-0.5 text-[10px] font-black', kids ? 'bg-orange-400 text-white' : 'bg-amber-300 text-slate-900')}>مدار فعلی</div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <div className={cn('pb-6 text-center text-xs', muted)}>⬆ مسیر از پایین به بالا — مدار به مدار</div>
        </div>
      )}

      {/* ——— رهروان ——— */}
      {tab === 'travelers' && (
        <div className="space-y-3 px-4 pt-5">
          <h3 className="text-lg font-black">🚶 رهروان</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {travelers.map(({ t, l, d }) => {
              const p = profile.progress[l.id];
              const state = p?.traveler ? 'done' : p?.done ? 'ready' : 'locked';
              return (
                <button
                  key={t.id}
                  disabled={state === 'locked'}
                  onClick={() => onOpenTraveler(t, l.id)}
                  className={cn('flex items-center gap-3 rounded-3xl border p-3 text-right transition active:scale-[0.98] disabled:opacity-60', card)}
                >
                  <div className={cn('grid h-16 w-16 shrink-0 place-items-center rounded-full text-4xl', state === 'done' ? 'bg-gradient-to-br from-amber-200 to-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.5)]' : kids ? 'bg-sky-100' : 'bg-slate-700/60')}>
                    <Glyph value={state === 'locked' ? content.settings.icons.locked : t.avatar} size={38} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black">{t.name}</div>
                    <div className={cn('text-xs leading-5', muted)}>مانع: {t.obstacleTitle}</div>
                    <div className={cn('mt-1 text-[11px] font-bold', state === 'done' ? 'text-emerald-400' : state === 'ready' ? (kids ? 'text-orange-500' : 'text-amber-300') : muted)}>
                      {state === 'done' ? '✨ تسلیم · مدار بالاتر' : state === 'ready' ? '▶ آمادهٔ همراهی' : `🔒 ${d.name} · ${l.title}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ——— تمرین روزانه ——— */}
      {tab === 'practice' && (
        <div className="space-y-4 px-4 pt-5">
          <div className={cn('grid grid-cols-3 gap-1 rounded-2xl p-1', kids ? 'bg-white shadow-sm' : 'bg-white/5')}>
            {(
              [
                ['blessings', '🤲 نعمت‌ها'],
                ['daily', '🎯 برنامه روزانه'],
                ['repeat', '🔁 تکرار باور'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPractice(k)}
                className={cn('rounded-xl py-2 text-xs font-black transition', practice === k ? (kids ? 'bg-orange-400 text-white' : 'bg-amber-300 text-slate-900') : '')}
              >
               {content.settings.labels[k] || label}
              </button>
            ))}
          </div>
          {practice === 'blessings' && <BlessingsGame kids={kids} collected={profile.blessings} onCollect={onCollect} />}
          {practice === 'daily' && <DailyProgram kids={kids} profile={profile} onToggle={onToggleDaily} />}
          {practice === 'repeat' && <RepeatBelief kids={kids} profile={profile} onRepeat={onRepeat} />}
        </div>
      )}

      {/* ——— مدارک ——— */}
      {tab === 'certs' && (
        <div className="space-y-3 px-4 pt-5">
          <h3 className="text-lg font-black">📜 مدارک</h3>
          {degrees.map((d) => {
            const earned = profile.certs[d.id];
            const st = DEG_STYLE[d.color];
            return (
              <div key={d.id} className={cn('flex items-center gap-3 rounded-3xl border p-4', card, !earned && 'opacity-60')}>
                <div className={cn('grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-2xl', earned ? st.grad : 'from-slate-500 to-slate-700')}>{earned ? '🎓' : '🔒'}</div>
                <div className="flex-1">
                  <div className="font-black">{d.name}</div>
                  <div className={cn('text-xs', muted)}>{d.rankLine}</div>
                </div>
                {earned ? (
                  <Btn variant={kids ? 'kids' : 'gold'} onClick={() => onShowCert(d.id)}>
                    مشاهده
                  </Btn>
                ) : (
                  <span className={cn('text-xs', muted)}>
                    {faNum(d.lessons.filter((l) => profile.progress[l.id]?.done).length)}/{faNum(d.lessons.length)}
                  </span>
                )}
              </div>
            );
          })}
          <QuoteCard q={LOCKED} kids={kids} />
        </div>
      )}

      {/* ——— نوار پایین ——— */}
      <nav className={cn('fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md', kids ? 'border-sky-200 bg-white/90' : 'border-white/10 bg-[#0a0f24]/90')}>
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {(
            [
              ['map', '🪐', 'مسیر تکامل'],
              ['travelers', '🚶', 'رهروان'],
              ['practice', '🤲', 'تمرین'],
              ['certs', '📜', 'مدارک'],
            ] as const
          ).map(([k, ic, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition', tab === k ? (kids ? 'text-orange-500' : 'text-amber-300') : muted)}>
              <span className={cn('text-xl transition', tab === k && '-translate-y-0.5 scale-110')}><Glyph value={content.settings.icons[k] || ic} size={22} /></span>
              {content.settings.labels[k] || label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function QuoteMini({ q }: { q: { t: string; s: import('../data/types').Src } }) {
  return (
    <div>
      <p className="whitespace-pre-line leading-7">{q.t}</p>
      <div className="mt-1 flex justify-end">
        <SourceTag s={q.s} />
      </div>
    </div>
  );
}
