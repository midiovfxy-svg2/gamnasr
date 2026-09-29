import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpLeft, Bell, BookOpen, Check, ChevronLeft, ChevronDown, Download, Eye, EyeOff, FileText, Headphones, HelpCircle, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu, MessageSquare, Palette, Plus, Search, Settings2, ShieldCheck, UserRound, Users, Database, X, type LucideIcon } from 'lucide-react';
import { useSite } from '../lib/SiteContext';
import { faDate, faNum } from '../lib/storage';
import { adminSession, getAdminSnapshot, loginAdmin, logoutAdmin, type AdminSnapshot } from '../lib/service';
import { downloadJSON } from '../lib/files';
import { AButton, AdminDialog, Brand, EmptyState, ErrorNotice, Field, Glyph } from './kit';
import { CoursesEditor, CurriculumSummary, SharedTextsEditor, type SaveContent } from './ContentEditors';
import { MediaEditor } from './MediaEditor';
import { InboxEditor, UsersEditor } from './PeopleEditors';
import { AppearanceEditor, BackupsEditor, SecurityEditor } from './SettingsEditors';
import './admin.css';

type Page = 'overview' | 'courses' | 'texts' | 'media' | 'users' | 'messages' | 'appearance' | 'security' | 'backups';
const navigation: { id: Page; title: string; icon: LucideIcon; group: number }[] = [
  { id: 'overview', title: 'پیشخوان', icon: LayoutDashboard, group: 0 },
  { id: 'courses', title: 'مراحل و محتوای بازی', icon: BookOpen, group: 1 },
  { id: 'texts', title: 'متن‌ها و باورها', icon: FileText, group: 1 },
  { id: 'media', title: 'صداها و تصاویر', icon: Headphones, group: 1 },
  { id: 'users', title: 'مدیریت کاربران', icon: Users, group: 2 },
  { id: 'messages', title: 'پیام‌های کاربران', icon: MessageSquare, group: 2 },
  { id: 'appearance', title: 'ظاهر و تنظیمات سایت', icon: Palette, group: 2 },
  { id: 'security', title: 'امنیت و دسترسی', icon: ShieldCheck, group: 2 },
  { id: 'backups', title: 'پشتیبان و تاریخچه', icon: Database, group: 2 },
];
const descriptions: Record<Page, string> = {
  overview: 'سلام، مدیر عزیز. نمایی از آنچه در دانشگاه شما می‌گذرد.',
  courses: 'مقاطع، درس‌ها، پرسش‌ها و شخصیت‌های بازی را مدیریت کنید.',
  texts: 'متن‌های اصلی، باورهای مرجع و منابع؛ همه در دسترس شما.',
  media: 'کتابخانهٔ صدای استاد، تصاویر و شکل‌های بازی.',
  users: 'اطلاعات، شماره موبایل و مسیر پیشرفت کاربران در یک نگاه.',
  messages: 'صدای کاربران را بشنوید؛ پیام‌ها و فایل‌هایشان اینجاست.',
  appearance: 'هویت، عنوان‌ها و ظاهر دانشگاه را به سلیقهٔ خود تنظیم کنید.',
  security: 'رمز ورود و وضعیت حفاظت از اطلاعات سامانه.',
  backups: 'از محتوا نسخه بگیرید و با اطمینان به نسخه‌های قبلی برگردید.',
};

