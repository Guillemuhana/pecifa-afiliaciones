import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileCheck2, FileText, LoaderCircle, X } from 'lucide-react';
import { BUCKET, supabase } from '../supabase.js';
import { NOMBRE_ARCHIVO } from '../../lib/schema.js';
import { tamano } from '../lib/imagen.js';
import { saveBlob } from './management.js';

export default function Documentos({ archivos = [] }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [preview, setPreview] = useState({ url: '', error: '' });
  const dialog = useRef(null);
  const groups = [
    { key: 'adj_recibo', title: 'Recibo de haberes', empty: 'No hay un recibo registrado en esta solicitud.' },
    { key: 'adj_dni', title: 'DNI · frente y dorso', empty: 'No hay un DNI registrado en esta solicitud.' },
    { key: 'adj_familiares', title: 'Documentación familiar' },
    { key: 'adj_selfie', title: 'Foto de validación' },
    { key: 'firma', title: 'Firma' },
    ...[...new Set(archivos.map(file => file.campo))].filter(key => !['adj_recibo', 'adj_dni', 'adj_familiares', 'adj_selfie', 'firma'].includes(key)).map(key => ({ key, title: NOMBRE_ARCHIVO[key] || 'Otro documento' })),
  ];

  useEffect(() => {
    if (!viewing) return;
    let active = true;
    setPreview({ url: '', error: '' });
    dialog.current?.showModal();
    // Renew the private link whenever a document is opened, even after a long review session.
    supabase.storage.from(BUCKET).createSignedUrl(viewing.path, 600).then(({ data, error }) => {
      if (!active) return;
      setPreview(error || !data?.signedUrl
        ? { url: '', error: 'No se pudo abrir el archivo. Revisá tu conexión o intentá descargarlo.' }
        : { url: data.signedUrl, error: '' });
    }).catch(() => { if (active) setPreview({ url: '', error: 'No se pudo conectar con el archivo. Volvé a intentarlo.' }); });
    return () => { active = false; };
  }, [viewing]);

  async function download(file) {
    setBusy(file.path); setError('');
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
      if (error || !data) throw new Error('No se pudo recuperar el archivo.');
      saveBlob(data, file.nombre || `${file.campo}.${file.mime === 'application/pdf' ? 'pdf' : 'jpg'}`);
    } catch {
      setError('No se pudo descargar el documento. Revisá tu conexión y que tu sesión siga activa; si continúa, verificá el archivo en Supabase.');
    } finally { setBusy(''); }
  }
  function close() { dialog.current?.close(); setViewing(null); setPreview({ url: '', error: '' }); }

  return <section id="documentos" className="adm-box np-documents" aria-labelledby="documents-title">
    <div className="np-documents-heading"><div><h2 id="documents-title">Documentos del solicitante</h2><p>Recibo, DNI y demás archivos enviados con esta solicitud. Abrí o descargá cada original.</p></div><span>{archivos.length} archivo{archivos.length === 1 ? '' : 's'}</span></div>
    {error && <p className="adm-msg err" role="alert">{error}</p>}
    <div className="np-document-groups">{groups.map(group => {
      const files = archivos.filter(file => file.campo === group.key);
      if (!files.length && !group.empty) return null;
      return <section className="np-document-group" key={group.key} aria-label={group.title}>
        <h3><FileCheck2 size={17} aria-hidden="true" />{group.title}<span>{files.length}</span></h3>
        {!files.length && <p className="np-document-missing">{group.empty}</p>}
        {files.map((file, index) => <div className="np-document-file" key={file.path}>
          <FileText size={22} aria-hidden="true" />
          <div className="np-document-name"><strong>{file.nombre || `${group.title} ${index + 1}`}</strong><small>{file.mime === 'application/pdf' ? 'PDF' : file.mime?.startsWith('image/') ? 'Imagen' : 'Archivo'} · {tamano(file.bytes || 0)}</small></div>
          <div className="np-document-actions"><button className="adm-btn" onClick={() => setViewing(file)} aria-label={`Ver ${file.nombre || group.title}`}><Eye size={15} /> Ver</button><button className="adm-btn adm-btn--pri" onClick={() => download(file)} disabled={Boolean(busy)} aria-label={`Descargar ${file.nombre || group.title}`}>{busy === file.path ? <LoaderCircle className="np-spin" size={15} /> : <Download size={15} />}{busy === file.path ? 'Descargando…' : 'Descargar'}</button></div>
        </div>)}
      </section>;
    })}</div>
    <dialog className="np-document-dialog" ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="document-preview-title">
      <header><h2 id="document-preview-title">{viewing?.nombre || 'Vista del documento'}</h2><button className="adm-btn" onClick={close} aria-label="Cerrar documento"><X size={19} /></button></header>
      {preview.error ? <p className="adm-msg err" role="alert">{preview.error}</p> : !preview.url ? <p role="status">Cargando documento…</p> : viewing?.mime === 'application/pdf'
        ? <iframe title={viewing.nombre || 'Documento PDF'} src={preview.url} referrerPolicy="no-referrer" />
        : <img src={preview.url} alt={viewing?.nombre || 'Documento del solicitante'} onError={() => setPreview({ url: '', error: 'El archivo no pudo mostrarse. Podés intentar descargarlo.' })} />}
      <footer>{preview.url && <a className="adm-btn" href={preview.url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>}<button className="adm-btn adm-btn--pri" disabled={!viewing || Boolean(busy)} onClick={() => download(viewing)}><Download size={15} /> Descargar original</button></footer>
    </dialog>
  </section>;
}
