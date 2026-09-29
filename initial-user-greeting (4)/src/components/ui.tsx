import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { type Quote, type Src } from '../data/types';
import { useAsset, useSite } from '../lib/SiteContext';
import { voiceSrc, type Voice } from '../lib/voices';
import { cn } from '../utils/cn';
import { faNum } from '../lib/storage';

export function SourceTag({ s, kids }: { s: Src; kids?: boolean }) {
  const { content } = useSite();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        kids ? 'bg-amber-100 text-amber-800' : 'bg-white/5 text-amber-200/70',
      )}
      title="منبع: مخزن midiovfxy-svg2/nasr"
    >
      📜 {content.sources[s] || s}
    </span>
  );
}

export function QuoteCard({ q, kids, className, big }: { q: Quote; kids?: boolean; className?: string; big?: boolean }) {
  if (q.ar) {
    return (
      <div
        className={cn(
          'rounded-2xl border px-4 py-4 text-center animate-pop',
          kids ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300/30 bg-gradient-to-b from-amber-200/10 to-transparent',
          className,
        )}
      >
        <p dir="rtl" className={cn('quran whitespace-pre-line', big ? 'text-3xl' : 'text-2xl', kids ? 'text-emerald-800' : 'text-amber-100')}>
          {q.t}
        </p>
        <div className="mt-2">
          <SourceTag s={q.s} kids={kids} />
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3.5 animate-pop',
        kids ? 'border-sky-200 bg-white text-slate-800 shadow-sm' : 'border-white/10 bg-white/[0.04] text-slate-100',
        className,
      )}
    >
      <p className={cn('whitespace-pre-line leading-8', big ? 'text-lg' : 'text-[15px]')}>{q.t}</p>
      <div className="mt-2 flex justify-end">
        <SourceTag s={q.s} kids={kids} />
      </div>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' | 'green' | 'red' | 'kids' | 'kidsGhost' };
export function Btn({ variant = 'gold', className, ...p }: BtnProps) {
  const v = {
    gold: 'site-primary-button text-slate-900 shadow-lg shadow-amber-500/20 hover:brightness-105',
    ghost: 'bg-white/5 text-slate-100 border border-white/10 hover:bg-white/10',
    green: 'bg-gradient-to-l from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:brightness-105',
    red: 'bg-rose-500/90 text-white hover:bg-rose-500',
    kids: 'bg-gradient-to-l from-orange-400 to-pink-500 text-white shadow-lg shadow-pink-400/30 hover:brightness-105',
    kidsGhost: 'bg-white text-slate-700 border-2 border-sky-200 hover:bg-sky-50',
  }[variant];
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        v,
        className,
      )}
    />
  );
}

export function Modal({ open, onClose, title, children, kids, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; kids?: boolean; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'scroll-thin max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-5 animate-pop sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          kids ? 'bg-gradient-to-b from-sky-50 to-amber-50 text-slate-800' : 'border border-white/10 bg-[#111733] text-slate-100',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button onClick={onClose} className={cn('grid h-9 w-9 place-items-center rounded-full text-lg', kids ? 'bg-white' : 'bg-white/10')} aria-label="بستن">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stars({ n, size = 'text-base' }: { n: number; size?: string }) {
  return (
    <span className={cn('tracking-tight', size)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'text-yellow-400' : 'text-slate-500/40'}>
          ★
        </span>
      ))}
    </span>
  );
}

