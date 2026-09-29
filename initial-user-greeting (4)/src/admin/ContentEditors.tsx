import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronDown, Copy, FileText, GraduationCap, Pencil, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import type { Degree, Lesson, Question, Track, Traveler } from '../data/types';
import { defaultContent, fieldNames, uid, type SiteContent } from '../lib/content';
import { faNum } from '../lib/storage';
import { useSite } from '../lib/SiteContext';
import { AButton, AdminDialog, Confirm, EmptyState, ErrorNotice, Field, Glyph, IconPicker, Toggle } from './kit';

export type SaveContent = (content: SiteContent, label: string) => Promise<void>;
const blankQuote = () => ({ t: '', s: 'b3' as const });

function arraySample(key: string, first: unknown): unknown {
  if (first !== undefined) {
    if (typeof first === 'string') return '';
    if (Array.isArray(first)) return first.map(() => '');
    if (first && typeof first === 'object') {
      const item = structuredClone(first) as Record<string, unknown>;
      for (const k of ['t', 'title', 'name']) if (k in item) item[k] = '';
      if ('id' in item) item.id = uid();
      if ('ok' in item) item.ok = false;
      return item;
    }
  }
  if (['texts', 'obstacle', 'whisper', 'call', 'remedy', 'result', 'MAHJOOR', 'REF_BELIEFS'].includes(key)) return blankQuote();
  if (key === 'beliefs') return { t: '', ok: false };
  if (key === 'pairs') return ['', ''];
  if (key === 'DAILY_ITEMS') return { id: uid(), t: '', e: 'icon:leaf' };
  if (key.startsWith('BLESSINGS_')) return { t: '', e: 'icon:leaf' };
  if (key === 'BELIEF_LISTS') return { title: '', s: 'b3', items: [''] };
  return '';
}

