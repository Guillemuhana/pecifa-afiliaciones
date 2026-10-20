import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation, useParams, Link } from 'react-router-dom';
import { Copy, Download, Mail, Phone, Share2 } from 'lucide-react';
import { supabase, supabaseOk, BUCKET } from '../supabase.js';
import { SECCIONES, ESTADOS, NOMBRE_ARCHIVO, legible, formatoCuil, fechaHora, condOk, esArchivo } from '../../lib/schema.js';
import { tamano } from '../lib/imagen.js';
import PanelLayout from './PanelLayout.jsx';
import { saveBlob } from './management.js';

const Login = lazy(() => import('./Login.jsx'));
const Dashboard = lazy(() => import('./Dashboard.jsx'));

/* ------------------------------------------------------------------ */
async function api(accion, body = {}) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify({ accion, ...body }),
  });
  return r;
}

async function descargar(accion, row) {
  const r = await api(accion, { id: row.id });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo generar el PDF.');
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') || '';
  const nombre = (/filename="([^"]+)"/.exec(cd) || [])[1] || `${row.nro_tramite}.pdf`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

const Badge = ({ e }) => <span className={`badge ${e}`}>{ESTADOS[e] || e}</span>;

/* ------------------------------------------------------------------ */
export default function Admin() {
  const [sesion, setSesion] = useState(undefined);
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    if (!supabaseOk) return undefined;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) {
      setStaff(null);
      return;
    }
    supabase
      .from('staff')
      .select('email,nombre')
      .maybeSingle()
      .then(({ data }) => setStaff(data || false));
  }, [sesion]);

  if (!supabaseOk)
    return (
      <div className="adm">
        <div className="adm-login">
          <img src="/logo.png" alt="" />
          <h1>Panel de afiliaciones</h1>
          <p>Falta conectar la base de datos (variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</p>
        </div>
      </div>
    );
  if (sesion === undefined) return <div className="adm" />;
  if (!sesion) return <Suspense fallback={<div className="adm" role="status">Cargando acceso…</div>}><Login /></Suspense>;
  if (staff === false)
    return (
      <div className="adm">
        <div className="adm-login">
          <img src="/logo.png" alt="" />
          <h1>Sin acceso</h1>
          <p>La cuenta {sesion.user.email} no está habilitada para el panel.</p>
          <button className="adm-btn" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </div>
    );

  if (staff === null) return <div className="adm" role="status">Verificando acceso al panel…</div>;

  return (
    <PanelLayout usuario={staff?.nombre || sesion.user.email}>
      <Suspense fallback={<p role="status">Cargando panel…</p>}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path=":id" element={<Detalle usuario={staff?.nombre || sesion.user.email} />} />
        </Routes>
      </Suspense>
    </PanelLayout>
  );
}