export function FreqMeter({ value, kids }: { value: number; kids?: boolean }) {
  return (
    <div className="w-full">
      <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full', kids ? 'bg-sky-100' : 'bg-white/10')}>
        <div
          className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-rose-400 via-amber-300 to-emerald-400 transition-all duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ——— پخش‌کنندهٔ صدای استاد ———
let currentAudio: HTMLAudioElement | null = null;
const fmt = (s: number) => {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${faNum(m)}:${r < 10 ? '۰' : ''}${faNum(r)}`;
};

export function VoicePlayer({ voice, kids, compact }: { voice: Voice; kids?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState(() => voiceSrc(voice));
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setSrc(voiceSrc(voice));
    setErr(false);
    setPlaying(false);
    setT(0);
    setD(0);
  }, [voice]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      if (currentAudio && currentAudio !== a) currentAudio.pause();
      currentAudio = a;
      a.play().catch(() => setErr(true));
    } else a.pause();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-2.5',
        kids ? 'border-pink-200 bg-white' : 'border-amber-300/20 bg-amber-300/[0.06]',
      )}
    >
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setD(e.currentTarget.duration)}
        onError={() => {
          if (voice.fallback && src !== voice.fallback) setSrc(voice.fallback);
          else setErr(true);
        }}
      />
      <button
        onClick={toggle}
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg transition active:scale-90',
          kids ? 'bg-gradient-to-br from-orange-400 to-pink-500 text-white' : 'bg-gradient-to-br from-amber-300 to-yellow-500 text-slate-900',
        )}
        aria-label={playing ? 'توقف' : 'پخش'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-xs font-bold', kids ? 'text-slate-700' : 'text-amber-100')}>🎧 {voice.name}</div>
        {!compact && (
          <div
            className={cn('mt-1.5 h-1.5 cursor-pointer overflow-hidden rounded-full', kids ? 'bg-pink-100' : 'bg-white/10')}
            onClick={(e) => {
              const a = ref.current;
              if (!a || !d) return;
              const r = e.currentTarget.getBoundingClientRect();
              a.currentTime = ((r.right - e.clientX) / r.width) * d;
            }}
          >
            <div className={cn('h-full rounded-full', kids ? 'bg-pink-400' : 'bg-amber-300')} style={{ width: d ? `${(t / d) * 100}%` : '0%' }} />
          </div>
        )}
        <div className={cn('mt-1 text-[10px]', kids ? 'text-slate-500' : 'text-slate-400')}>
          {err ? 'پخش ممکن نشد — فایل را در «مدیریت صدای استاد» با قالب mp3 بارگذاری کنید' : `${fmt(t)} / ${fmt(d)}`}
        </div>
      </div>
    </div>
  );
}

export function Toast({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 4200);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div className="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <div className="max-w-md rounded-2xl border border-amber-300/30 bg-[#1a2147]/95 px-4 py-3 text-sm text-amber-50 shadow-2xl backdrop-blur animate-pop">
        {children}
      </div>
    </div>
  );
}

export function StarsBg() {
  const { content } = useSite();
  const backgroundImage = useAsset(content.settings.backgroundImage);
  const stars = useRef(
    Array.from({ length: 60 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: Math.random() * 2 + 0.5,
      d: Math.random() * 3,
    })),
  ).current;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at top, color-mix(in srgb, ${content.settings.background} 65%, #5672b8) 0%, ${content.settings.background} 65%)` }} />
      {backgroundImage && /^(https?:\/\/|blob:|\/api\/)/.test(backgroundImage) && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
      {stars.map((st, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }}
        />
      ))}
      <svg className="absolute left-1/2 top-[-30vh] h-[120vh] w-[120vh] -translate-x-1/2 animate-spin-slow opacity-[0.07]" viewBox="0 0 200 200">
        {[20, 35, 50, 65, 80, 95].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#e7c46a" strokeWidth="0.4" strokeDasharray="2 3" />
        ))}
      </svg>
    </div>
  );
}

export function KidsBg() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-sky-200 via-sky-100 to-amber-50">
      <div className="absolute -right-10 top-10 h-40 w-40 rounded-full bg-yellow-300/70 blur-xl" />
      <div className="absolute left-6 top-24 text-6xl opacity-60 animate-float">☁️</div>
      <div className="absolute right-1/3 top-52 text-5xl opacity-50 animate-float" style={{ animationDelay: '1.5s' }}>
        ☁️
      </div>
      <div className="absolute bottom-0 h-24 w-full bg-gradient-to-t from-emerald-200/70 to-transparent" />
    </div>
  );
}