export function StructuredEditor({ value, onChange, name = '', label, fixed = false }: { value: unknown; onChange: (v: unknown) => void; name?: string; label?: string; fixed?: boolean }) {
  const { content } = useSite();
  const title = label || fieldNames[name] || name;
  if (typeof value === 'boolean') return <Toggle label={title} value={value} onChange={onChange} />;
  if (typeof value === 'number') return <Field label={title}><input type="number" value={value} min={0} step={1} className="a-structure-number" onChange={e => onChange(Number(e.target.value))} /></Field>;
  if (typeof value === 'string') {
    if (['icon', 'avatar', 'e'].includes(name)) return <Field label={title}><IconPicker value={value} onChange={onChange} /></Field>;
    if (['s', 'obstacleSrc', 'beliefSrc', 'titleSrc'].includes(name)) return <Field label={title}><select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(content.sources).map(([id, text]) => <option value={id} key={id}>{text} ({id})</option>)}</select></Field>;
    if (['id', 'kind'].includes(name)) return <Field label={title} hint="برای حفظ ارتباط‌ها، شناسه و نوع این رکورد ثابت است."><input value={value} readOnly dir="ltr" /></Field>;
    return <Field label={title}>{value.length > 85 || ['t', 'full', 'stem', 'text'].includes(name) ? <textarea value={value} rows={Math.min(8, Math.max(3, value.length / 85))} onChange={e => onChange(e.target.value)} /> : <input value={value} onChange={e => onChange(e.target.value)} />}</Field>;
  }
  if (Array.isArray(value)) {
    const move = (i: number, direction: number) => { const next = [...value]; [next[i], next[i + direction]] = [next[i + direction], next[i]]; onChange(next); };
    return <div className="a-editor-section">{title && <h3>{title} <span className="a-inline-tag">{faNum(value.length)}</span></h3>}{value.map((item, index) => <details className="a-structured-item" key={index} open={value.length < 3 || undefined}><summary><strong>{faNum(index + 1)}. {typeof item === 'string' ? item || 'مورد جدید' : (item as { t?: string; title?: string })?.t?.slice(0, 60) || (item as { title?: string })?.title || 'ویرایش جزئیات'}</strong><ChevronDown size={15} /></summary><div className="a-structured-body"><StructuredEditor name={Array.isArray(item) ? 'pair' : ''} label={typeof item === 'string' ? 'متن' : undefined} value={item} fixed={name === 'pairs'} onChange={next => onChange(value.map((old, i) => i === index ? next : old))} /></div>{!fixed && name !== 'bins' && <div className="a-structured-item-actions"><button type="button" className="a-icon-button" aria-label="انتقال به بالا" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" className="a-icon-button" aria-label="انتقال به پایین" disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button type="button" className="a-icon-button" aria-label="حذف این مورد" onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={15} /></button></div>}</details>)}{!fixed && name !== 'bins' && <AButton variant="secondary" onClick={() => onChange([...value, arraySample(name, value[0])])}><Plus size={15} />افزودن مورد</AButton>}</div>;
  }
  if (value && typeof value === 'object') {
    const fields = { ...value } as Record<string, unknown>;
    if (fields.kind === 'choice') {
      const q = value as Extract<Question, { kind: 'choice' }>;
      return <div>
        <StructuredEditor name="stem" value={q.stem} onChange={stem => onChange({ ...q, stem })} />
        <StructuredEditor name="options" value={q.options} onChange={next => {
          const options = next as string[];
          const answer = options.indexOf(q.options[q.answer]);
          onChange({ ...q, options, answer });
        }} />
        <Field label="پاسخ صحیح" hint="بعد از تغییر گزینه‌ها، پاسخ صحیح را دوباره بررسی کنید.">
          <select value={q.answer} onChange={e => onChange({ ...q, answer: Number(e.target.value) })}>
            <option value={-1}>پاسخ صحیح را انتخاب کنید</option>
            {q.options.map((option, i) => <option value={i} key={i}>{faNum(i + 1)}. {option || 'گزینهٔ خالی'}</option>)}
          </select>
        </Field>
        <StructuredEditor name="full" value={q.full} onChange={full => onChange({ ...q, full })} />
        <StructuredEditor name="s" value={q.s} onChange={s => onChange({ ...q, s })} />
      </div>;
    }
    if ('t' in fields && 's' in fields && !('ar' in fields)) fields.ar = false;
    if ('t' in fields && !('s' in fields) && !('e' in fields) && !('b' in fields) && !('id' in fields) && !('ok' in fields)) fields.ok = false;
    if ('b' in fields && !('e' in fields)) fields.e = '';
    return <div>{Object.entries(fields).map(([key, item]) => <StructuredEditor key={key} name={key} value={item} onChange={next => onChange({ ...value, [key]: next })} />)}</div>;
  }
  return null;
}

function makeQuestion(kind: Question['kind']): Question {
  const base = { full: '', s: 'b3' as const };
  if (kind === 'choice') return { ...base, kind, stem: '', options: ['', ''], answer: 0 };
  if (kind === 'order') return { ...base, kind, items: ['', ''] };
  if (kind === 'match') return { ...base, kind, pairs: [['', ''], ['', '']] };
  return { ...base, kind, bins: ['', ''], items: [{ t: '', b: 0 }, { t: '', b: 1 }] };
}

function makeTraveler(): Traveler {
  return { id: uid(), name: 'رهرو جدید', avatar: 'icon:user', obstacleTitle: '', obstacleSrc: 'b3', obstacle: [blankQuote()], whisper: [blankQuote()], call: [blankQuote()], beliefs: [{ t: '', ok: true }, { t: '', ok: false }], beliefSrc: 'b3', remedy: [blankQuote()], result: [blankQuote()] };
}

export function CoursesEditor({ content, onSave, focusId, onFocusConsumed }: { content: SiteContent; onSave: SaveContent; focusId?: string; onFocusConsumed: () => void }) {
  const [track, setTrack] = useState<Track>('adult');
  const [degreeId, setDegreeId] = useState(content.adult[0]?.id || '');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<{ lesson: Lesson; degreeId: string; track: Track; isNew?: boolean } | null>(null);
  const [degreeEdit, setDegreeEdit] = useState<{ degree: Degree; isNew?: boolean } | null>(null);
  const [tab, setTab] = useState('basic');
  const [questionType, setQuestionType] = useState<Question['kind']>('choice');
  const [remove, setRemove] = useState<{ id: string; type: 'lesson' | 'degree'; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const degree = content[track].find(d => d.id === degreeId) || content[track][0];
  const lessons = (degree?.lessons || []).filter(l => l.title.includes(search));
  const [discard, setDiscard] = useState(false);
  const initial = useMemo(() => edit?.isNew ? null : content[edit?.track || 'adult'].flatMap(d => d.lessons).find(l => l.id === edit?.lesson.id), [content, edit?.lesson.id, edit?.track, edit?.isNew]);

  useEffect(() => {
    if (!focusId) return;
    for (const t of ['adult', 'kids'] as const) for (const d of content[t]) {
      const lesson = d.lessons.find(l => l.id === focusId);
      if (lesson) { setTrack(t); setDegreeId(d.id); setEdit({ lesson: structuredClone(lesson), degreeId: d.id, track: t }); setTab('basic'); }
    }
    onFocusConsumed();
  }, [focusId, content, onFocusConsumed]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const updateLesson = (next: Partial<Lesson>) => setEdit(old => old ? { ...old, lesson: { ...old.lesson, ...next } } : old);
  const closeEdit = () => JSON.stringify(initial) !== JSON.stringify(edit?.lesson) ? setDiscard(true) : setEdit(null);
  const saveLesson = () => run(async () => {
    if (!edit) return;
    await onSave({ ...content, [edit.track]: content[edit.track].map(d => d.id !== edit.degreeId ? d : { ...d, lessons: edit.isNew ? [...d.lessons, edit.lesson] : d.lessons.map(l => l.id === edit.lesson.id ? edit.lesson : l) }) }, `${edit.isNew ? 'افزودن' : 'ویرایش'} درس: ${edit.lesson.title}`);
    setEdit(null);
  });
  const reorder = (id: string, delta: number) => run(async () => {
    if (!degree) return;
    const items = [...degree.lessons]; const index = items.findIndex(l => l.id === id);
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    await onSave({ ...content, [track]: content[track].map(d => d.id === degree.id ? { ...d, lessons: items } : d) }, 'تغییر ترتیب درس‌ها');
  });

  return <>
    <div className="a-toolbar"><div className="a-tabs"><button className={track === 'adult' ? 'active' : ''} onClick={() => { setTrack('adult'); setDegreeId(content.adult[0]?.id || ''); }}>بزرگسالان</button><button className={track === 'kids' ? 'active' : ''} onClick={() => { setTrack('kids'); setDegreeId(content.kids[0]?.id || ''); }}>کودکان</button></div><div className="a-search-input"><Search size={17} /><input aria-label="جستجو در درس‌ها" placeholder="جستجوی عنوان درس..." value={search} onChange={e => setSearch(e.target.value)} /></div><AButton disabled={!degree} onClick={() => { setError(''); setTab('basic'); setEdit({ degreeId: degree.id, track, isNew: true, lesson: { id: uid(), title: 'درس جدید', icon: 'icon:book-open', titleSrc: 'b3', texts: [blankQuote()], quiz: [], published: false } }); }}><Plus size={17} />افزودن درس</AButton></div>
    <ErrorNotice error={error} />
    <div className="a-split"><aside className="a-course-sidebar"><h3>مقاطع تحصیلی</h3>{content[track].map(d => <button key={d.id} className={`a-degree-button ${degree?.id === d.id ? 'active' : ''}`} onClick={() => setDegreeId(d.id)}><GraduationCap size={18} />{d.name}<span>{faNum(d.lessons.length)}</span></button>)}<AButton variant="ghost" onClick={() => setDegreeEdit({ isNew: true, degree: { id: uid(), name: 'مقطع جدید', rank: '', rankLine: '', color: 'emerald', gradQuote: blankQuote(), lessons: [] } })}><Plus size={15} />مقطع جدید</AButton></aside><div>{degree ? <><div className="a-course-summary"><div><h2>{degree.name}</h2><p>{degree.rankLine} / {faNum(degree.lessons.length)} درس</p></div><div className="a-course-actions"><button className="a-icon-button" title="ویرایش مقطع و مدرک" onClick={() => setDegreeEdit({ degree: structuredClone(degree) })}><Pencil size={17} /></button><button className="a-icon-button" title="حذف مقطع" onClick={() => setRemove({ type: 'degree', id: degree.id, title: degree.name })}><Trash2 size={17} /></button></div></div><div className="a-panel"><div className="a-table-scroll"><table className="a-table"><thead><tr><th>عنوان درس</th><th>پرسش</th><th>وضعیت</th><th>مدیریت</th></tr></thead><tbody>{lessons.map(l => { const index = degree.lessons.findIndex(x => x.id === l.id); return <tr key={l.id}><td><div className="a-table-title"><span className="a-course-icon"><Glyph value={l.icon} size={23} /></span><div><strong>{l.title}</strong><small>{faNum(l.texts.length)} متن {l.traveler && '/ دارای شخصیت'}</small></div></div></td><td>{faNum(l.quiz.length)}</td><td><span className={`a-pill ${l.published !== false ? 'a-pill-green' : 'a-pill-gold'}`}>{l.published !== false ? 'منتشرشده' : 'پیش‌نویس'}</span></td><td><div className="a-course-actions"><button className="a-icon-button" title="ویرایش درس" onClick={() => { setError(''); setTab('basic'); setEdit({ lesson: structuredClone(l), degreeId: degree.id, track }); }}><Pencil size={15} /></button><button className="a-icon-button" title="ساخت نسخهٔ مشابه" onClick={() => { setTab('basic'); setEdit({ lesson: { ...structuredClone(l), id: uid(), title: `${l.title} (نسخهٔ جدید)`, published: false, traveler: l.traveler ? { ...structuredClone(l.traveler), id: uid() } : undefined }, degreeId: degree.id, track, isNew: true }); }}><Copy size={15} /></button><button className="a-icon-button" title="انتقال به بالا" disabled={busy || index === 0} onClick={() => reorder(l.id, -1)}><ArrowUp size={14} /></button><button className="a-icon-button" title="انتقال به پایین" disabled={busy || index === degree.lessons.length - 1} onClick={() => reorder(l.id, 1)}><ArrowDown size={14} /></button><button className="a-icon-button" title="حذف درس" onClick={() => setRemove({ type: 'lesson', id: l.id, title: l.title })}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>{lessons.length === 0 && <EmptyState title="درسی پیدا نشد" text="یک درس جدید اضافه کنید یا عبارت جستجو را تغییر دهید." />}</div></> : <EmptyState title="هنوز مقطعی وجود ندارد" text="برای شروع، یک مقطع جدید بسازید." />}</div></div>

    {edit && <AdminDialog wide title={edit.isNew ? 'افزودن درس جدید' : 'ویرایش درس'} description="متن منبع را بدون بازنویسی وارد کنید. تغییرات فقط با ذخیره اعمال می‌شوند." onClose={closeEdit}><div className="a-editor-tabs">{[['basic', 'مشخصات و متن‌ها'], ['quiz', 'پرسش‌های بازی'], ['traveler', 'شخصیت و روایت']].map(([id, text]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{text}</button>)}</div><ErrorNotice error={error} />
      {tab === 'basic' && <><div className="a-form-grid"><Field label="عنوان درس" required><input value={edit.lesson.title} onChange={e => updateLesson({ title: e.target.value })} /></Field><Field label="منبع عنوان"><select value={edit.lesson.titleSrc} onChange={e => updateLesson({ titleSrc: e.target.value as Lesson['titleSrc'] })}>{Object.entries(content.sources).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></Field></div><Field label="شکل یا تصویر درس"><IconPicker value={edit.lesson.icon} onChange={icon => updateLesson({ icon })} /></Field><Field label="تمرین همراه درس"><select value={edit.lesson.activity || ''} onChange={e => updateLesson({ activity: (e.target.value || undefined) as Lesson['activity'] })}><option value="">بدون تمرین اضافه</option><option value="blessings">نعمت‌یاب</option><option value="daily">برنامهٔ روزانه</option><option value="repeat">تکرار باور</option></select></Field><Toggle label="انتشار در بازی" hint="درس منتشرشده باید متن و پرسش داشته باشد. پیش‌نویس به کاربران نمایش داده نمی‌شود." value={edit.lesson.published !== false} onChange={published => updateLesson({ published })} /><div style={{ marginTop: 22 }}><StructuredEditor name="texts" value={edit.lesson.texts} onChange={texts => updateLesson({ texts: texts as Lesson['texts'] })} /></div></>}
      {tab === 'quiz' && <><div className="a-warning">پاسخ صحیح فقط بر اساس متن منبع مشخص شود. در پرسش چندگزینه‌ای، شمارهٔ گزینه از صفر شروع می‌شود.</div>{edit.lesson.quiz.map((q, i) => <details className="a-structured-item" key={i} open={undefined}><summary><strong>پرسش {faNum(i + 1)} / {({ choice: 'کامل‌کردن جمله', order: 'ترتیب', match: 'جفت‌سازی', sort: 'دسته‌بندی' })[q.kind]}</strong><ChevronDown size={15} /></summary><div className="a-structured-body"><StructuredEditor value={q} onChange={next => updateLesson({ quiz: edit.lesson.quiz.map((old, index) => index === i ? next as Question : old) })} /><AButton variant="danger" onClick={() => updateLesson({ quiz: edit.lesson.quiz.filter((_, index) => i !== index) })}><Trash2 size={14} />حذف پرسش</AButton></div></details>)}<div className="a-toolbar" style={{ marginTop: 20 }}><select value={questionType} onChange={e => setQuestionType(e.target.value as Question['kind'])}><option value="choice">چندگزینه‌ای</option><option value="order">ترتیب جمله‌ها</option><option value="match">جفت‌سازی</option><option value="sort">دسته‌بندی</option></select><AButton variant="secondary" onClick={() => updateLesson({ quiz: [...edit.lesson.quiz, makeQuestion(questionType)] })}><Plus size={16} />افزودن پرسش</AButton></div></>}
      {tab === 'traveler' && <>{edit.lesson.traveler ? <><StructuredEditor value={edit.lesson.traveler} onChange={traveler => updateLesson({ traveler: traveler as Traveler })} /><AButton variant="danger" onClick={() => updateLesson({ traveler: undefined })}><Trash2 size={15} />حذف شخصیت از این درس</AButton></> : <EmptyState title="شخصیتی به این درس متصل نیست" text="شخصیت، شکل، مانع و تمامی متن‌های روایت را می‌توانید مدیریت کنید."><AButton variant="secondary" onClick={() => updateLesson({ traveler: makeTraveler() })}><Plus size={16} />افزودن شخصیت</AButton></EmptyState>}</>}
      <div className="a-form-actions sticky"><AButton variant="secondary" onClick={closeEdit}>انصراف</AButton><AButton busy={busy} onClick={saveLesson}><Save size={16} />ذخیرهٔ تغییرات</AButton></div>
    </AdminDialog>}
    {degreeEdit && <AdminDialog title="ویرایش مقطع و مدرک" onClose={() => setDegreeEdit(null)}>
      <ErrorNotice error={error} />
      <Field label="نام مقطع"><input value={degreeEdit.degree.name} onChange={e => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, name: e.target.value } })} /></Field>
      <Field label="نام مرتبه"><input value={degreeEdit.degree.rank} onChange={e => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, rank: e.target.value } })} /></Field>
      <Field label="عنوان کامل مرتبه"><input value={degreeEdit.degree.rankLine} onChange={e => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, rankLine: e.target.value } })} /></Field>
      <Field label="شکل مقطع"><IconPicker value={degreeEdit.degree.icon || 'icon:graduation'} onChange={icon => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, icon } })} /></Field>
      <Field label="رنگ مقطع"><select value={degreeEdit.degree.color} onChange={e => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, color: e.target.value as Degree['color'] } })}><option value="emerald">سبز</option><option value="sky">آبی</option><option value="amber">طلایی</option></select></Field>
      <StructuredEditor value={degreeEdit.degree.gradQuote} name="gradQuote" onChange={gradQuote => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, gradQuote: gradQuote as Degree['gradQuote'] } })} />
      <Toggle label="نمایش مقطع در بازی" value={degreeEdit.degree.published !== false} onChange={published => setDegreeEdit({ ...degreeEdit, degree: { ...degreeEdit.degree, published } })} />
      <div className="a-form-actions"><AButton busy={busy} onClick={() => run(async () => { await onSave({ ...content, [track]: degreeEdit.isNew ? [...content[track], degreeEdit.degree] : content[track].map(d => d.id === degreeEdit.degree.id ? degreeEdit.degree : d) }, `ذخیرهٔ مقطع: ${degreeEdit.degree.name}`); setDegreeId(degreeEdit.degree.id); setDegreeEdit(null); })}><Save size={16} />ذخیرهٔ مقطع</AButton></div>
    </AdminDialog>}
    {remove && <Confirm title={`حذف ${remove.type === 'degree' ? 'مقطع' : 'درس'}`} onClose={() => setRemove(null)} busy={busy} onConfirm={() => run(async () => { const next = remove.type === 'degree' ? content[track].filter(d => d.id !== remove.id) : content[track].map(d => ({ ...d, lessons: d.lessons.filter(l => l.id !== remove.id) })); await onSave({ ...content, [track]: next }, `حذف: ${remove.title}`); setRemove(null); })}>«{remove.title}» حذف می‌شود.{remove.type === 'degree' && ' همهٔ درس‌های این مقطع نیز حذف می‌شوند.'} نسخهٔ قبلی در تاریخچهٔ محتوا قابل بازیابی است.</Confirm>}
    {discard && <Confirm title="تغییرات ذخیره نشده‌اند" onClose={() => setDiscard(false)} onConfirm={() => { setEdit(null); setDiscard(false); }}>ویرایش‌های این درس کنار گذاشته شوند؟</Confirm>}
  </>;
}

