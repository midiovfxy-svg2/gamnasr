import type { Degree } from '../data/types';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { faDate, studentNo, type Profile } from '../lib/storage';
import { Btn, SourceTag } from './ui';

export function Certificate({ profile, degree, date, onClose }: { profile: Profile; degree: Degree; date: number; onClose: () => void }) {
  const { content } = useSite();
  const { BISMILLAH } = content.library;
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mx-auto max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="print-area relative overflow-hidden rounded-3xl bg-[#fbf5e6] p-2 text-slate-800 shadow-2xl animate-pop">
          <div className="rounded-[20px] border-[3px] border-double border-amber-600/70 p-1.5">
            <div className="relative rounded-2xl border border-amber-600/40 px-5 py-8 text-center sm:px-10">
              {['top-2 right-2', 'top-2 left-2', 'bottom-2 right-2', 'bottom-2 left-2'].map((p) => (
                <span key={p} className={`absolute ${p} text-2xl text-amber-600/70`}>
                  ✦
                </span>
              ))}
              <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.06]">
                <svg viewBox="0 0 200 200" className="h-80 w-80">
                  {[25, 45, 65, 85].map((r) => (
                    <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#92400e" strokeWidth="1.2" />
                  ))}
                </svg>
              </div>
              <p className="quran text-2xl text-emerald-800">{BISMILLAH.t}</p>
              <div className="mt-2 text-sm font-bold tracking-wide text-amber-800">{content.settings.title}</div>
              <div className="text-[11px] text-slate-500">{content.settings.subtitle}</div>
              <div className="my-5 flex justify-center"><Glyph value={content.settings.logo} size={44} /></div>
              <div className="text-sm text-slate-500">گواهی تکمیل مقطع در بازی (غیررسمی)</div>
              <h2 className="bg-gradient-to-l from-amber-700 via-yellow-600 to-amber-700 bg-clip-text text-4xl font-black text-transparent">{degree.name}</h2>
              <div className="mt-2 inline-block rounded-full bg-emerald-700/10 px-4 py-1 text-sm font-extrabold text-emerald-800">{degree.rankLine}</div>
              <div className="mt-1">
                <SourceTag s="k1" kids />
              </div>
              <div className="mx-auto mt-6 max-w-sm space-y-1 text-base">
                <div>
                  دانشجو: <b className="text-xl">{profile.name}</b>
                </div>
                <div className="text-sm text-slate-600">
                  شماره دانشجویی: {studentNo(profile)} · ردهٔ {profile.track === 'kids' ? 'کودکان' : 'بزرگسالان'}
                </div>
              </div>
              <blockquote className="mx-auto mt-6 max-w-md whitespace-pre-line rounded-2xl bg-amber-100/60 px-4 py-3 text-sm leading-7 text-slate-700">
                {degree.gradQuote.t}
                <div className="mt-1 flex justify-center">
                  <SourceTag s={degree.gradQuote.s} kids />
                </div>
              </blockquote>
              <div className="mt-8 flex items-end justify-between gap-4 text-xs text-slate-600">
                <div className="text-right">
                  <div className="text-slate-400">تاریخ</div>
                  <div className="font-bold">{faDate(date)}</div>
                </div>
                <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-amber-600/60 text-[9px] font-black leading-3 text-amber-700">
                  مدار
                  <br />
                  تکامل
                </div>
                <div className="text-left">
                  <div className="text-slate-400">استاد</div>
                  <div className="font-bold">{content.settings.teacher}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="no-print mt-3 grid grid-cols-2 gap-2">
          <Btn variant="ghost" onClick={onClose}>
            بستن
          </Btn>
          <Btn onClick={() => window.print()}>🖨️ چاپ / ذخیره PDF</Btn>
        </div>
      </div>
    </div>
  );
}
