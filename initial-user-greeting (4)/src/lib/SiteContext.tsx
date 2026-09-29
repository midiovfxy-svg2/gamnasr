import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { defaultContent, type SiteContent } from './content';
import { getFile } from './files';
import type { StorageMode } from './service';

export const SiteContext = createContext<{ content: SiteContent; mode: StorageMode }>({ content: defaultContent, mode: 'checking' });
export const useSite = () => useContext(SiteContext);

export function SiteProvider({ content, mode, children }: { content: SiteContent; mode: StorageMode; children: ReactNode }) {
  useEffect(() => {
    document.title = content.settings.title;
    document.documentElement.style.setProperty('--site-accent', content.settings.accent);
    document.documentElement.style.setProperty('--site-bg', content.settings.background);
    document.documentElement.style.setProperty('--site-radius', `${content.settings.roundness}px`);
    document.documentElement.style.setProperty('--site-font-size', `${content.settings.fontSize}px`);
    document.documentElement.classList.toggle('motion-off', !content.settings.motion);
  }, [content.settings]);
  return <SiteContext.Provider value={{ content, mode }}>{children}</SiteContext.Provider>;
}

export function useAsset(value: string) {
  const { content } = useSite();
  const asset = value.startsWith('asset:') ? content.media.find(a => a.id === value.slice(6)) : undefined;
  const [blobUrl, setBlobUrl] = useState('');
  useEffect(() => {
    let mounted = true;
    let url = '';
    setBlobUrl('');
    if (asset?.blobId) getFile(asset.blobId).then(blob => {
      if (blob && mounted) { url = URL.createObjectURL(blob); setBlobUrl(url); }
    }).catch(() => undefined);
    return () => { mounted = false; if (url) URL.revokeObjectURL(url); };
  }, [asset?.blobId]);
  return asset ? (asset.enabled ? blobUrl || asset.url : '') : value;
}