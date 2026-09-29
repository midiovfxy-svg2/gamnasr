import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Orbit, Sparkles, GraduationCap, Leaf, Heart, ShieldCheck, LockKeyhole, Target, Sun, Moon, Headphones, UserRound, Flower2, Brain, HandHeart, Mountain, Compass, Gem, X, LoaderCircle, ImageIcon, type LucideIcon } from 'lucide-react';
import { useAsset, useSite } from '../lib/SiteContext';
import { cn } from '../utils/cn';

export const glyphs: Record<string, LucideIcon> = {
  'book-open': BookOpen, orbit: Orbit, sparkles: Sparkles, graduation: GraduationCap,
  leaf: Leaf, heart: Heart, shield: ShieldCheck, target: Target, sun: Sun, moon: Moon,
  headphones: Headphones, user: UserRound, flower: Flower2, brain: Brain,
  'hand-heart': HandHeart, mountain: Mountain, compass: Compass, gem: Gem, lock: LockKeyhole,
};

const openDialogs: string[] = [];
let bodyOverflowBeforeDialogs = '';

export function Glyph({ value, size = 24, className = '' }: { value?: string; size?: number; className?: string }) {
  const url = useAsset(value || 'icon:book-open');
  if (value === '') return null;
  const Icon = glyphs[(value || 'icon:book-open').replace('icon:', '')];
  if (value?.startsWith('asset:') || /^(https?:\/\/|\/(?!\/)|blob:|data:image\/(png|jpeg|webp|gif);)/i.test(url)) {
    return url ? <img src={url} alt="" width={size} height={size} className={cn('object-contain', className)} style={{ width: size, height: size }} /> : <ImageIcon size={size} className={className} />;
  }
  if (Icon) return <Icon size={size} strokeWidth={1.65} className={className} />;
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{value}</span>;
}

export function Brand({ small = false }: { small?: boolean }) {
  const { content } = useSite();
  return <div className="a-brand"><div className="a-brand-symbol"><Glyph value={content.settings.logo} size={small ? 24 : 30} /></div><div><strong>{content.settings.shortTitle}</strong><span>سامانهٔ یادگیری و رشد</span></div></div>;
}

export function AButton({ children, variant = 'primary', busy, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button type="button" {...props} disabled={props.disabled || busy} className={cn('a-button', `a-button-${variant}`, className)}>{busy && <LoaderCircle size={17} className="spin" />}{children}</button>;
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return <label className="a-field"><span className="a-field-label">{label}{required && <i> *</i>}</span>{children}{hint && <span className="a-hint">{hint}</span>}</label>;
}

export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return <div className="a-toggle-row"><div><strong>{label}</strong>{hint && <p>{hint}</p>}</div><button type="button" className={cn('a-switch', value && 'on')} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}><span /></button></div>;
}

export function AdminDialog({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!openDialogs.length) bodyOverflowBeforeDialogs = document.body.style.overflow;
    openDialogs.push(id);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const nodes = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]')];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      const index = openDialogs.indexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);
      if (!openDialogs.length) document.body.style.overflow = bodyOverflowBeforeDialogs;
      window.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="admin-root a-modal-backdrop" dir="rtl" onMouseDown={e => e.target === e.currentTarget && onClose()}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={cn('a-modal', wide && 'a-modal-wide')}><header><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button className="a-icon-button" aria-label="بستن" onClick={onClose}><X size={20} /></button></header><div className="a-modal-body">{children}</div></div></div>, document.body);
}

export function Confirm({ title, children, onConfirm, onClose, busy = false }: { title: string; children: ReactNode; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return <AdminDialog title={title} onClose={onClose}><p className="a-confirm-description">{children}</p><div className="a-form-actions"><AButton variant="secondary" onClick={onClose}>انصراف</AButton><AButton variant="danger" busy={busy} onClick={onConfirm}>تأیید و ادامه</AButton></div></AdminDialog>;
}

export function EmptyState({ icon: Icon = BookOpen, title, text, children }: { icon?: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return <div className="a-empty"><span><Icon size={30} strokeWidth={1.35} /></span><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { content } = useSite();
  return <div className="a-icon-picker"><div className="a-icon-picker-preview"><Glyph value={value} size={36} /><input aria-label="نماد یا آدرس تصویر" value={value} onChange={e => onChange(e.target.value)} placeholder="icon:book-open" dir="ltr" /></div><div className="a-icon-grid">{Object.keys(glyphs).map(key => <button type="button" key={key} title={key} className={value === `icon:${key}` ? 'selected' : ''} onClick={() => onChange(`icon:${key}`)}><Glyph value={`icon:${key}`} size={21} /></button>)}{content.media.filter(m => m.type === 'image' && m.enabled).map(m => <button type="button" key={m.id} title={m.name} className={value === `asset:${m.id}` ? 'selected' : ''} onClick={() => onChange(`asset:${m.id}`)}><Glyph value={`asset:${m.id}`} size={28} /></button>)}</div></div>;
}

export function ErrorNotice({ error }: { error: string }) { return error ? <div className="a-error" role="alert">{error}</div> : null; }
export const humanSize = (bytes: number) => bytes ? bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB` : 'لینک خارجی';