export function SharedTextsEditor({ content, onSave }: { content: SiteContent; onSave: SaveContent }) {
  const [tab, setTab] = useState('texts');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<{ key: string; value: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newSource, setNewSource] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const values = tab === 'texts' ? content.library : content.sources;
  const save = async () => {
    if (!edit) return;
    setBusy(true); setError('');
    try { await onSave({ ...content, [tab === 'texts' ? 'library' : 'sources']: { ...values, [edit.key]: edit.value } }, `ویرایش ${fieldNames[edit.key] || edit.key}`); setEdit(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <><div className="a-toolbar"><div className="a-tabs"><button className={tab === 'texts' ? 'active' : ''} onClick={() => setTab('texts')}>متن‌ها و شکل‌های مشترک</button><button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>منابع</button></div><div className="a-search-input"><Search size={17} /><input placeholder="جستجو در عنوان‌ها..." value={query} onChange={e => setQuery(e.target.value)} /></div>{tab === 'sources' && <AButton onClick={() => setNewSource(true)}><Plus size={16} />منبع جدید</AButton>}</div><div className="a-warning">متن‌های پیش‌فرض حفظ شده‌اند. هر تغییر تنها با تأیید شما ذخیره می‌شود؛ بازنویسی یا تکمیل خودکار متن انجام نمی‌شود.</div><div className="a-panel">{Object.entries(values).filter(([key]) => (fieldNames[key] || key).includes(query)).map(([key, value]) => <button className="a-text-row" key={key} onClick={() => { setError(''); setEdit({ key, value: structuredClone(value) }); }}><FileText size={20} /><div><strong>{fieldNames[key] || key}</strong><p>{typeof value === 'string' ? value : Array.isArray(value) ? `${faNum(value.length)} مورد قابل ویرایش` : (value as { t?: string }).t || ''}</p></div><Pencil size={16} /></button>)}</div>{edit && <AdminDialog wide title={`ویرایش ${fieldNames[edit.key] || edit.key}`} onClose={() => setEdit(null)}><ErrorNotice error={error} /><StructuredEditor name={edit.key} value={edit.value} onChange={value => setEdit({ ...edit, value })} /><div className="a-form-actions">{tab === 'texts' && <AButton variant="ghost" onClick={() => setEdit({ ...edit, value: structuredClone(defaultContent.library[edit.key as keyof typeof defaultContent.library]) })}><RotateCcw size={15} />برگرداندن متن اولیه در فرم</AButton>}<AButton variant="secondary" onClick={() => setEdit(null)}>انصراف</AButton><AButton busy={busy} onClick={save}><Check size={16} />ذخیرهٔ تغییرات</AButton></div></AdminDialog>}{newSource && <AdminDialog title="افزودن منبع" onClose={() => setNewSource(false)}><ErrorNotice error={error} /><Field label="شناسهٔ یکتا"><input dir="ltr" value={sourceId} onChange={e => setSourceId(e.target.value)} placeholder="source-01" /></Field><Field label="نام فایل یا منبع"><input value={sourceName} onChange={e => setSourceName(e.target.value)} /></Field><div className="a-form-actions"><AButton busy={busy} disabled={!sourceId.trim() || !sourceName.trim()} onClick={async () => { if (!/^[a-zA-Z0-9_-]+$/.test(sourceId) || content.sources[sourceId]) { setError('شناسه باید یکتا و فقط شامل حروف لاتین، عدد یا خط تیره باشد.'); return; } setBusy(true); try { await onSave({ ...content, sources: { ...content.sources, [sourceId]: sourceName } }, 'افزودن منبع'); setNewSource(false); setSourceId(''); setSourceName(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Plus size={16} />افزودن منبع</AButton></div></AdminDialog>}</>;
}

export function CurriculumSummary({ content, onOpen }: { content: SiteContent; onOpen: () => void }) {
  const [track, setTrack] = useState<Track>('adult');
  const total = content[track].reduce((sum, d) => sum + d.lessons.length, 0);
  const colors = ['#c8b180', '#93ad9d', '#a0aec4'];
  const circumference = 2 * Math.PI * 68;
  let offset = 0;
  return <section className="a-panel"><header className="a-panel-head"><div><h2>مسیر یادگیری</h2><p>ساختار مقاطع دانشگاه</p></div><div className="a-tabs"><button className={track === 'adult' ? 'active' : ''} onClick={() => setTrack('adult')}>بزرگسالان</button><button className={track === 'kids' ? 'active' : ''} onClick={() => setTrack('kids')}>کودکان</button></div></header><div className="a-panel-body"><div className="a-ring-wrap"><svg viewBox="0 0 170 170" aria-hidden="true"><circle cx="85" cy="85" r="68" fill="none" stroke="#f0f2f5" strokeWidth="12" />{content[track].map((d, i) => { const length = total ? d.lessons.length / total * circumference : 0; const currentOffset = offset; offset += length; return <circle key={d.id} cx="85" cy="85" r="68" fill="none" stroke={colors[i % 3]} strokeWidth="12" strokeDasharray={`${Math.max(0, length - 7)} ${circumference}`} strokeDashoffset={-currentOffset} strokeLinecap="round" />; })}</svg><div className="a-ring-text"><BookOpen size={18} color="#b29b6b" /><strong>{faNum(total)}</strong><span>درس در مسیر تکامل</span></div></div>{content[track].map((d, i) => <div key={d.id} className="a-degree-summary"><i style={{ background: colors[i % 3] }} /><span>{d.name}</span><strong>{faNum(d.lessons.length)} درس</strong></div>)}<AButton variant="ghost" style={{ width: '100%', marginTop: 9 }} onClick={onOpen}>مدیریت مسیر یادگیری<ArrowLeft size={14} /></AButton></div></section>;
}