export function AdminLogin({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const { content, mode } = useSite();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="admin-root a-login-screen" dir="rtl"><header className="a-login-top"><Brand small /><AButton variant="ghost" onClick={onBack}>بازگشت به دانشگاه<ArrowLeft size={16} /></AButton></header><main className="a-login-layout"><section className="a-login-art"><div className="a-orbit-art"><svg viewBox="0 0 208 208" fill="none" aria-hidden="true"><circle cx="104" cy="104" r="100" stroke="#e2c685" strokeOpacity=".16" strokeDasharray="2 5" /><circle cx="104" cy="104" r="77" stroke="#e2c685" strokeOpacity=".25" /><circle cx="104" cy="104" r="56" stroke="#e2c685" strokeOpacity=".13" /><circle cx="165" cy="57" r="4" fill="#d2bb7c" /><circle cx="54" cy="165" r="3" fill="#819a95" /></svg><span><Glyph value={content.settings.logo} size={43} /></span></div><h2>{content.settings.shortTitle}<br /><span style={{ fontSize: 17, fontWeight: 400 }}>هر گام، فرصتی برای رشد</span></h2><p>مدیریت یکپارچهٔ محتوا، مسیرهای یادگیری و ارتباط با دانشجویان</p><div className="a-login-art-footer">NASR UNIVERSITY</div></section><form className="a-login-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await loginAdmin(password); setPassword(''); onSuccess(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><div className="a-login-lock"><LockKeyhole size={22} /></div><h1>ورود به پنل مدیریت</h1><p>این بخش مخصوص مدیر دانشگاه است.<br />برای ادامه، رمز عبور خود را وارد کنید.</p><ErrorNotice error={error} /><Field label="رمز عبور مدیر" required><div className="a-password-input"><input type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور خود را وارد کنید" dir="ltr" autoComplete="current-password" autoFocus required maxLength={128} /><button type="button" className="a-icon-button" aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field><AButton type="submit" busy={busy} disabled={mode === 'checking' || !password}><ShieldCheck size={17} />ورود به مدیریت<ArrowLeft size={16} style={{ marginRight: 'auto' }} /></AButton><p className="a-login-note">{mode === 'server' ? 'دسترسی مدیریت با احراز هویت سمت سرور محافظت می‌شود.' : mode === 'checking' ? 'در حال بررسی اتصال سامانه...' : 'حالت محلی: این قفل فقط مربوط به همین مرورگر است. حفاظت واقعی و دریافت پیام سایر دستگاه‌ها نیازمند اجرای سرور است.'}</p></form></main><footer className="a-login-foot">محتوای دانشگاه با دقت شما حفظ می‌شود.</footer></div>;
}

const emptySnapshot: AdminSnapshot = { users: [], messages: [], audit: [], revisions: [] };

export function AdminPanel({ onExit, onLoggedOut, onSave }: { onExit: () => void; onLoggedOut: () => void; onSave: SaveContent }) {
  const { content, mode } = useSite();
  const [page, setPage] = useState<Page>('overview');
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(emptySnapshot);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [help, setHelp] = useState(false);
  const [focusLesson, setFocusLesson] = useState<string>();
  const [focusMessage, setFocusMessage] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const latestLogout = useRef(onLoggedOut);
  latestLogout.current = onLoggedOut;
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(async () => {
    try { setSnapshot(await getAdminSnapshot()); setError(''); }
    catch (e) {
      setError((e as Error).message);
      try { if (!(await adminSession())) latestLogout.current(); } catch { /* Keep the error visible during a network outage. */ }
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const interval = setInterval(() => { void refresh(); }, 30000); return () => clearInterval(interval); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); searchRef.current?.focus(); } if (e.key === 'Escape') { setQuery(''); setMenu(false); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const navigate = (next: Page) => { setPage(next); setMenu(false); setQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save: SaveContent = async (next, label) => { await onSave(next, label); await refresh(); notify('تغییرات با موفقیت ذخیره شد.'); };
  const onFocusConsumed = useCallback(() => setFocusLesson(undefined), []);
  const lessons = [...content.adult, ...content.kids].flatMap(d => d.lessons);
  const unread = snapshot.messages.filter(m => m.status === 'unread').length;
  const audios = content.media.filter(m => m.type === 'audio');
  const currentNav = navigation.find(n => n.id === page)!;
  const metrics: { title: string; value: number; description: string; icon: LucideIcon; color: string; bg: string; target: Page }[] = [
    { title: 'دانشجویان دانشگاه', value: snapshot.users.length, description: `${faNum(snapshot.users.filter(u => u.status !== 'blocked').length)} حساب فعال`, icon: Users, color: '#8195b2', bg: '#eff3f9', target: 'users' },
    { title: 'درس‌های آموزشی', value: lessons.length, description: `${faNum(lessons.filter(l => l.published !== false).length)} درس منتشرشده`, icon: BookOpen, color: '#b8a06e', bg: '#f8f4ea', target: 'courses' },
    { title: 'پیام‌های جدید', value: unread, description: 'در انتظار بررسی شما', icon: MessageSquare, color: '#83a896', bg: '#eef6f1', target: 'messages' },
    { title: 'فایل‌های صوتی', value: audios.length, description: `${faNum(audios.filter(a => a.enabled).length)} فایل فعال در کتابخانه`, icon: Headphones, color: '#a493b5', bg: '#f4eff8', target: 'media' },
  ];

  return <div className="admin-root admin-app" dir="rtl">{menu && <div className="a-sidebar-scrim" onClick={() => setMenu(false)} />}<aside className={`a-sidebar ${menu ? 'open' : ''}`}><Brand /><nav>{[0, 1, 2].map(group => <div key={group}>{group > 0 && <div className="a-nav-caption">{group === 1 ? 'محتوای دانشگاه' : 'مدیریت سامانه'}</div>}{navigation.filter(n => n.group === group).map(n => <button key={n.id} className={`a-nav-link ${page === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}><n.icon />{n.title}{n.id === 'messages' && unread > 0 && <b>{faNum(unread)}</b>}</button>)}</div>)}</nav><div className="a-sidebar-foot"><div className={`a-connection ${mode === 'server' ? 'online' : ''}`}><i />{mode === 'server' ? 'متصل به سرور دانشگاه' : 'ذخیره‌سازی محلی مرورگر'}</div><div className="a-admin-person"><span className="a-avatar"><UserRound size={20} /></span><div><strong>مدیر دانشگاه</strong><small>دسترسی کامل</small></div><button title="خروج از مدیریت" onClick={async () => { try { await logoutAdmin(); onLoggedOut(); } catch (e) { setError((e as Error).message); } }}><LogOut size={18} /></button></div></div></aside>
    <div className="a-main"><header className="a-topbar"><button className="a-icon-button a-menu-toggle" aria-label="باز کردن منوی مدیریت" onClick={() => setMenu(true)}><Menu size={21} /></button><div className="a-breadcrumb"><span>پنل مدیریت</span><ChevronLeft size={12} /><b>{currentNav.title}</b></div><div className="a-top-actions"><div className="a-top-search"><Search size={16} /><input ref={searchRef} placeholder="جستجو در مدیریت..." value={query} onChange={e => setQuery(e.target.value)} aria-label="جستجو در مدیریت" /><kbd>/</kbd>{query && <div className="a-search-results">{navigation.filter(n => n.title.includes(query)).map(n => <button key={n.id} onClick={() => navigate(n.id)}><n.icon size={16} />{n.title}</button>)}{lessons.filter(l => l.title.includes(query)).slice(0, 6).map(l => <button key={l.id} onClick={() => { setFocusLesson(l.id); navigate('courses'); }}><BookOpen size={16} />{l.title}</button>)}{!navigation.some(n => n.title.includes(query)) && !lessons.some(l => l.title.includes(query)) && <p className="a-hint" style={{ padding: 10 }}>نتیجه‌ای پیدا نشد.</p>}</div>}</div><button className="a-icon-button" aria-label="پیام‌های جدید" onClick={() => navigate('messages')}><Bell size={19} />{unread > 0 && <i className="a-unread-dot" />}</button><button className="a-icon-button" aria-label="راهنمای مدیریت" onClick={() => setHelp(true)}><HelpCircle size={19} /></button><span className="a-top-divider" /><button className="a-top-profile" style={{ background: 'none', border: 0 }} onClick={() => navigate('security')}><span className="a-avatar"><UserRound size={17} /></span><span>مدیر دانشگاه</span><ChevronDown size={13} /></button></div></header>
    <main className="a-content" key={page}><div className="a-page-heading"><div><h1>{page === 'overview' ? 'پیشخوان مدیریت' : currentNav.title}</h1><p>{descriptions[page]}</p></div><div className="a-page-actions"><AButton variant="secondary" onClick={onExit}><Eye size={16} />مشاهدهٔ سایت<ArrowUpLeft size={13} /></AButton>{page === 'overview' && <AButton onClick={() => navigate('courses')}><Plus size={16} />مدیریت محتوا</AButton>}</div></div>
    {mode === 'local' && <div className="a-local-notice"><Database size={15} /><span>حالت محلی فعال است. تغییرات، کاربران و پیام‌ها فقط در همین مرورگر نگهداری می‌شوند.</span><button onClick={() => setHelp(true)}>راهنمای اتصال سرور</button></div>}
    <ErrorNotice error={error} />{loading && <div className="a-page-note" style={{ paddingBottom: 15 }}><LoaderCircle className="spin" size={14} style={{ display: 'inline', marginLeft: 7 }} />در حال دریافت اطلاعات...</div>}
    {page === 'overview' && <><div className="a-metrics">{metrics.map(m => <button className="a-metric" key={m.target} onClick={() => navigate(m.target)}><div className="a-metric-top"><span>{m.title}</span><span className="a-metric-symbol" style={{ background: m.bg, color: m.color }}><m.icon size={19} strokeWidth={1.5} /></span></div><strong>{faNum(m.value)}</strong><div className="a-metric-bottom"><span>{m.description}</span><ArrowUpLeft size={17} color={m.color} /></div></button>)}</div>
      <div className="a-grid-main"><section className="a-panel"><header className="a-panel-head"><div><h2>محتوای آموزشی دانشگاه</h2><p>درس‌های مسیر تکامل دانشجویان</p></div><AButton variant="ghost" onClick={() => navigate('courses')}>همهٔ درس‌ها<ArrowLeft size={14} /></AButton></header><div className="a-table-scroll"><table className="a-table"><thead><tr><th>عنوان درس</th><th>مقطع</th><th>وضعیت</th><th /></tr></thead><tbody>{content.adult.flatMap(d => d.lessons.map(l => ({ l, d }))).slice(0, 5).map(({ l, d }) => <tr key={l.id}><td><div className="a-table-title"><span className="a-course-icon"><Glyph value={l.icon} size={23} /></span><div><strong style={{ maxWidth: 205, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</strong><small>{faNum(l.quiz.length)} پرسش / {faNum(l.texts.length)} متن</small></div></div></td><td style={{ color: '#8f9bab', fontSize: 10 }}>{d.name}</td><td><span className={`a-pill ${l.published !== false ? 'a-pill-green' : 'a-pill-gold'}`}>{l.published !== false ? 'منتشرشده' : 'پیش‌نویس'}</span></td><td><button className="a-icon-button" title={`ویرایش ${l.title}`} onClick={() => { setFocusLesson(l.id); navigate('courses'); }}><Settings2 size={16} /></button></td></tr>)}</tbody></table></div>{!content.adult.some(d => d.lessons.length) && <EmptyState title="هنوز درسی اضافه نشده است" />}<div className="a-table-pagination"><span>محتوا بدون بازنویسی خودکار نگهداری می‌شود.</span><ShieldCheck size={15} color="#a6b39d" /></div></section><CurriculumSummary content={content} onOpen={() => navigate('courses')} /></div>
      <div className="a-grid-main"><section className="a-panel"><header className="a-panel-head"><div><h2>آخرین پیام‌های کاربران{unread > 0 && <span className="a-pill a-pill-gold">{faNum(unread)} جدید</span>}</h2><p>ارتباط مستقیم با دانشجویان دانشگاه</p></div><AButton variant="ghost" onClick={() => navigate('messages')}>صندوق پیام‌ها<ArrowLeft size={14} /></AButton></header>{snapshot.messages.length ? snapshot.messages.slice(0, 3).map(m => <button className="a-message-row" key={m.id} onClick={() => { setFocusMessage(m.id); navigate('messages'); }}><span className="a-message-avatar">{m.name.slice(0, 1)}</span><div><strong>{m.name}</strong><p>{m.subject}</p></div><time>{faDate(m.createdAt)}</time></button>) : <EmptyState icon={MessageSquare} title="برای شنیدن صدای کاربران آماده‌اید" text="پیام‌ها و فایل‌های ارسالی از بخش «ارتباط با ما» در اینجا نمایش داده می‌شوند." />}</section><section className="a-panel"><header className="a-panel-head"><h2>فعالیت‌های اخیر</h2><Activity size={17} color="#a6afb9" /></header><div className="a-panel-body">{snapshot.audit.length ? snapshot.audit.slice(0, 3).map(a => <div className="a-activity" key={a.id}><span><Check size={13} /></span><div><strong>{a.title}</strong><p>{a.detail.slice(0, 44)} / {faDate(a.createdAt)}</p></div></div>) : <EmptyState icon={Activity} title="تغییرات از اینجا دنبال می‌شوند" text="فعالیت‌های مدیریتی پس از انجام، در این فهرست ثبت می‌شوند." />}</div></section></div>
      <div className="a-shortcuts">{[{ icon: BookOpen, title: 'مدیریت درس‌ها', sub: 'متن، پرسش و شخصیت', page: 'courses' }, { icon: Headphones, title: 'کتابخانهٔ رسانه', sub: 'بارگذاری صدا و تصویر', page: 'media' }, { icon: Users, title: 'اطلاعات کاربران', sub: 'مشاهده و ویرایش موبایل', page: 'users' }, { icon: Database, title: 'پشتیبان محتوا', sub: 'حفظ و بازیابی تغییرات', page: 'backups' }].map(a => <button key={a.page} className="a-shortcut" onClick={() => navigate(a.page as Page)}><a.icon size={21} strokeWidth={1.5} /><div><strong>{a.title}</strong><span>{a.sub}</span></div><ArrowLeft size={14} /></button>)}</div>
    </>}
    {page === 'courses' && <CoursesEditor content={content} onSave={save} focusId={focusLesson} onFocusConsumed={onFocusConsumed} />}
    {page === 'texts' && <SharedTextsEditor content={content} onSave={save} />}
    {page === 'media' && <MediaEditor content={content} onSave={save} />}
    {page === 'users' && <UsersEditor users={snapshot.users} onRefresh={refresh} notify={notify} />}
    {page === 'messages' && <InboxEditor messages={snapshot.messages} onRefresh={refresh} notify={notify} initialId={focusMessage} />}
    {page === 'appearance' && <AppearanceEditor content={content} onSave={save} />}
    {page === 'security' && <SecurityEditor notify={notify} />}
    {page === 'backups' && <BackupsEditor content={content} revisions={snapshot.revisions} onSave={save} />}
    <footer className="a-footer"><span>{content.settings.shortTitle} / مدیریت با دقت، یادگیری با آرامش</span><span>{faDate(Date.now())}</span></footer></main></div>
    {toast && <div className="a-toast" role="status"><Check size={18} />{toast}<button style={{ border: 0, background: 'none', color: 'inherit', marginRight: 10 }} aria-label="بستن اعلان" onClick={() => setToast('')}><X size={14} /></button></div>}
    {help && <AdminDialog title="راهنمای مدیریت دانشگاه" onClose={() => setHelp(false)}><div className="a-warning">{mode === 'server' ? 'سرور متصل است؛ تغییرات و پیام‌ها بین دستگاه‌ها مشترک هستند.' : 'در پیش‌نمایش فعلی سرور فعال نیست؛ داده‌های هر مرورگر جدا هستند.'}</div><div className="a-editor-section"><h3>مدیریت محتوای حساس</h3><p className="a-page-note">درس‌ها، پرسش‌ها و روایت شخصیت‌ها از «مراحل و محتوای بازی» ویرایش می‌شوند. متن‌های مشترک، تمرین‌ها و شکل‌های نعمت‌یاب در «متن‌ها و باورها» هستند. هیچ متن آموزشی به‌صورت خودکار تغییر نمی‌کند.</p></div><div className="a-editor-section"><h3>فعال‌سازی روی هاست</h3><p className="a-page-note">سرور Node.js در پوشهٔ server همراه پروژه است. راهنمای DEPLOYMENT.md مراحل اجرای سایت، رمز مدیریت، HTTPS و پشتیبان‌گیری را توضیح می‌دهد. با اجرای سرور روی همان دامنه، اتصال برنامه خودکار انجام می‌شود.</p></div><div className="a-editor-section"><h3>موبایل و پیام‌های کاربران</h3><p className="a-page-note">کاربران از حساب شخصی خود موبایل و پیام ثبت می‌کنند. شماره‌ها پیامکی تأیید نمی‌شوند. پاسخ مدیر داخل حساب کاربر نمایش داده می‌شود؛ ارسال پیامک یا ایمیل خودکار فعال نیست.</p></div><AButton variant="secondary" onClick={() => downloadJSON({ format: 'nasr-content-backup', content, exportedAt: Date.now() }, 'nasr-content-backup.json')}><Download size={16} />پشتیبان از محتوای فعلی</AButton></AdminDialog>}
  </div>;
}