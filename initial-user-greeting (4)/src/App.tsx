import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { Track, Traveler } from './data/types';
import { clamp, loadState, newProfile, saveState, todayKey, type AppState, type Profile } from './lib/storage';
import { type Voice } from './lib/voices';
import { defaultContent, publishedDegrees, type SiteContent } from './lib/content';
import { SiteProvider } from './lib/SiteContext';
import { adminSession, bootstrap, getMyProfile, registerProfile, saveContent, syncProgress, type StorageMode } from './lib/service';
import { getFile } from './lib/files';
import { Home } from './components/Home';
import { Campus } from './components/Campus';
import { LessonView } from './components/LessonView';
import { TravelerStory } from './components/TravelerStory';
import { Library } from './components/Library';
import { Certificate } from './components/Certificate';
import { KidsBg, Modal, StarsBg, Toast } from './components/ui';
import { UserPanel } from './components/UserPanel';
import { AdminLogin, AdminPanel } from './admin/AdminPanel';
import './components/account.css';

type Route = 'game' | 'admin' | 'account' | 'contact';
const readRoute = (): Route => {
  const value = location.hash.replace(/^#\/?/, '');
  return value === 'admin' || value === 'account' || value === 'contact' ? value : 'game';
};

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [content, setContent] = useState<SiteContent>(() => structuredClone(defaultContent));
  const [mode, setMode] = useState<StorageMode>('checking');
  const [bootError, setBootError] = useState('');
  const [route, setRoute] = useState<Route>(readRoute);
  const [authenticated, setAuthenticated] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [certId, setCertId] = useState<string | null>(null);
  const [travelerModal, setTravelerModal] = useState<{ t: Traveler; lessonId: string } | null>(null);
  const [toast, setToast] = useState<ReactNode>(null);
  const [atHome, setAtHome] = useState(() => !loadState().activeId);
  const [pendingCert, setPendingCert] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const profile = state.profiles.find(p => p.id === state.activeId) || null;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const kids = profile?.track === 'kids';
  const degrees = useMemo(() => publishedDegrees(kids ? content.kids : content.adult), [content, kids]);
  const allLessons = useMemo(() => degrees.flatMap(d => d.lessons.map(l => ({ l, d }))), [degrees]);

  const navigate = useCallback((next: Route) => {
    location.hash = next === 'game' ? '/' : `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const change = () => setRoute(readRoute());
    const profilesUpdated = () => setState(loadState());
    window.addEventListener('hashchange', change);
    window.addEventListener('nasr-profiles-updated', profilesUpdated);
    const storage = (e: StorageEvent) => { if (e.key === 'nasr-university-v1') profilesUpdated(); };
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('nasr-profiles-updated', profilesUpdated); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    let mounted = true;
    bootstrap().then(async result => {
      if (!mounted) return;
      setContent(result.content); setMode(result.mode);
      setAuthenticated(await adminSession());
    }).catch(error => { if (mounted) setBootError((error as Error).message); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    try { saveState(state); } catch (error) { setToast((error as Error).message); }
  }, [state]);
  useEffect(() => {
    let mounted = true;
    Promise.all(content.media.filter(m => m.type === 'audio' && m.enabled).map(async m => ({
      id: m.id, name: m.name, kind: m.blobId ? 'file' as const : 'url' as const,
      url: m.url, fallback: m.fallback, createdAt: m.createdAt,
      blob: m.blobId ? await getFile(m.blobId).catch(() => undefined) : undefined,
    }))).then(next => { if (mounted) setVoices(next); });
    return () => { mounted = false; };
  }, [content.media]);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => { adminSession().then(setAuthenticated).catch(() => setAuthenticated(false)); }, 60000);
    return () => clearInterval(timer);
  }, [authenticated]);
  useEffect(() => {
    if (!lessonId && pendingCert) { const timer = setTimeout(() => { setCertId(pendingCert); setPendingCert(null); }, 500); return () => clearTimeout(timer); }
  }, [lessonId, pendingCert]);

  const update = useCallback((fn: (p: Profile) => Profile) => setState(s => ({ ...s, profiles: s.profiles.map(p => p.id === s.activeId ? fn(p) : p) })), []);
  const replaceProfile = useCallback((p: Profile) => setState(s => ({ ...s, profiles: s.profiles.map(old => old.id === p.id ? p : old) })), []);

  useEffect(() => {
    if (mode !== 'server' || !profile?.id || route === 'admin') return;
    let mounted = true;
    const load = async () => {
      const current = profileRef.current;
      if (!current) return;
      try {
        const next = await getMyProfile(current);
        if (mounted) update(old => (old.progressRevision || 0) !== (next.progressRevision || 0)
          ? next
          : { ...old, name: next.name, mobile: next.mobile, email: next.email, status: next.status, track: next.track });
      } catch (error) { if (mounted) setToast((error as Error).message); }
    };
    void load(); const timer = setInterval(() => void load(), 45000);
    return () => { mounted = false; clearInterval(timer); };
  }, [mode, profile?.id, route, update]);

  const progressKey = profile ? JSON.stringify([profile.progressRevision, profile.progress, profile.daily, profile.repeats, profile.blessings, profile.frequency, profile.certs]) : '';
  useEffect(() => {
    if (mode !== 'server' || !profileRef.current || route === 'admin') return;
    const timer = setTimeout(() => { const p = profileRef.current; if (p && p.status !== 'blocked') syncProgress(p).catch(error => setToast(`پیشرفت هنوز روی سرور ذخیره نشده: ${(error as Error).message}`)); }, 1500);
    return () => clearTimeout(timer);
  }, [progressKey, mode, route]);

  const voicesFor = (target: string) => voices.filter(v => (content.voiceAssignments[target] || []).includes(v.id));
  const onAnswer = (ok: boolean) => update(p => { const momentum = ok ? p.momentum + 1 : 0; return { ...p, momentum, bestMomentum: Math.max(p.bestMomentum, momentum), frequency: clamp(p.frequency + (ok ? 3 : -2)), lastSeen: Date.now() }; });
  const onPass = (id: string, score: number, total: number, stars: number) => {
    if (!profile) return;
    const prev = profile.progress[id];
    const progress = { ...profile.progress, [id]: { stars: Math.max(prev?.stars || 0, stars), best: Math.max(prev?.best || 0, score), total, done: true, traveler: prev?.traveler } };
    const certs = { ...profile.certs };
    let newCert: string | null = null;
    for (const d of degrees) if (d.lessons.length && !certs[d.id] && d.lessons.every(l => progress[l.id]?.done)) { certs[d.id] = Date.now(); newCert = d.id; }
    update(p => ({ ...p, progress, certs, frequency: clamp(p.frequency + 5) }));
    if (newCert) setPendingCert(newCert);
  };
  const onTravelerDone = (id: string) => update(p => ({ ...p, frequency: clamp(p.frequency + (p.progress[id]?.traveler ? 0 : 8)), progress: { ...p.progress, [id]: { ...(p.progress[id] || { stars: 1, best: 0, total: 0, done: true }), traveler: true } } }));
  const onCollect = (t: string) => update(p => p.blessings.includes(t) ? p : { ...p, blessings: [...p.blessings, t], frequency: clamp(p.frequency + 1) });
  const onToggleDaily = (id: string) => update(p => { const k = todayKey(); const cur = p.daily[k] || []; const on = cur.includes(id); return { ...p, daily: { ...p.daily, [k]: on ? cur.filter(x => x !== id) : [...cur, id] }, frequency: clamp(p.frequency + (on ? -2 : 2)) }; });
  const onRepeat = (k: string) => update(p => { const n = (p.repeats[k] || 0) + 1; return { ...p, repeats: { ...p.repeats, [k]: n }, frequency: clamp(p.frequency + (n % 5 === 0 ? 1 : 0)) }; });

  const createProfile = async (name: string, track: Track) => {
    if (!content.settings.registration) throw new Error('ثبت‌نام جدید موقتاً غیرفعال است.');
    if (mode === 'checking') throw new Error('لطفاً تا پایان بررسی اتصال صبر کنید.');
    const p = newProfile(name, track);
    await registerProfile(p);
    setState(s => ({ profiles: [...s.profiles, p], activeId: p.id }));
    setAtHome(false); navigate('game');
  };
  const openAccount = (contact = false) => {
    if (!profile) { setToast('ابتدا نام خود را ثبت کنید یا وارد حساب این دستگاه شوید.'); document.getElementById('student-name')?.focus(); return; }
    navigate(contact ? 'contact' : 'account');
  };
  const saveSite = async (next: SiteContent, label: string) => { setContent(await saveContent(next, label)); };
  const current = lessonId ? allLessons.find(x => x.l.id === lessonId) : null;
  const certDegree = certId ? degrees.find(d => d.id === certId) : null;

  return <SiteProvider content={content} mode={mode}>
    {bootError && <div className="a-error" style={{ position: 'fixed', top: 15, left: 15, right: 15, zIndex: 200 }} role="alert">{bootError}<button onClick={() => location.reload()} style={{ marginRight: 15 }}>تلاش دوباره</button></div>}
    {route === 'admin' ? authenticated ? <AdminPanel onExit={() => navigate('game')} onLoggedOut={() => setAuthenticated(false)} onSave={saveSite} /> : <AdminLogin onSuccess={() => setAuthenticated(true)} onBack={() => navigate('game')} /> : (route === 'account' || route === 'contact') && profile ? <UserPanel key={`${profile.id}-${route}`} profile={profile} onBack={() => navigate('game')} onProfileChange={replaceProfile} initialTab={route === 'contact' ? 'contact' : 'profile'} /> : <div dir="rtl" className="min-h-screen font-sans game-surface">
      {kids && !atHome ? <KidsBg /> : <StarsBg />}
      {atHome || !profile ? <Home state={state} homeVoices={voicesFor('home')} onSelect={id => { setState(s => ({ ...s, activeId: id })); setAtHome(false); }} onCreate={createProfile} onOpenAdmin={() => navigate('admin')} onOpenAccount={() => openAccount()} onOpenContact={() => openAccount(true)} onOpenLibrary={() => setLibraryOpen(true)} onRestored={p => { setState(s => ({ profiles: [...s.profiles.filter(old => old.id !== p.id), p], activeId: p.id })); setAtHome(false); }} /> : profile.status === 'blocked' ? <div className="mx-auto max-w-xl p-8 pt-20 text-center text-slate-200"><ShieldCheck size={40} className="mx-auto mb-5 text-amber-200" /><h2 className="text-xl font-bold">دسترسی این حساب غیرفعال شده است</h2><p className="my-5 text-sm text-slate-400">برای بررسی اطلاعات حساب، وارد بخش حساب شخصی شوید.</p><button onClick={() => openAccount()} className="site-primary-button px-5 py-3">حساب من</button><button onClick={() => setAtHome(true)} className="m-4 text-sm">بازگشت</button></div> : current ? <LessonView key={current.l.id} lesson={current.l} degree={current.d} orbit={allLessons.findIndex(x => x.l.id === current.l.id) + 1} kids={!!kids} profile={profile} voices={voicesFor(current.l.id)} onBack={() => setLessonId(null)} onAnswer={onAnswer} onPass={(s, t, st) => onPass(current.l.id, s, t, st)} onTravelerDone={() => onTravelerDone(current.l.id)} onCollect={onCollect} onToggleDaily={onToggleDaily} onRepeat={onRepeat} /> : <Campus profile={profile} degrees={degrees} homeVoices={voicesFor('home')} onOpenLesson={id => { setLessonId(id); window.scrollTo({ top: 0 }); }} onOpenTraveler={(t, id) => setTravelerModal({ t, lessonId: id })} onShowCert={setCertId} onSwitch={() => setAtHome(true)} onOpenAdmin={() => navigate('admin')} onOpenAccount={() => openAccount()} onOpenLibrary={() => setLibraryOpen(true)} onToast={setToast} onCollect={onCollect} onToggleDaily={onToggleDaily} onRepeat={onRepeat} />}
      <Modal open={libraryOpen} onClose={() => setLibraryOpen(false)} title={content.settings.labels.library} wide><Library /></Modal>
      <Modal open={!!travelerModal} onClose={() => setTravelerModal(null)} title="سیر تکاملی رهرو" kids={!!kids}>{travelerModal && <TravelerStory key={travelerModal.t.id} t={travelerModal.t} kids={!!kids} onDone={() => { onTravelerDone(travelerModal.lessonId); setTravelerModal(null); }} />}</Modal>
      {certDegree && profile && <Certificate profile={profile} degree={certDegree} date={profile.certs[certDegree.id] || Date.now()} onClose={() => setCertId(null)} />}
    </div>}
    {authenticated && route !== 'admin' && <button className="site-floating-admin" onClick={() => navigate('admin')}><ShieldCheck size={16} />بازگشت به مدیریت<ArrowRight size={14} /></button>}
    {toast && route !== 'admin' && <Toast onDone={clearToast}>{toast}</Toast>}
  </SiteProvider>;
}