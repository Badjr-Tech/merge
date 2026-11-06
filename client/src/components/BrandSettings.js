import React, { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input } from './ui';

const DEFAULTS = { primary: '#0b2d65', accent: '#7fab61' };

// A logo and two colours, applied to the documents a funder sees rather than to the app. The
// logo lives in private storage, so it is fetched as bytes and shown from an object URL.
export default function BrandSettings() {
  const { isAdmin } = useAuth();
  const { has } = usePlan();
  const toast = useToast();
  const entitled = has('custom_branding');
  const fileRef = useRef();
  const [logoUrl, setLogoUrl] = useState(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [brand, setBrand] = useState(DEFAULTS);
  const [busy, setBusy] = useState('');

  const loadLogo = () => {
    api.get('/api/companies/mine/logo', { responseType: 'blob' })
      .then(r => { setHasLogo(true); setLogoUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(r.data); }); })
      .catch(() => { setHasLogo(false); setLogoUrl(u => { if (u) URL.revokeObjectURL(u); return null; }); });
  };

  useEffect(() => {
    api.get('/api/companies/mine').then(r => {
      setBrand({ ...DEFAULTS, ...(r.data.brand || {}) });
      if (r.data.hasLogo) loadLogo();
    }).catch(() => {});
    // The object URL is released when this unmounts.
    return () => setLogoUrl(u => { if (u) URL.revokeObjectURL(u); return null; });
  }, []);

  const uploadLogo = async (file) => {
    if (!file) return;
    setBusy('logo');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await api.post('/api/companies/mine/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Logo saved. It goes on the top of exported PDFs.');
      loadLogo();
    } catch (err) { toast.error(errorMessage(err, 'Could not save that logo.')); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  const removeLogo = async () => {
    setBusy('logo');
    try { await api.delete('/api/companies/mine/logo'); setHasLogo(false); setLogoUrl(u => { if (u) URL.revokeObjectURL(u); return null; }); toast.success('Logo removed.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const saveColours = async () => {
    setBusy('colours');
    try { await api.put('/api/companies/mine/brand', brand); toast.success('Colours saved. New exports will use them.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  if (!entitled) {
    return (
      <p className="small muted" style={{ marginTop: -4 }}>
        Your logo and colours on exported proposals are part of the Companies plan. Exports use Merge's own
        colours until then.
      </p>
    );
  }
  if (!isAdmin) {
    return <p className="small muted" style={{ marginTop: -4 }}>An admin can set the logo and colours that appear on exported proposals.</p>;
  }

  return (
    <>
      <p className="small muted" style={{ marginTop: -4 }}>
        Used on the proposals you export, not in Merge itself: the logo sits at the top of an exported PDF, and
        these two colours replace Merge's on the title, the section headings and the rule under the heading.
      </p>

      <Field label="Logo" hint="PNG, JPEG or WebP, up to 2 MB. An SVG is kept but cannot be placed on a PDF, so use a PNG if you export to PDF.">
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          {logoUrl
            ? <img src={logoUrl} alt="Your logo" style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain' }} />
            : <span className="tiny faint">No logo yet</span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => uploadLogo(e.target.files[0])} disabled={busy === 'logo'} />
          {hasLogo && <Button variant="danger" size="sm" onClick={removeLogo} loading={busy === 'logo'}>Remove</Button>}
        </div>
      </Field>

      <div className="grid-2">
        <Field label="Main colour" hint="Title and question headings.">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="color" value={brand.primary} onChange={e => setBrand(b => ({ ...b, primary: e.target.value }))} aria-label="Main colour" style={{ width: 44, height: 34, padding: 2 }} />
            <Input value={brand.primary} onChange={e => setBrand(b => ({ ...b, primary: e.target.value }))} placeholder="#0b2d65" />
          </div>
        </Field>
        <Field label="Accent colour" hint="Section headings and the rule under the title.">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="color" value={brand.accent} onChange={e => setBrand(b => ({ ...b, accent: e.target.value }))} aria-label="Accent colour" style={{ width: 44, height: 34, padding: 2 }} />
            <Input value={brand.accent} onChange={e => setBrand(b => ({ ...b, accent: e.target.value }))} placeholder="#7fab61" />
          </div>
        </Field>
      </div>
      <Button variant="secondary" onClick={saveColours} loading={busy === 'colours'}>Save colours</Button>
    </>
  );
}
