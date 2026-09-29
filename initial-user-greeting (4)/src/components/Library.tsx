import { useState } from 'react';
import { useSite } from '../lib/SiteContext';
import { faNum } from '../lib/storage';
import { cn } from '../utils/cn';
import { QuoteCard, SourceTag } from './ui';

export function Library() {
  const { content } = useSite();
  const { BELIEF_LISTS, CLASS_INFO, REF_BELIEFS } = content.library;
  const SOURCES = content.sources;
  const [tab, setTab] = useState<'ref' | 'lists' | 'src'>('ref');
  const [qs, setQs] = useState('');
  const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ');
  const nq = norm(qs.trim());

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1">
        {(
          [
            ['ref', 'باورهای مرجع'],
            ['lists', 'فهرست باورها'],
            ['src', 'کلاس و منابع'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('rounded-xl py-2 text-xs font-black', tab === k ? 'bg-amber-300 text-slate-900' : 'text-slate-300')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'ref' && (
        <div className="space-y-2">
          {REF_BELIEFS.map((q, k) => (
            <QuoteCard key={k} q={q} />
          ))}
        </div>
      )}

      {tab === 'lists' && (
        <div className="space-y-3">
          <input
            value={qs}
            onChange={(e) => setQs(e.target.value)}
            placeholder="جستجو در باورها…"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
          />
          {BELIEF_LISTS.map((l) => {
            const items = nq ? l.items.filter((i) => norm(i).includes(nq)) : l.items;
            if (!items.length) return null;
            return (
              <details key={l.title} open={!!nq} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <summary className="flex cursor-pointer items-center justify-between gap-2 font-black text-amber-100">
                  <span>
                    {l.title} ({faNum(items.length)})
                  </span>
                  <SourceTag s={l.s} />
                </summary>
                <ul className="mt-3 space-y-1.5 text-sm leading-7 text-slate-200">
                  {items.map((i) => (
                    <li key={i} className="rounded-lg bg-white/[0.03] px-3 py-1">
                      {i}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      {tab === 'src' && (
        <div className="space-y-3 text-sm">
          <div className="space-y-1 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 leading-8">
            {CLASS_INFO.map((c) => (
              <div key={c}>{c}</div>
            ))}
            <div className="flex justify-end">
              <SourceTag s="j10" />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 font-black text-amber-100">فایل‌های منبع (مخزن nasr)</div>
            <ul className="space-y-1 text-xs leading-6 text-slate-300">
              {Object.values(SOURCES).map((s) => (
                <li key={s}>📜 {s}</li>
              ))}
            </ul>
            <a href="https://github.com/midiovfxy-svg2/nasr" target="_blank" rel="noreferrer" dir="ltr" className="mt-3 block text-center text-xs text-sky-300 underline">
              github.com/midiovfxy-svg2/nasr
            </a>
          </div>
          <p className="text-center text-xs leading-6 text-slate-400">
            {content.settings.footer}
          </p>
        </div>
      )}
    </div>
  );
}
