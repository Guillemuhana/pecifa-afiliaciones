import { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { supabase, supabaseOk, BUCKET } from '../supabase.js';
import { SECCIONES, ESTADOS, CAMPOS, NOMBRE_ARCHIVO, legible, formatoCuil, fechaHora, condOk, esArchivo } from '../../lib/schema.js';
import { tamano } from '../lib/imagen.js';

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
  if (!sesion) return <Login />;
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

  return (
    <div className="adm">
      <div className="adm-bar">
        <img src="/logo.png" alt="" />
        <strong>Afiliaciones PECIFA</strong>
        <span className="sp" />
        <span style={{ fontSize: 14, opacity: 0.85 }}>{staff?.nombre || sesion.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>
      <div className="adm-main">
        <Routes>
          <Route index element={<Listado />} />
          <Route path=":id" element={<Detalle usuario={staff?.nombre || sesion.user.email} />} />
        </Routes>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setCargando(false);
    if (error) setMsg({ t: 'err', m: 'Correo o contraseña incorrectos.' });
  };
  const olvide = async () => {
    if (!email.trim()) return setMsg({ t: 'warn', m: 'Escribí tu correo y tocá de nuevo «Olvidé mi contraseña».' });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` });
    setMsg(error ? { t: 'err', m: 'No se pudo enviar el correo.' } : { t: 'ok', m: 'Te enviamos un correo para restablecer la contraseña.' });
  };
  return (
    <div className="adm">
      <div className="adm-login">
        <img src="/logo.png" alt="" />
        <h1>Panel de afiliaciones</h1>
        {msg && <div className={`adm-msg ${msg.t}`}>{msg.m}</div>}
        <form onSubmit={entrar}>
          <input type="email" placeholder="Correo" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Contraseña" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
          <button className="adm-btn adm-btn--pri" disabled={cargando} style={{ justifyContent: 'center', height: 44 }}>
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button type="button" className="adm-btn" style={{ justifyContent: 'center', border: 0 }} onClick={olvide}>
            Olvidé mi contraseña
          </button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
const POR_PAGINA = 50;

function Listado() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [conteo, setConteo] = useState({});
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [total, setTotal] = useState(0);
  const [pag, setPag] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const consulta = useCallback(
    (sel, opts) => {
      let x = supabase.from('afiliaciones').select(sel, opts);
      if (estado) x = x.eq('estado', estado);
      if (desde) x = x.gte('created_at', desde + 'T03:00:00Z');
      if (hasta) x = x.lte('created_at', new Date(new Date(hasta + 'T03:00:00Z').getTime() + 86399999).toISOString());
      const t = q.trim().replace(/[%,()]/g, ' ');
      if (t) x = x.or(['apellido', 'nombres', 'dni', 'cuil', 'email', 'nro_tramite', 'nro_afiliado', 'fuerza', 'localidad'].map((c) => `${c}.ilike.%${t}%`).join(','));
      return x;
    },
    [q, estado, desde, hasta]
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const { data, count, error: e } = await consulta('id,nro_tramite,estado,apellido,nombres,dni,fuerza,localidad,created_at,nro_afiliado,archivos', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, pag * POR_PAGINA - 1);
    if (e) setError(e.message);
    setRows(data || []);
    setTotal(count || 0);
    setCargando(false);
  }, [consulta, pag]);

  useEffect(() => {
    const t = setTimeout(cargar, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  useEffect(() => {
    (async () => {
      const c = {};
      await Promise.all(
        Object.keys(ESTADOS).map(async (e) => {
          const { count } = await supabase.from('afiliaciones').select('id', { count: 'exact', head: true }).eq('estado', e);
          c[e] = count || 0;
        })
      );
      setConteo(c);
    })();
  }, [rows.length]);

  const exportar = async () => {
    const { data, error: e } = await consulta('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(0, 9999);
    if (e) return alert(e.message);
    const campos = Object.entries(CAMPOS).filter(([, f]) => !esArchivo(f) && f.type !== 'firma' && f.type !== 'declaracion');
    const head = ['Trámite', 'Fecha de carga', 'Estado', 'N.º de afiliado', ...campos.flatMap(([, f]) => (f.type === 'familiares' ? ['Familiares', 'Cantidad de familiares'] : [f.label])), 'Adjuntos', 'Firmó', 'Notas internas'];
    const cel = (v) => {
      v = String(v ?? '');
      if (/^\d{10,}$/.test(v)) v = `="${v}"`;
      else if (/^[=+\-@]/.test(v)) v = "'" + v;
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lineas = [head.map(cel).join(';')];
    for (const r of data) {
      const d = r.datos || {};
      const fila = [r.nro_tramite, fechaHora(r.created_at), ESTADOS[r.estado], r.nro_afiliado];
      for (const [k, f] of campos) {
        if (f.type === 'familiares') {
          const fs = d.tiene_familiares === 'si' ? d.familiares || [] : [];
          fila.push(fs.map((x) => `${x.nombre} (${x.parentesco}, DNI ${x.dni})`).join(' | '), fs.length);
        } else fila.push(f.type === 'money' && d[k] ? String(d[k]).replace('.', ',') : legible(f, d[k]));
      }
      fila.push((r.archivos || []).length, (r.archivos || []).some((a) => a.campo === 'firma') ? 'Sí' : 'No', r.notas);
      lineas.push(fila.map(cel).join(';'));
    }
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pecifa-afiliaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const totalTodo = Object.values(conteo).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="adm-head">
        <h1>Solicitudes de afiliación</h1>
        <button className="adm-btn" onClick={exportar}>
          Exportar a Excel (CSV)
        </button>
      </div>
      <div className="adm-cards">
        <button className={`adm-card${estado === '' ? ' on' : ''}`} onClick={() => setEstado('')}>
          <span>Total</span>
          <b>{totalTodo}</b>
        </button>
        {Object.entries(ESTADOS).map(([k, t]) => (
          <button key={k} className={`adm-card ${k}${estado === k ? ' on' : ''}`} onClick={() => setEstado(k)}>
            <span>{t}</span>
            <b>{conteo[k] ?? '–'}</b>
          </button>
        ))}
      </div>
      <div className="adm-filters">
        <input type="search" placeholder="Buscar nombre, DNI, CUIL, trámite, fuerza…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <label>
          Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <span className="tot">{cargando ? 'Cargando…' : `${total} resultado${total === 1 ? '' : 's'}`}</span>
      </div>
      {error && <div className="adm-msg err">{error}</div>}
      <table className="adm-table">
        <thead>
          <tr>
            <th>Trámite</th>
            <th>Fecha</th>
            <th>Apellido y nombre</th>
            <th>DNI</th>
            <th className="hide-m">Fuerza</th>
            <th className="hide-m">Localidad</th>
            <th className="hide-m">Docs</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {!cargando && !rows.length && (
            <tr>
              <td colSpan={8} className="adm-empty">
                Todavía no hay solicitudes{q || estado ? ' con esos filtros' : ''}.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="row" onClick={() => nav(`/admin/${r.id}`)}>
              <td className="adm-nro">{r.nro_tramite}</td>
              <td>{fechaHora(r.created_at)}</td>
              <td>
                <strong>
                  {r.apellido}, {r.nombres}
                </strong>
              </td>
              <td>{r.dni}</td>
              <td className="hide-m">{r.fuerza}</td>
              <td className="hide-m">{r.localidad}</td>
              <td className="hide-m">{(r.archivos || []).length}</td>
              <td>
                <Badge e={r.estado} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length < total && (
        <div className="adm-more">
          <button className="adm-btn" onClick={() => setPag((p) => p + 1)}>
            Ver más
          </button>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
function Detalle({ usuario }) {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [urls, setUrls] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ estado: '', nro_afiliado: '', notas: '', nota: '', notificar: false });

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('afiliaciones').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setRow(false);
      return;
    }
    setRow(data);
    setForm({ estado: data.estado, nro_afiliado: data.nro_afiliado || '', notas: data.notas || '', nota: '', notificar: false });
    const paths = (data.archivos || []).map((a) => a.path);
    if (paths.length) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const u = {};
      (s || []).forEach((x) => x.signedUrl && (u[x.path] = x.signedUrl));
      setUrls(u);
    }
  }, [id]);

  useEffect(() => {
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
    const hist = [...(row.historial || [])];
    if (cambios.length || form.nota.trim()) {
      hist.push({ fecha: new Date().toISOString(), estado: form.estado, usuario, nota: [form.nota.trim(), ...cambios].filter(Boolean).join('\n') });
    }
    const { error } = await supabase.from('afiliaciones').update({ estado: form.estado, nro_afiliado: form.nro_afiliado.trim().slice(0, 20), notas: form.notas, historial: hist }).eq('id', row.id);
    if (error) {
      setBusy('');
      return setMsg({ t: 'err', m: error.message });
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
      if (a === 'reenviar') {
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
        <Link to="/admin">← Volver al listado</Link>
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
          <button className="adm-btn adm-btn--pri" disabled={!!busy} onClick={() => accion('expediente')}>
            {busy === 'expediente' ? 'Generando…' : 'Descargar expediente PDF'}
          </button>
          <button className="adm-btn" disabled={!!busy} onClick={() => accion('ficha')}>
            {busy === 'ficha' ? 'Generando…' : 'Ficha para imprimir'}
          </button>
          <button className="adm-btn" disabled={!!busy} onClick={() => accion('reenviar')}>
            {busy === 'reenviar' ? 'Enviando…' : 'Reenviar por correo'}
          </button>
        </div>
      </div>
      {msg && <div className={`adm-msg ${msg.t}`}>{msg.m}</div>}

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
