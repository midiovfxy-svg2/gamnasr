import { useEffect, useRef, useState } from 'react';
import { Headphones, ImageIcon, Link, Mic, Pencil, Plus, RefreshCw, Save, Search, Square, Trash2, UploadCloud } from 'lucide-react';
import { uid, type MediaAsset, type SiteContent } from '../lib/content';
import { useAsset } from '../lib/SiteContext';
import { uploadMedia } from '../lib/service';
import { normalizeUrl, repoVoices } from '../lib/voices';
import { validateFile } from '../lib/files';
import { faNum } from '../lib/storage';
import { AButton, AdminDialog, Confirm, EmptyState, ErrorNotice, Field, humanSize, Toggle } from './kit';
import type { SaveContent } from './ContentEditors';

function MediaCard({ asset, onEdit, onDelete }: { asset: MediaAsset; onEdit: () => void; onDelete: () => void }) {
  const source = useAsset('asset:' + asset.id);
  return <article className="a-media-card"><div className="a-media-visual">{asset.type === 'image' ? source ? <img src={source} alt={asset.name} /> : <ImageIcon size={40} /> : <div className="a-audio-wave" aria-hidden="true">{Array.from({ length: 31 }, (_, i) => <span key={i} style={{ height: 7 + Math.abs(Math.sin(i * 1.47)) * 32 }} />)}</div>}<span className={`a-pill ${asset.enabled ? 'a-pill-green' : 'a-pill-gold'}`}>{asset.enabled ? 'فعال' : 'غیرفعال'}</span></div><div className="a-media-card-body"><h3 title={asset.name}>{asset.name}</h3><p dir="ltr">{asset.mime || 'EXTERNAL MEDIA'} · {humanSize(asset.size)}</p>{asset.type === 'audio' && source && <audio controls preload="none" src={source} onError={e => { if (asset.fallback && e.currentTarget.src !== asset.fallback) e.currentTarget.src = asset.fallback; }} />}</div><footer className="a-media-card-foot"><AButton variant="ghost" onClick={onEdit}><Pencil size={14} />ویرایش و اتصال</AButton><button className="a-icon-button" aria-label={`حذف ${asset.name}`} onClick={onDelete}><Trash2 size={15} /></button></footer></article>;
}

