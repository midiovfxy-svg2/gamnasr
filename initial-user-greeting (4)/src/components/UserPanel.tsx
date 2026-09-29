import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Download, FileText, KeyRound, Mail, MessageSquare, Paperclip, Save, Send, ShieldCheck, Smartphone, UserRound, X } from 'lucide-react';
import { useSite } from '../lib/SiteContext';
import { attachmentBlob, myMessages, recoveryCode, saveMyProfile, sendContact, statusNames, type ContactMessage } from '../lib/service';
import { downloadBlob, normalizePhone, validPhone, validateFile } from '../lib/files';
import { faDate, faNum, studentNo, type Profile } from '../lib/storage';
import { AButton, Brand, EmptyState, ErrorNotice, Field, humanSize } from '../admin/kit';

export function UserPanel({ profile, onBack, onProfileChange, initialTab = 'profile' }: { profile: Profile; onBack: () => void; onProfileChange: (p: Profile) => void; initialTab?: 'profile' | 'contact' | 'messages' }) {
  const { content, mode } = useSite();
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState(profile.name);
  const [mobile, setMobile] = useState(profile.mobile || '');
  const [email, setEmail] = useState(profile.email || '');
  const [consent, setConsent] = useState(!!profile.consentAt);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [expanded, setExpanded] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revealCode, setRevealCode] = useState(false);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const liveProfile = useRef(profile);
  liveProfile.current = profile;
  useEffect(() => {
    let mounted = true;
    const load = async () => { try { const items = await myMessages(liveProfile.current); if (mounted) setMessages(items); } catch (e) { if (mounted) setError((e as Error).message); } };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => { mounted = false; clearInterval(timer); };
  }, [profile.id]);
  const changeTab = (next: typeof tab) => { setTab(next); setError(''); setNotice(''); };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const phone = normalizePhone(mobile);
      if (!validPhone(phone)) throw new Error('شماره موبایل را درست وارد کنید. نمونه: 09123456789');
      if (phone && !consent) throw new Error('برای ثبت شماره، رضایت نگهداری اطلاعات را تأیید کنید.');
      const next = await saveMyProfile(profile, { name: name.trim(), mobile: phone, email: email.trim(), consentAt: consent ? profile.consentAt || Date.now() : undefined });
      onProfileChange(next); setMobile(phone); setNotice('اطلاعات حساب شما با موفقیت ذخیره شد.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const message = await sendContact(profile, subject, text, attachments);
      setMessages(old => [message, ...old]); setSubject(''); setText(''); setAttachments([]);
      setTab('messages'); setExpanded(message.id);
      setNotice(mode === 'server' ? 'پیام شما برای مدیریت ارسال شد. پاسخ را در همین بخش ببینید.' : 'پیام در صندوق محلی همین مرورگر ثبت شد؛ به دستگاه دیگری ارسال نشده است.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return <div className="admin-root account-root" dir="rtl"><header className="account-header"><div className="account-header-inner"><Brand /><AButton variant="ghost" onClick={onBack}>بازگشت به بازی<ArrowLeft size={17} /></AButton></div></header><main className="account-layout"><aside className="account-sidebar"><div className="account-identity"><div className="account-avatar">{profile.name.slice(0, 1)}</div><h2>{profile.name}</h2><span>{profile.track === 'kids' ? 'ردهٔ کودکان' : 'دانشجوی بزرگسال'}</span><p>شمارهٔ دانشجویی: {studentNo(profile)}</p></div><nav>{[{ id: 'profile', title: content.settings.labels.account, icon: UserRound }, { id: 'contact', title: content.settings.contactTitle, icon: Send }, { id: 'messages', title: 'پیام‌های من', icon: MessageSquare }].map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id as typeof tab)}><item.icon size={18} />{item.title}{item.id === 'messages' && messages.length > 0 && <span>{faNum(messages.length)}</span>}</button>)}</nav><div className="account-privacy"><ShieldCheck size={19} /><p>شمارهٔ موبایل و پیام‌های شما در فهرست عمومی کاربران نمایش داده نمی‌شوند.</p></div></aside><section className="account-content"><div className="a-page-heading"><div><h1>{tab === 'profile' ? 'حساب شخصی شما' : tab === 'contact' ? content.settings.contactTitle : 'پیام‌های من'}</h1><p>{tab === 'profile' ? 'اطلاعاتتان را به‌روز نگه دارید و با دانشگاه در ارتباط باشید.' : tab === 'contact' ? content.settings.contactIntro : 'وضعیت پیام‌ها و پاسخ‌های مدیریت را اینجا دنبال کنید.'}</p></div></div>{profile.status === 'blocked' && <div className="a-error">دسترسی این حساب توسط مدیریت غیرفعال شده است.</div>}<ErrorNotice error={error} />{notice && <div className="a-success" role="status"><Check size={15} style={{ display: 'inline', marginLeft: 8 }} />{notice}</div>}
      {tab === 'profile' && <form className="a-panel" onSubmit={save}><header className="a-panel-head"><h2><UserRound size={19} />اطلاعات فردی</h2><span className="a-inline-tag">عضویت از {faDate(profile.createdAt)}</span></header><div className="a-panel-body"><div className="a-form-grid"><Field label="نام شما" required><input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoComplete="name" /></Field><Field label={profile.track === 'kids' ? 'موبایل والد یا سرپرست' : 'شماره موبایل'} hint="اختیاری؛ این شماره پیامکی تأیید نمی‌شود."><div className="account-input-icon"><Smartphone size={17} /><input value={mobile} onChange={e => setMobile(e.target.value)} type="tel" inputMode="tel" dir="ltr" placeholder="09123456789" autoComplete="tel" maxLength={20} /></div></Field><Field label="ایمیل (اختیاری)"><div className="account-input-icon"><Mail size={17} /><input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr" placeholder="you@example.com" autoComplete="email" /></div></Field><Field label="ردهٔ سنی"><input value={profile.track === 'kids' ? 'کودکان' : 'بزرگسالان'} readOnly /></Field></div><label className="a-check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{profile.track === 'kids' ? 'من والد یا سرپرست هستم و با ثبت این شماره برای ارتباط با مدیریت دانشگاه موافقم.' : 'با نگهداری اطلاعات تماسم و دسترسی مدیر دانشگاه به آن برای پاسخ‌گویی موافقم.'}</label><div className="a-form-actions"><AButton type="submit" busy={busy} disabled={profile.status === 'blocked' || !name.trim()}><Save size={16} />ذخیرهٔ اطلاعات</AButton></div></div>{mode === 'server' && <div className="account-recovery"><KeyRound size={19} /><div><strong>ورود در دستگاه دیگر</strong><p>کد بازیابی مانند رمز شخصی شماست؛ آن را فقط نزد خودتان نگه دارید.</p>{revealCode && <textarea readOnly className="a-json" style={{ minHeight: 70 }} value={recoveryCode(profile.id)} />}</div><AButton variant="ghost" onClick={() => setRevealCode(!revealCode)}>{revealCode ? 'پنهان کردن' : 'نمایش کد'}</AButton></div>}</form>}
      {tab === 'contact' && <>{mode !== 'server' && <div className="a-warning">حالت محلی: پیام و فایل فقط در همین مرورگر ذخیره می‌شوند و مدیر همین مرورگر آن‌ها را می‌بیند. دریافت روی دستگاه مدیر پس از اجرای سرور فعال می‌شود.</div>}{content.settings.contactEnabled ? <form className="a-panel" onSubmit={send}><header className="a-panel-head"><h2><Send size={18} />پیام جدید برای مدیریت</h2></header><div className="a-panel-body"><Field label="موضوع پیام" required><input value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} required placeholder="دربارهٔ چه موضوعی می‌خواهید بنویسید؟" /></Field><Field label="متن پیام" required><textarea value={text} onChange={e => setText(e.target.value)} required maxLength={5000} rows={6} placeholder="پرسش، پیشنهاد یا تجربهٔ خود را بنویسید..." /><span className="a-hint">{faNum(text.length)} از {faNum(5000)} نویسه</span></Field><div className="account-attach-zone"><div><Paperclip size={19} /><strong>فایلی برای فرستادن دارید؟</strong><p>تصویر، PDF، متن یا صدا؛ حداکثر ۳ فایل و هر فایل تا ۵ مگابایت</p></div><AButton variant="secondary" disabled={attachments.length >= 3} onClick={() => attachmentInput.current?.click()}><PlusIcon />پیوست فایل</AButton><input ref={attachmentInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/*" multiple onChange={e => { const added = Array.from(e.target.files || []); try { if (added.length + attachments.length > 3) throw new Error('حداکثر ۳ فایل قابل پیوست است.'); added.forEach(f => validateFile(f, 'contact')); setAttachments(old => [...old, ...added]); setError(''); } catch (err) { setError((err as Error).message); } e.target.value = ''; }} /></div>{attachments.length > 0 && <div className="account-file-list">{attachments.map((f, i) => <div key={`${f.name}-${i}`}><FileText size={16} /><span>{f.name}</span><small dir="ltr">{humanSize(f.size)}</small><button type="button" aria-label={`حذف ${f.name}`} className="a-icon-button" onClick={() => setAttachments(attachments.filter((_, index) => i !== index))}><X size={14} /></button></div>)}</div>}<p className="a-hint" style={{ marginTop: 18 }}>فقط محتوایی را بفرستید که اجازهٔ اشتراک آن را دارید. فایل و پیام برای مدیریت و صاحب همین حساب قابل مشاهده است.</p><div className="a-form-actions"><AButton type="submit" busy={busy} disabled={!subject.trim() || !text.trim() || profile.status === 'blocked'}><Send size={16} />ارسال پیام</AButton></div></div></form> : <div className="a-panel"><EmptyState icon={MessageSquare} title="ارسال پیام موقتاً غیرفعال است" text="پیام‌های قبلی و پاسخ‌ها از قسمت «پیام‌های من» در دسترس هستند." /></div>}{(content.settings.contactEmail || content.settings.contactPhone) && <div className="account-direct-contact">{content.settings.contactEmail && <a href={`mailto:${content.settings.contactEmail}`}><Mail size={16} /><span dir="ltr">{content.settings.contactEmail}</span></a>}{content.settings.contactPhone && <a href={`tel:${content.settings.contactPhone}`}><Smartphone size={16} /><span dir="ltr">{content.settings.contactPhone}</span></a>}</div>}</>}
      {tab === 'messages' && <div className="a-panel">{messages.length ? messages.map(m => <div className="account-message" key={m.id}><button className="account-message-heading" onClick={() => setExpanded(expanded === m.id ? '' : m.id)}><MessageSquare size={19} /><div><strong>{m.subject}</strong><span>{faDate(m.createdAt)} / کد پیگیری {m.id.slice(0, 8)}</span></div><span className={`a-pill ${m.status === 'replied' ? 'a-pill-green' : 'a-pill-gold'}`}>{statusNames[m.status]}</span></button>{expanded === m.id && <div className="account-message-body"><p className="a-thread-text">{m.text}</p><div className="a-attachments">{m.attachments.map(a => <button key={a.id} onClick={async () => { try { downloadBlob(await attachmentBlob(a.id, profile.id), a.name); } catch (e) { setError((e as Error).message); } }}><Paperclip size={14} />{a.name}<Download size={14} /></button>)}</div>{m.replies.map(r => <div className="a-reply" key={r.id}><small>پاسخ مدیریت / {faDate(r.createdAt)}</small><p>{r.text}</p></div>)}{!m.replies.length && <p className="a-page-note">هنوز پاسخی ثبت نشده است.</p>}</div>}</div>) : <EmptyState icon={MessageSquare} title="هنوز پیامی نفرستاده‌اید" text="برای فرستادن پرسش، نظر یا فایل از بخش ارتباط با ما استفاده کنید."><AButton variant="secondary" onClick={() => changeTab('contact')}><Send size={15} />نوشتن پیام</AButton></EmptyState>}</div>}
    </section></main><footer className="account-footer">{content.settings.shortTitle} / همراه مسیر یادگیری شما</footer></div>;
}

function PlusIcon() { return <Paperclip size={15} />; }