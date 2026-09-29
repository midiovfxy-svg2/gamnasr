import { useEffect, useRef, useState } from 'react';
import { ADULT } from '../data/adult';
import { KIDS } from '../data/kids';
import { faDate, faNum } from '../lib/storage';
import { deleteVoice, HOME_TARGET, newId, normalizeUrl, saveVoice, setAssign, type Voice } from '../lib/voices';
import { Btn, VoicePlayer } from './ui';

const TARGETS: { id: string; label: string }[] = [
  { id: HOME_TARGET, label: '🏠 صفحهٔ اصلی و نقشهٔ مدارها (home)' },
  ...ADULT.flatMap((d) => d.lessons.map((l) => ({ id: l.id, label: `🧑 ${d.name} · ${l.title} (${l.id})` }))),
  ...KIDS.flatMap((d) => d.lessons.map((l) => ({ id: l.id, label: `👧 ${d.name} · ${l.title} (${l.id})` }))),
];
const label = (id: string) => TARGETS.find((t) => t.id === id)?.label || id;

export function VoiceManager({
  voices,
  assign,
  onChange,
  onRefreshRepo,
}: {
  voices: Voice[];
  assign: Record<string, string[]>;
  onChange: () => void;
  onRefreshRepo: () => Promise<void> | void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recSec, setRecSec] = useState(0);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recName, setRecName] = useState('');
  const [msg, setMsg] = useState('');
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await saveVoice({ id: newId(), name: f.name.replace(/\.[^.]+$/, ''), kind: 'file', blob: f, createdAt: Date.now() });
    }
    setMsg(`${faNum(files.length)} فایل صوتی اضافه شد ✓`);
    onChange();
  };

  const addUrl = async () => {
    if (!url.trim()) return;
    await saveVoice({ id: newId(), name: urlName.trim() || 'صدای استاد (لینک)', kind: 'url', url: normalizeUrl(url), createdAt: Date.now() });
    setUrl('');
    setUrlName('');
    setMsg('لینک صوتی اضافه شد ✓');
    onChange();
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        setRecBlob(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRec(mr);
      setRecSec(0);
      timer.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      setMsg('دسترسی به میکروفون ممکن نشد.');
    }
  };
  const stopRec = () => {
    rec?.stop();
    setRec(null);
    if (timer.current) clearInterval(timer.current);
  };
  const saveRec = async () => {
    if (!recBlob) return;
    await saveVoice({ id: newId(), name: recName.trim() || `ضبط صدای استاد — ${faDate(Date.now())}`, kind: 'rec', blob: recBlob, createdAt: Date.now() });
    setRecBlob(null);
    setRecName('');
    setMsg('صدای ضبط‌شده ذخیره شد ✓');
    onChange();
  };

  const assignTo = (vid: string, target: string) => {
    if (!target) return;
    const a = { ...assign, [target]: Array.from(new Set([...(assign[target] || []), vid])) };
    setAssign(a);
    onChange();
  };
  const unassign = (vid: string, target: string) => {
    const a = { ...assign, [target]: (assign[target] || []).filter((x) => x !== vid) };
    setAssign(a);
    onChange();
  };

  const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60';

  return (
    <div className="space-y-5 text-sm">
      <p className="leading-7 text-slate-300">
        صدای استاد را به هر درس (در هر دو ردهٔ کودکان و بزرگسالان) اختصاص دهید. دو فایل صوتی مخزن <span dir="ltr">nasr</span> از پیش اضافه شده‌اند. فایل‌های
        بارگذاری‌شده و ضبط‌شده روی همین دستگاه ذخیره می‌شوند.
      </p>

      <div className="space-y-2 rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-3 leading-7 text-sky-100">
        <div className="font-black">🌐 صدا برای همهٔ دانشجویان (از طریق مخزن گیت‌هاب)</div>
        <p className="text-xs text-sky-100/80">
          هر فایل صوتی که در مخزن <span dir="ltr">midiovfxy-svg2/nasr</span> (در ریشه یا پوشه‌ای به نام «صدا») قرار بگیرد، خودکار برای همهٔ بازیکنان نمایش داده
          می‌شود. اگر نام فایل با شناسهٔ درس شروع شود، خودکار به همان درس وصل می‌شود؛ مثلاً:
        </p>
        <div dir="ltr" className="rounded-lg bg-black/30 px-3 py-1.5 text-center font-mono text-xs text-amber-200">
          a2-qanun-frekans.ogg · k1 نعمت ها.mp3 · home-payam.ogg
        </div>
        <p className="text-[11px] text-sky-100/60">شناسهٔ هر درس داخل پرانتز در فهرست «اختصاص به درس» آمده است.</p>
        <Btn
          variant="ghost"
          className="w-full"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            await onRefreshRepo();
            setSyncing(false);
            setMsg('فهرست صداهای مخزن به‌روز شد ✓');
          }}
        >
          {syncing ? '… در حال دریافت' : '🔄 به‌روزرسانی صداها از مخزن'}
        </Btn>
      </div>

      {msg && <div className="rounded-xl bg-emerald-500/15 px-3 py-2 text-emerald-300">{msg}</div>}

      {/* افزودن */}
      <div className="grid gap-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300/40 bg-amber-300/5 p-4 font-bold text-amber-100 hover:bg-amber-300/10">
          📁 بارگذاری فایل صوتی (mp3, ogg, m4a, wav)
          <input type="file" accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 font-bold">🔗 افزودن با لینک (مثلاً لینک فایل در گیت‌هاب)</div>
          <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/.../file.ogg" className={input} />
          <input value={urlName} onChange={(e) => setUrlName(e.target.value)} placeholder="عنوان صدا" className={input + ' mt-2'} />
          <Btn className="mt-2 w-full" onClick={addUrl} disabled={!url.trim()}>
            افزودن لینک
          </Btn>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 font-bold">🎙️ ضبط مستقیم صدای استاد</div>
          {!rec && !recBlob && (
            <Btn variant="red" className="w-full" onClick={startRec}>
              ● شروع ضبط
            </Btn>
          )}
          {rec && (
            <Btn variant="red" className="w-full animate-pulse" onClick={stopRec}>
              ■ پایان ضبط — {faNum(recSec)} ثانیه
            </Btn>
          )}
          {recBlob && (
            <div className="space-y-2">
              <audio controls src={URL.createObjectURL(recBlob)} className="w-full" />
              <input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="عنوان صدا" className={input} />
              <div className="grid grid-cols-2 gap-2">
                <Btn variant="ghost" onClick={() => setRecBlob(null)}>
                  حذف
                </Btn>
                <Btn variant="green" onClick={saveRec}>
                  ذخیره
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* فهرست صداها */}
      <div className="space-y-3">
        <div className="font-black text-amber-100">🎧 کتابخانهٔ صدای استاد ({faNum(voices.length)})</div>
        {voices.map((v) => {
          const targets = Object.keys(assign).filter((k) => assign[k]?.includes(v.id));
          return (
            <div key={v.id} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <VoicePlayer voice={v} />
              <div className="flex flex-wrap gap-1.5">
                {v.target && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/15 px-2 py-1 text-[11px] text-sky-200">🌐 خودکار: {label(v.target)}</span>
                )}
                {targets.length === 0 && !v.target && <span className="text-xs text-slate-500">به هیچ درسی اختصاص داده نشده</span>}
                {targets.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
                    {label(t)}
                    <button onClick={() => unassign(v.id, t)} className="text-rose-300" aria-label="برداشتن">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select className={input} value="" onChange={(e) => assignTo(v.id, e.target.value)}>
                  <option value="">+ اختصاص به درس…</option>
                  {TARGETS.filter((t) => !targets.includes(t.id)).map((t) => (
                    <option key={t.id} value={t.id} className="bg-slate-900">
                      {t.label}
                    </option>
                  ))}
                </select>
                {v.kind !== 'repo' && (
                  <Btn
                    variant="ghost"
                    className="shrink-0 px-3"
                    onClick={async () => {
                      await deleteVoice(v.id);
                      onChange();
                    }}
                  >
                    🗑
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