function Detalle({ usuario }) {
  const { id } = useParams();
  const location = useLocation();
  const returnTo = location.state?.returnTo?.startsWith('/admin?') ? location.state.returnTo : '/admin?vista=base';
  const [row, setRow] = useState(null);
  const [urls, setUrls] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [shareFile, setShareFile] = useState(null);
  const [form, setForm] = useState({ estado: '', nro_afiliado: '', seccional: '', afiliado_por: '', notas: '', nota: '', notificar: false });

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('afiliaciones').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setRow(false);
      return;
    }
    setRow(data);
    setForm({ estado: data.estado, nro_afiliado: data.nro_afiliado || '', seccional: data.datos?.seccional || '', afiliado_por: data.datos?.afiliado_por || '', notas: data.notas || '', nota: '', notificar: false });
    const paths = (data.archivos || []).map((a) => a.path);
    if (paths.length) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const u = {};
      (s || []).forEach((x) => x.signedUrl && (u[x.path] = x.signedUrl));
      setUrls(u);
    }
  }, [id]);

  useEffect(() => {
    setRow(null);
    setUrls({});
    setShareFile(null);
    cargar();
  }, [cargar]);

  const archivo = (campo) => (row?.archivos || []).find((a) => a.campo === campo);
  const selfie = archivo('adj_selfie');
  const firma = archivo('firma');

  const guardar = async (e) => {
    e.preventDefault();
    setBusy('guardar');
    setMsg(null);
    const cambios = [];
    if (form.estado !== row.estado) cambios.push(`Estado: ${ESTADOS[form.estado]}`);
    if (form.nro_afiliado !== (row.nro_afiliado || '')) cambios.push(`N.º de afiliado: ${form.nro_afiliado || '(vacío)'}`);
    if (form.notas !== (row.notas || '')) cambios.push('Notas internas actualizadas.');
    if (form.seccional.trim() !== (row.datos?.seccional || '')) cambios.push(`Seccional: ${form.seccional.trim() || '(sin asignar)'}`);
    if (form.afiliado_por.trim() !== (row.datos?.afiliado_por || '')) cambios.push(`Referente: ${form.afiliado_por.trim() || '(sin asignar)'}`);
    const hist = [...(row.historial || [])];
    if (cambios.length || form.nota.trim()) {
      hist.push({ fecha: new Date().toISOString(), estado: form.estado, usuario, nota: [form.nota.trim(), ...cambios].filter(Boolean).join('\n') });
    }
    const { data: saved, error } = await supabase.from('afiliaciones').update({ estado: form.estado, nro_afiliado: form.nro_afiliado.trim().slice(0, 20), datos: { ...row.datos, seccional: form.seccional.trim().slice(0, 80), afiliado_por: form.afiliado_por.trim().slice(0, 80) }, notas: form.notas, historial: hist }).eq('id', row.id).eq('updated_at', row.updated_at).select('id');
    if (error || !saved?.length) {
      setBusy('');
      return setMsg({ t: 'err', m: error?.message || 'Otra persona modificó esta ficha. Recargá la página y revisá los cambios antes de guardar.' });
    }
    let m = { t: 'ok', m: 'Cambios guardados.' };
    if (form.notificar) {
      const r = await api('notificar', { id: row.id, nota: form.nota.trim() });
      m = r.ok ? { t: 'ok', m: 'Cambios guardados y correo enviado al afiliado.' } : { t: 'warn', m: 'Cambios guardados, pero no se pudo enviar el correo: ' + ((await r.json().catch(() => ({}))).error || '') };
    }
    setBusy('');
    setMsg(m);
    cargar();
  };

  const accion = async (a) => {
    setBusy(a);
    setMsg(null);
    try {
      if (a === 'preparar') {
        const response = await api('expediente', { id: row.id });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo generar el expediente.');
        const file = new File([await response.blob()], `${row.nro_tramite}-expediente.pdf`, { type: 'application/pdf' });
        setShareFile(file);
        setMsg({ t: 'ok', m: 'Expediente preparado. Podés compartirlo o descargarlo con los botones de abajo.' });
      } else if (a === 'reenviar') {
        const r = await api('reenviar', { id: row.id });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'No se pudo enviar.');
        setMsg({ t: 'ok', m: `Expediente PDF enviado a ${(j.destinos || []).join(', ')}.` });
      } else await descargar(a, row);
    } catch (e) {
      setMsg({ t: 'err', m: e.message });
    }
    setBusy('');
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/admin/${row.id}`);
      setMsg({ t: 'ok', m: 'Enlace de la ficha copiado. Se requiere una cuenta autorizada para abrirlo.' });
    } catch { setMsg({ t: 'warn', m: 'No se pudo copiar. Copiá la dirección del navegador para compartir la ficha.' }); }
  };

  const compartirPDF = async () => {
    try { await navigator.share({ files: [shareFile], title: `PECIFA · ${row.nro_tramite}` }); }
    catch (error) { if (error.name !== 'AbortError') setMsg({ t: 'err', m: 'No se pudo compartir. Podés descargar el PDF y adjuntarlo manualmente.' }); }
  };

  if (row === null) return <p>Cargando…</p>;
  if (row === false)
    return (
      <p>
        Solicitud inexistente. <Link to="/admin">Volver</Link>
      </p>
    );

  const d = row.datos || {};
  return (
    <>
      <p>
        <Link to={returnTo}>← Volver al listado</Link>
      </p>
      <div className="adm-head">
        <div>
          <h1>
            {row.apellido}, {row.nombres}
          </h1>
          <p>
            <strong>{row.nro_tramite}</strong> · Recibida el {fechaHora(row.created_at)} · <Badge e={row.estado} />
          </p>
        </div>
        <div className="adm-acts">
          <button className="adm-btn" onClick={copiarEnlace}><Copy size={15} /> Copiar enlace</button>
          <button className="adm-btn adm-btn--pri" disabled={!!busy} onClick={() => accion('expediente')}>
            {busy === 'expediente' ? 'Generando…' : 'Descargar expediente PDF'}
          </button>
          <button className="adm-btn" disabled={!!busy} onClick={() => accion('ficha')}>
            {busy === 'ficha' ? 'Generando…' : 'Ficha para imprimir'}
          </button>
          <button className="adm-btn" disabled={!!busy} onClick={() => accion('reenviar')}>
            {busy === 'reenviar' ? 'Enviando…' : 'Reenviar por correo'}
          </button>
          <button className="adm-btn" disabled={!!busy} onClick={() => accion('preparar')}><Share2 size={15} />{busy === 'preparar' ? 'Preparando…' : 'Preparar PDF para compartir'}</button>
        </div>
      </div>
      {msg && <div className={`adm-msg ${msg.t}`} role="status">{msg.m}</div>}
      {shareFile && <div className="adm-box np-share-fallback"><h2>Expediente listo</h2><div className="adm-acts">{navigator.canShare?.({ files: [shareFile] }) && <button className="adm-btn adm-btn--pri" onClick={compartirPDF}><Share2 size={15} /> Compartir PDF preparado</button>}<button className="adm-btn" onClick={() => saveBlob(shareFile, shareFile.name)}><Download size={15} /> Descargar PDF preparado</button><button className="adm-btn" onClick={() => setShareFile(null)}>Cerrar</button></div></div>}
      <div className="np-detail-contact">{row.email && <a className="adm-btn" href={`mailto:${row.email}`}><Mail size={15} />{row.email}</a>}{row.telefono && <a className="adm-btn" href={`tel:${row.telefono.replace(/[^+0-9]/g, '')}`}><Phone size={15} />{row.telefono}</a>}<span className="adm-btn">Seccional: {d.seccional || 'Sin informar'}</span>{d.afiliado_por && <span className="adm-btn">Referente: {d.afiliado_por}</span>}</div>

      <div className="adm-cols">
        <div>
          <div className="adm-box">
            <h2>Identidad y firma</h2>
            <div className="adm-idf">
              <figure>
                {selfie && urls[selfie.path] ? (
                  <a href={urls[selfie.path]} target="_blank" rel="noreferrer">
                    <img className="adm-selfie" src={urls[selfie.path]} alt="Selfie" />
                  </a>
                ) : (
                  <div className="adm-selfie" />
                )}
                <figcaption>Foto de validación</figcaption>
              </figure>
              <figure>
                {firma && urls[firma.path] ? <img className="adm-firma" src={urls[firma.path]} alt="Firma" /> : <div className="adm-firma" />}
                <figcaption>
                  Firma {d.firma_fecha ? `· ${fechaHora(d.firma_fecha, true)} · IP ${d.firma_ip || '-'}` : ''}
                </figcaption>
              </figure>
            </div>
          </div>

          {SECCIONES.map((sec) => {
            const filas = Object.entries(sec.campos).filter(([, f]) => !esArchivo(f) && f.type !== 'firma' && f.type !== 'declaracion' && condOk(f, d));
            if (!filas.length) return null;
            return (
              <div className="adm-box" key={sec.titulo}>
                <h2>{sec.titulo}</h2>
                <table className="adm-kv">
                  <tbody>
                    {filas.map(([k, f]) =>
                      f.type === 'familiares' ? (
                        <tr key={k}>
                          <td colSpan={2}>
                            <table className="adm-fams">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Apellido y nombre</th>
                                  <th>Parentesco</th>
                                  <th>DNI</th>
                                  <th>Fecha de nac.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.familiares || []).map((x, i) => (
                                  <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>{x.nombre}</td>
                                    <td>{x.parentesco}</td>
                                    <td>{x.dni}</td>
                                    <td>{legible({ type: 'date' }, x.nacimiento)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : (
                        <tr key={k}>
                          <th>{f.label}</th>
                          <td>{(k === 'cuil' ? formatoCuil(d[k]) : legible(f, d[k])) || <span style={{ color: '#9aa5b8' }}>—</span>}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="adm-box">
            <h2>Documentación</h2>
            <ul className="adm-docs">
              {(row.archivos || []).map((a) => (
                <li key={a.path}>
                  <span className="k">{NOMBRE_ARCHIVO[a.campo] || a.campo}</span>
                  <span className="n">
                    {a.nombre} <span style={{ color: '#9aa5b8' }}>({tamano(a.bytes || 0)})</span>
                  </span>
                  {urls[a.path] && (
                    <a className="adm-btn" href={urls[a.path]} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="adm-box">
            <h2>Datos técnicos</h2>
            <p style={{ fontSize: 13, color: '#66728c' }}>
              IP {row.ip || '—'} · Última modificación {fechaHora(row.updated_at)}
              <br />
              {row.user_agent}
            </p>
          </div>
        </div>

        <aside className="adm-side">
          <form className="adm-box" onSubmit={guardar}>
            <h2>Gestión</h2>
            <label htmlFor="g-estado">Estado</label>
            <select id="g-estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {Object.entries(ESTADOS).map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
            <label htmlFor="g-nro">N.º de afiliado</label>
            <input id="g-nro" type="text" maxLength={20} value={form.nro_afiliado} onChange={(e) => setForm({ ...form, nro_afiliado: e.target.value })} />
            <label htmlFor="g-seccional">Seccional asignada</label>
            <input id="g-seccional" type="text" maxLength={80} placeholder="Ej.: Córdoba" value={form.seccional} onChange={event => setForm({ ...form, seccional: event.target.value })} />
            <label htmlFor="g-referente">Referente / persona que afilió</label>
            <input id="g-referente" type="text" maxLength={80} value={form.afiliado_por} onChange={event => setForm({ ...form, afiliado_por: event.target.value })} />
            <label htmlFor="g-nota">
              Mensaje para el afiliado <span style={{ fontWeight: 400, color: '#66728c' }}>(queda en el historial)</span>
            </label>
            <textarea id="g-nota" rows={3} placeholder="Ej.: falta el DNI dorso legible" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            <label className="chk">
              <input type="checkbox" checked={form.notificar} onChange={(e) => setForm({ ...form, notificar: e.target.checked })} /> Avisar por correo a {row.email}
            </label>
            <label htmlFor="g-notas">
              Notas internas <span style={{ fontWeight: 400, color: '#66728c' }}>(no las ve el afiliado)</span>
            </label>
            <textarea id="g-notas" rows={4} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            <button className="adm-btn adm-btn--pri" style={{ width: '100%', justifyContent: 'center', marginTop: 12, height: 42 }} disabled={!!busy}>
              {busy === 'guardar' ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
          <div className="adm-box">
            <h2>Historial</h2>
            <ol className="adm-hist">
              {[...(row.historial || [])].reverse().map((h, i) => (
                <li key={i}>
                  <span className="f">
                    {fechaHora(h.fecha)} · {h.usuario}
                  </span>
                  <Badge e={h.estado} />
                  {h.nota && <div className="n">{h.nota}</div>}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