export function MediaEditor({ content, onSave }: { content: SiteContent; onSave: SaveContent }) {
  const [type, setType] = useState<'all' | MediaAsset['type']>('all');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<MediaAsset | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [uploadTab, setUploadTab] = useState('file');
  const [file, setFile] = useState<File | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [remove, setRemove] = useState<MediaAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const allTargets = [{ id: 'home', label: 'صفحهٔ اصلی و نقشه' }, ...(['adult', 'kids'] as const).flatMap(t => content[t].flatMap(d => d.lessons.map(l => ({ id: l.id, label: `${t === 'kids' ? 'کودکان' : 'بزرگسالان'} / ${d.name} / ${l.title}` }))))];
  const items = content.media.filter(m => (type === 'all' || m.type === type) && m.name.includes(search));

  const stopRecording = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); if (timer.current) clearInterval(timer.current); setRecording(false); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === 'recording') recorder.current.stop(); } stream.current?.getTracks().forEach(t => t.stop()); }, []);
  const close = () => { stopRecording(); stream.current?.getTracks().forEach(t => t.stop()); setEdit(null); setFile(null); };

  const startRecording = async () => {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('مرورگر شما از ضبط پشتیبانی نمی‌کند. از بارگذاری فایل استفاده کنید.');
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(x => MediaRecorder.isTypeSupported(x));
      const mr = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      recorder.current = mr;
      const chunks: Blob[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { const format = mr.mimeType.split(';')[0]; setFile(new File(chunks, `recording.${format.includes('mp4') ? 'm4a' : format.includes('ogg') ? 'ogg' : 'webm'}`, { type: format })); stream.current?.getTracks().forEach(t => t.stop()); };
      mr.start(); setSeconds(0); setRecording(true);
      timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e) { setError((e as Error).message || 'دسترسی به میکروفون ممکن نشد.'); }
  };
  const selectFile = (f?: File) => { if (!f || !edit) return; try { validateFile(f, edit.type); setFile(f); setEdit({ ...edit, name: edit.name || f.name.replace(/\.[^.]+$/, '') }); setError(''); } catch (e) { setError((e as Error).message); } };
  const submit = async () => {
    if (!edit) return;
    setError(''); setBusy(true);
    try {
      if (!edit.name.trim()) throw new Error('عنوان رسانه را وارد کنید.');
      let asset = { ...edit };
      if (file) asset = { ...(await uploadMedia(file, edit.type)), name: edit.name, enabled: edit.enabled, id: edit.id };
      if (!file && !asset.blobId && !/^(https?:\/\/|\/api\/media\/)/i.test(asset.url)) throw new Error('یک فایل انتخاب کنید یا لینک مستقیم معتبر وارد کنید.');
      if (asset.url) asset.url = normalizeUrl(asset.url);
      const assignments = { ...content.voiceAssignments };
      Object.keys(assignments).forEach(id => { assignments[id] = assignments[id].filter(v => v !== edit.id); });
      if (asset.type === 'audio') targets.forEach(id => { assignments[id] = [...(assignments[id] || []), asset.id]; });
      await onSave({ ...content, media: isNew ? [...content.media, asset] : content.media.map(m => m.id === edit.id ? asset : m), voiceAssignments: assignments }, `${isNew ? 'افزودن' : 'ویرایش'} رسانه: ${asset.name}`);
      close();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true); setError('');
    try {
      const voices = await repoVoices(true);
      if (!voices.length) throw new Error('فایل جدیدی دریافت نشد. اتصال به مخزن را بررسی کنید.');
      const known = new Set(content.media.map(m => { try { return decodeURIComponent(m.url); } catch { return m.url; } }));
      const fresh = voices.filter(v => !known.has(decodeURIComponent(v.url || '')));
      const assignments = { ...content.voiceAssignments };
      const media: MediaAsset[] = fresh.map(v => { if (v.target) assignments[v.target] = [...(assignments[v.target] || []), v.id]; return { id: v.id, name: v.name, type: 'audio', url: v.url || '', fallback: v.fallback, size: 0, mime: 'audio/ogg', enabled: true, createdAt: Date.now() }; });
      if (!fresh.length) throw new Error('همهٔ صداهای موجود در مخزن قبلاً اضافه شده‌اند.');
      await onSave({ ...content, media: [...content.media, ...media], voiceAssignments: assignments }, `همگام‌سازی ${faNum(media.length)} صدا از مخزن`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return <><div className="a-toolbar"><div className="a-tabs">{[['all', 'همهٔ رسانه‌ها'], ['audio', 'صداها'], ['image', 'تصویرها']].map(([key, title]) => <button key={key} className={type === key ? 'active' : ''} onClick={() => setType(key as typeof type)}>{title}</button>)}</div><div className="a-search-input"><Search size={17} /><input placeholder="جستجوی رسانه..." value={search} onChange={e => setSearch(e.target.value)} /></div><AButton variant="secondary" busy={busy} onClick={sync}><RefreshCw size={15} />دریافت از مخزن</AButton><AButton onClick={() => { setError(''); setFile(null); setTargets([]); setUploadTab('file'); setIsNew(true); setEdit({ id: uid(), name: '', type: type === 'image' ? 'image' : 'audio', url: '', size: 0, mime: '', enabled: true, createdAt: Date.now() }); }}><Plus size={16} />رسانهٔ جدید</AButton></div><ErrorNotice error={!edit ? error : ''} /><div className="a-media-grid">{items.map(asset => <MediaCard key={asset.id} asset={asset} onEdit={() => { setError(''); setIsNew(false); setFile(null); setTargets(Object.entries(content.voiceAssignments).filter(([, ids]) => ids.includes(asset.id)).map(([id]) => id)); setEdit({ ...asset }); }} onDelete={() => setRemove(asset)} />)}</div>{!items.length && <EmptyState icon={Headphones} title="رسانه‌ای پیدا نشد" text="صوت، تصویر یا نماد دلخواهتان را به کتابخانه اضافه کنید." />}
    {edit && <AdminDialog wide title={isNew ? 'افزودن رسانه' : 'ویرایش رسانه و محل نمایش'} description="صوت اصلی استاد را بدون تغییر بارگذاری کنید. تصاویر از کتابخانه در بخش شکل‌های بازی قابل انتخاب هستند." onClose={close}><ErrorNotice error={error} /><div className="a-form-grid"><Field label="عنوان رسانه" required><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="نوع رسانه"><select value={edit.type} disabled={!isNew || recording} onChange={e => { setEdit({ ...edit, type: e.target.value as MediaAsset['type'] }); setFile(null); setUploadTab('file'); }}><option value="audio">فایل صوتی</option><option value="image">تصویر</option></select></Field></div><div className="a-editor-tabs"><button className={uploadTab === 'file' ? 'active' : ''} onClick={() => setUploadTab('file')}><UploadCloud size={15} style={{ display: 'inline', marginLeft: 5 }} />بارگذاری فایل</button><button className={uploadTab === 'url' ? 'active' : ''} disabled={recording} onClick={() => setUploadTab('url')}><Link size={15} style={{ display: 'inline', marginLeft: 5 }} />لینک مستقیم</button>{edit.type === 'audio' && <button className={uploadTab === 'record' ? 'active' : ''} onClick={() => setUploadTab('record')}><Mic size={15} style={{ display: 'inline', marginLeft: 5 }} />ضبط صدا</button>}</div>
      {uploadTab === 'file' && <label className="a-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}><UploadCloud size={30} /><strong>{file?.name || (edit.blobId || edit.url ? 'برای جایگزینی، فایل جدید انتخاب کنید' : 'فایل را اینجا رها کنید یا کلیک کنید')}</strong><small>{edit.type === 'image' ? 'JPG, PNG, WebP, GIF / حداکثر ۴ مگابایت' : 'MP3, OGG, M4A, WAV, WebM / حداکثر ۲۰ مگابایت'}</small><input type="file" accept={edit.type === 'image' ? 'image/png,image/jpeg,image/webp,image/gif' : 'audio/*'} onChange={e => selectFile(e.target.files?.[0])} /></label>}
      {uploadTab === 'url' && <Field label="آدرس مستقیم فایل" hint="لینک فایل گیت‌هاب نیز به آدرس قابل پخش تبدیل می‌شود."><input dir="ltr" value={edit.url} placeholder="https://..." onChange={e => { setEdit({ ...edit, url: e.target.value, blobId: undefined }); setFile(null); }} /></Field>}
      {uploadTab === 'record' && <div className="a-dropzone"><Mic size={30} /><strong>{recording ? `در حال ضبط: ${faNum(seconds)} ثانیه` : file ? `${file.name} آمادهٔ ذخیره است` : 'ضبط مستقیم با میکروفون دستگاه'}</strong><AButton variant={recording ? 'danger' : 'secondary'} style={{ marginTop: 17 }} onClick={recording ? stopRecording : startRecording}>{recording ? <Square size={15} /> : <Mic size={15} />}{recording ? 'پایان ضبط' : 'شروع ضبط'}</AButton></div>}
      <Toggle label="نمایش این رسانه در سایت" value={edit.enabled} onChange={enabled => setEdit({ ...edit, enabled })} />{edit.type === 'audio' && <div className="a-editor-section" style={{ marginTop: 22 }}><h3>این صدا کجا پخش شود؟</h3><div style={{ maxHeight: 240, overflow: 'auto' }}>{allTargets.map(t => <label className="a-media-assignment" key={t.id}><input type="checkbox" checked={targets.includes(t.id)} onChange={e => setTargets(e.target.checked ? [...targets, t.id] : targets.filter(x => x !== t.id))} />{t.label}</label>)}</div></div>}<div className="a-form-actions"><AButton variant="secondary" onClick={close}>انصراف</AButton><AButton busy={busy} disabled={recording} onClick={submit}><Save size={16} />ذخیرهٔ رسانه</AButton></div></AdminDialog>}
    {remove && <Confirm title="حذف رسانه از کتابخانه" busy={busy} onClose={() => setRemove(null)} onConfirm={async () => { setBusy(true); setError(''); try { const withoutMedia = { settings: content.settings, adult: content.adult, kids: content.kids, library: content.library }; if (JSON.stringify(withoutMedia).includes(`asset:${remove.id}`)) throw new Error('این تصویر در سایت استفاده می‌شود. ابتدا شکل یا لوگوی مرتبط را عوض کنید.'); const voiceAssignments = Object.fromEntries(Object.entries(content.voiceAssignments).map(([id, ids]) => [id, ids.filter(x => x !== remove.id)])); await onSave({ ...content, media: content.media.filter(m => m.id !== remove.id), voiceAssignments }, `حذف رسانه: ${remove.name}`); setRemove(null); } catch (e) { setError((e as Error).message); setRemove(null); } finally { setBusy(false); } }}>«{remove.name}» از کتابخانه و درس‌های مرتبط برداشته می‌شود. نسخهٔ قبلی محتوا در تاریخچه باقی می‌ماند.</Confirm>}
  </>;
}