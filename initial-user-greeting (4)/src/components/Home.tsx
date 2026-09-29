import { useState } from 'react';
import { BookOpen, KeyRound, MessageSquare, ShieldCheck } from 'lucide-react';
import type { Track } from '../data/types';
import { faNum, type AppState, type Profile } from '../lib/storage';
import type { Voice } from '../lib/voices';
import { cn } from '../utils/cn';
import { Btn, QuoteCard, SourceTag, VoicePlayer } from './ui';
import { useSite } from '../lib/SiteContext';
import { publishedDegrees } from '../lib/content';
import { restoreProfile } from '../lib/service';
import { AButton, AdminDialog, ErrorNotice, Field, Glyph } from '../admin/kit';

export function Home({
  state,
  homeVoices,
  onSelect,
  onCreate,
  onOpenAdmin,
  onOpenAccount,
  onOpenContact,
  onOpenLibrary,
  onRestored,
}: {
  state: AppState;
  homeVoices: Voice[];
  onSelect: (id: string) => void;
  onCreate: (name: string, track: Track) => Promise<void>;
  onOpenAdmin: () => void;
  onOpenAccount: () => void;
  onOpenContact: () => void;
  onOpenLibrary: () => void;
  onRestored: (profile: Profile) => void;
}) {
  const { content, mode } = useSite();
  const { settings } = content;
  const { MAHJOOR } = content.library;
  const ADULT = publishedDegrees(content.adult);
  const KIDS = publishedDegrees(content.kids);
  const [name, setName] = useState('');
  const [track, setTrack] = useState<Track>('adult');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [recovery, setRecovery] = useState('');

  const total = (t: Track) => (t === 'kids' ? KIDS : ADULT).reduce((a, d) => a + d.lessons.length, 0);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-8 text-slate-100">
      <nav className="site-utility-nav" aria-label="حساب و مدیریت">
        <div><button onClick={onOpenAccount}><Glyph value={settings.icons.account} size={15} />{settings.labels.account}</button><button onClick={onOpenContact}><MessageSquare size={15} />{settings.contactTitle}</button></div>
        <button className="site-admin-link" onClick={onOpenAdmin}><ShieldCheck size={15} />{settings.labels.admin}</button>
      </nav>
      {/* نشان */}
      <div className="text-center">
        <div className="relative mx-auto grid h-36 w-36 place-items-center">
          {[1, 2, 3].map((r) => (
            <div key={r} className="absolute rounded-full border border-amber-300/40" style={{ width: r * 46, height: r * 46 }} />
          ))}
          <div className="absolute h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" style={{ transform: 'translate(46px,-40px)' }} />
          <div className="absolute h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_12px_#38bdf8]" style={{ transform: 'translate(-58px,20px)' }} />
          <div className="grid h-14 w-14 place-items-center rounded-full text-slate-900 shadow-[0_0_40px_rgba(250,204,21,0.25)]" style={{ background: settings.accent }}><Glyph value={settings.logo} size={29} /></div>
        </div>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl" style={{ color: settings.accent }}>{settings.title}</h1>
        <p className="mt-2 text-sm text-amber-100/80">{settings.teacher}</p>
        <p className="text-xs text-slate-400">{settings.subtitle}</p>
      </div>

      <div className="mt-6 space-y-2">
        {MAHJOOR.map((q, k) => (
          <QuoteCard key={k} q={q} big={k === 0} />
        ))}
      </div>

      {homeVoices.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-xs font-extrabold text-amber-200">🎧 صدای استاد</div>
          {homeVoices.map((v) => (
            <VoicePlayer key={v.id} voice={v} />
          ))}
        </div>
      )}

      {/* مراتب یقین = مقاطع دانشگاه */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-black text-amber-100">مسیر تکامل دانشجو: مرحله به مرحله</div>
          <SourceTag s="k1" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {ADULT.map((d, k) => (
            <div key={d.id} className="relative rounded-2xl bg-white/5 p-3" style={{ marginTop: Math.max(0, (2 - k) * 14) }}>
              <div className="flex justify-center"><Glyph value={d.icon || ['icon:leaf', 'icon:graduation', 'icon:gem'][k % 3]} size={27} /></div>
              <div className="mt-1 text-sm font-black">{d.name}</div>
              <div className="mt-1 text-[11px] font-bold leading-5 text-amber-200">{d.rankLine}</div>
            </div>
          ))}
        </div>
      </div>

      {/* دانشجویان */}
      {state.profiles.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-sm font-black">حساب‌های شما در این دستگاه</div>
          <div className="space-y-2">
            {state.profiles.map((p) => {
              const done = Object.values(p.progress).filter((x) => x.done).length;
              const tot = total(p.track);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className={cn('grid h-11 w-11 place-items-center rounded-xl text-xl', p.track === 'kids' ? 'bg-gradient-to-br from-orange-400 to-pink-500' : 'bg-gradient-to-br from-amber-300 to-yellow-600')}>
                    {p.track === 'kids' ? '🧒' : '🎓'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-black">{p.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {p.track === 'kids' ? 'کودکان' : 'بزرگسالان'} · {faNum(done)} از {faNum(tot)} درس · 🪐 مدار {faNum(done + 1)}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-emerald-400" style={{ width: `${tot ? Math.min(100, done / tot * 100) : 0}%` }} />
                    </div>
                  </div>
                  <Btn onClick={() => onSelect(p.id)}>ادامه</Btn>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ثبت‌نام */}
      {settings.registration && <div className="mt-6 rounded-3xl border border-amber-300/20 bg-gradient-to-b from-amber-300/[0.07] to-transparent p-4">
        <div className="mb-3 text-sm font-black text-amber-100">{settings.labels.registration}</div>
        {error && !restoring && <div role="alert" className="mb-3 text-sm text-rose-300">{error}</div>}
        <input
          id="student-name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام دانشجو"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ['kids', '👧', 'کودکان', 'بازی تصویری و جمله‌های کوتاه'],
              ['adult', '🧑', 'بزرگسالان', 'متن کامل باورها'],
            ] as const
          ).map(([k, e, l, sub]) => (
            <button
              key={k}
              onClick={() => setTrack(k)}
              className={cn(
                'rounded-2xl border-2 p-3 text-center transition active:scale-95',
                track === k ? (k === 'kids' ? 'border-pink-400 bg-pink-400/15' : 'border-amber-300 bg-amber-300/15') : 'border-white/10 bg-white/[0.03]',
              )}
            >
              <div className="flex justify-center"><Glyph value={settings.icons[k === 'kids' ? 'children' : 'adults'] || e} size={30} /></div>
              <div className="mt-1 font-black">{settings.labels[k === 'kids' ? 'children' : 'adults'] || l}</div>
              <div className="text-[10px] text-slate-400">{sub}</div>
            </button>
          ))}
        </div>
        <Btn
          className="mt-3 w-full py-3.5 text-base"
          disabled={!name.trim() || busy || mode === 'checking'}
          onClick={async () => {
            setBusy(true); setError('');
            try { await onCreate(name, track); setName(''); }
            catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }}
        >
          {busy ? 'در حال ثبت‌نام...' : settings.labels.start}
        </Btn>
      </div>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="ghost" onClick={() => { setError(''); setRestoring(true); }}>
          <KeyRound size={17} />ورود با کد بازیابی
        </Btn>
        <Btn variant="ghost" onClick={onOpenLibrary}>
          <BookOpen size={17} />{settings.labels.library}
        </Btn>
      </div>
      <p className="mt-6 text-center text-[11px] leading-6 text-slate-500">
        {settings.footer}
      </p>
      {restoring && <AdminDialog title="ورود با کد بازیابی حساب" description="کدی که در حساب شخصی ذخیره کرده‌اید را وارد کنید." onClose={() => setRestoring(false)}><ErrorNotice error={error} />{mode !== 'server' && <p className="a-warning">ورود بین دستگاه‌ها نیازمند اجرای سرور است. حساب‌های فعلی شما در همین مرورگر قابل ادامه هستند.</p>}<Field label="کد بازیابی"><textarea dir="ltr" value={recovery} onChange={e => setRecovery(e.target.value)} /></Field><div className="a-form-actions"><AButton busy={busy} disabled={!recovery.trim() || mode !== 'server'} onClick={async () => { setError(''); setBusy(true); try { const p = await restoreProfile(recovery); onRestored(p); setRestoring(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>ورود به حساب</AButton></div></AdminDialog>}
    </div>
  );
}
