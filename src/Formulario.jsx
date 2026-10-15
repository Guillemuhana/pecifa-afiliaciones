import { useMemo, useRef, useState } from 'react';
import { SECCIONES, CAMPOS, condOk, esArchivo } from '../lib/schema.js';
import { normalizar, validarCampo, validarTodo, soloDigitos, hoyAR } from '../lib/validacion.js';
import { supabase, supabaseOk, BUCKET } from './supabase.js';
import FirmaPad from './components/FirmaPad.jsx';
import Selfie from './components/Selfie.jsx';
import Archivos from './components/Archivos.jsx';
import Familiares from './components/Familiares.jsx';
import { progresoFicha } from '../lib/progreso.js';

const embed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed');

function inicial() {
  const d = {};
  for (const [k, f] of Object.entries(CAMPOS)) {
    if (esArchivo(f) || f.type === 'firma') continue;
    d[k] = f.type === 'familiares' ? [] : f.type === 'declaracion' ? false : '';
  }
  return d;
}

export default function Formulario() {
  const [datos, setDatos] = useState(inicial);
  const [files, setFiles] = useState({});
  const [firma, setFirma] = useState('');
  const [err, setErr] = useState({});
  const [global, setGlobal] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState({ pct: 0, txt: '' });
  const [ok, setOk] = useState(null);
  const web = useRef('');
  const formRef = useRef(null);

  const norm = useMemo(() => validarTodo(datos).datos, [datos]);
  const avance = useMemo(() => progresoFicha(datos, files, firma), [datos, files, firma]);

  const set = (k, v) => {
    setDatos((d) => ({ ...d, [k]: v }));
    if (err[k]) setErr((e) => ({ ...e, [k]: '' }));
  };
  const revisar = (k) => {
    const f = CAMPOS[k];
    const all = validarTodo(datos).datos;
    setErr((e) => ({ ...e, [k]: validarCampo(k, normalizar(f, datos[k]), all) }));
  };

  const erroresArchivos = (dn) => {
    const e = {};
    for (const [k, f] of Object.entries(CAMPOS)) {
      if (!condOk(f, dn)) continue;
      if (esArchivo(f) && f.req && !(files[k]?.length || (f.type === 'selfie' && files[k]))) {
        e[k] = f.type === 'selfie' ? 'Sacate la selfie o subí una foto tuya.' : 'Adjuntá este documento.';
      }
      if (f.type === 'firma' && f.req && !firma) e[k] = 'Firmá dentro del recuadro.';
    }
    return e;
  };

  const irAlError = (keys) => {
    const k = keys[0];
    const el = formRef.current?.querySelector(`[data-key="${k}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el.querySelector('input,select,textarea,canvas,button')?.focus?.({ preventScroll: true }), 400);
    }
  };

  const enviar = async (ev) => {
    ev.preventDefault();
    setGlobal('');
    const { datos: dn, errores } = validarTodo(datos);
    const todos = { ...errores, ...erroresArchivos(dn) };
    setErr(todos);
    const keys = Object.keys(todos).filter((k) => todos[k]);
    if (keys.length) {
      setGlobal('Revisá los datos marcados en rojo.');
      irAlError(keys);
      return;
    }
    if (!supabaseOk) {
      setGlobal('La app todavía no está conectada a la base de datos (faltan las variables VITE_SUPABASE_*).');
      return;
    }

    setEnviando(true);
    try {
      // 1) Pedir URLs firmadas para los adjuntos.
      const lista = [];
      for (const [k, f] of Object.entries(CAMPOS)) {
        if (!esArchivo(f) || !condOk(f, dn)) continue;
        const arr = f.type === 'selfie' ? (files[k] ? [files[k]] : []) : files[k] || [];
        arr.forEach((file) => lista.push({ campo: k, file }));
      }
      setProgreso({ pct: 3, txt: 'Preparando…' });
      const r1 = await fetch('/api/subir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivos: lista.map((a) => ({ campo: a.campo, mime: a.file.type, bytes: a.file.size })) }),
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok) throw new Error(j1.error || 'No pudimos preparar la subida.');

      // 2) Subir cada archivo directo al storage.
      const total = lista.reduce((a, b) => a + b.file.size, 0) || 1;
      let subido = 0;
      const archivos = [];
      for (let i = 0; i < lista.length; i++) {
        const { campo, file } = lista[i];
        const u = j1.uploads[i];
        setProgreso({ pct: 5 + Math.round((subido / total) * 75), txt: `Subiendo documentación (${i + 1} de ${lista.length})…` });
        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, file, { contentType: file.type });
        if (error) throw new Error(`No se pudo subir «${file.name}». Revisá tu conexión y volvé a intentar.`);
        subido += file.size;
        archivos.push({ campo, path: u.path, nombre: file.name });
      }

      // 3) Registrar la afiliación.
      setProgreso({ pct: 85, txt: 'Registrando la afiliación y generando tu ficha…' });
      const r2 = await fetch('/api/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datos: { ...datos, acepta: datos.acepta ? '1' : '' }, archivos, firma, web: web.current, borrador: { draft: j1.draft, ts: j1.ts, sig: j1.sig } }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) {
        if (j2.errores) {
          setErr(j2.errores);
          irAlError(Object.keys(j2.errores));
        }
        throw new Error(j2.error || 'No pudimos registrar la solicitud.');
      }
      setProgreso({ pct: 100, txt: '' });
      setOk(j2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setGlobal(e.message || 'Error inesperado. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const nuevo = () => {
    setDatos(inicial());
    setFiles({});
    setFirma('');
    setErr({});
    setOk(null);
    setGlobal('');
    window.scrollTo({ top: 0 });
  };

  const aclaracion = [norm.apellido, norm.nombres].filter(Boolean).join(', ');

  let n = 0;
  return (
    <div className={`pcf-page${embed ? ' pcf-page--embed' : ''}`}>
      <div className="pcf-wrap">
        <header className="pcf-head">
          <div className="pcf-head__content">
          <div className="pcf-head__brand">
          <span className="pcf-head__logo-frame"><img className="pcf-head__logo" src="/logo.png" alt="PE.CI.F.A." width="176" height="176" /></span>
          <div>
            <strong className="pcf-head__name">PE.CI.F.A.</strong>
            <p className="pcf-head__union">Unión del Personal Civil de las Fuerzas Armadas OSFA y de Seguridad</p>
          </div>
          </div>
          <div className="pcf-head__label-row">
            <p className="pcf-head__kicker">Afiliación online</p>
            <span className="pcf-head__promise">Fácil <span aria-hidden="true">·</span> Simple <span aria-hidden="true">·</span> Seguro</span>
          </div>
          <h1 className="pcf-head__t">Tu afiliación empieza acá.</h1>
          <p className="pcf-head__s">Completá tu ficha y firmá desde tu celular o computadora. Al finalizar, obtené tu número de trámite y descargá tu constancia.</p>
          <span className="pcf-head__tag">La unión es el camino</span>
          </div>
          <img className="pcf-head__art" src="/afiliacion-pecifa.png" alt="" width="1254" height="1254" fetchPriority="high" />
        </header>

        {ok ? (
          <section className="pcf-ok" aria-live="polite">
            <div className="pcf-ok__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h3>¡Solicitud enviada!</h3>
            <p>Tu número de trámite es</p>
            <p className="pcf-ok__nro">{ok.nro}</p>
            <p className="pcf-ok__txt">
              Guardalo para cualquier consulta. Tu solicitud quedó registrada y está pendiente de revisión; el número de trámite todavía no es tu número de afiliado.
            </p>
            <div className={`pcf-receipt${ok.correoAfiliado ? '' : ' pcf-receipt--pending'}`}>
              <strong>{ok.correoAfiliado ? 'Constancia enviada por correo' : 'Tu solicitud está guardada; el correo no pudo enviarse'}</strong>
              <p>{ok.correoAfiliado ? <>Enviamos el número de trámite y tu ficha firmada en PDF a <strong>{norm.email}</strong>. Revisá también la carpeta de spam.</> : <>Descargá tu ficha y guardá el número de trámite. No hace falta volver a enviar la solicitud. Si necesitás ayuda, escribinos a <a href="mailto:info@pecifa.org">info@pecifa.org</a>.</>}</p>
            </div>
            <div className="pcf-ok__btns">
              <a className="pcf-btn pcf-btn--primary" href={ok.ficha}>
                Descargar mi ficha (PDF)
              </a>
              <button type="button" className="pcf-btn pcf-btn--ghost" onClick={nuevo}>
                Cargar otra afiliación
              </button>
            </div>
          </section>
        ) : (
          <div className="pcf-layout">
          <form ref={formRef} className="pcf-form" onSubmit={enviar} noValidate>
            <ol className="pcf-journey" aria-label="Pasos de la solicitud">
              <li><span>01</span><div><strong>Completá tus datos</strong><small>Personales y laborales</small></div></li>
              <li><span>02</span><div><strong>Adjuntá y firmá</strong><small>Documentación, selfie y firma</small></div></li>
              <li><span>03</span><div><strong>Recibí tu constancia</strong><small>Número de trámite y ficha PDF</small></div></li>
            </ol>
            <div className="pcf-prepare"><strong>Antes de empezar</strong><p>Tené a mano tu DNI (frente y dorso), el último recibo de haberes y tu CBU. Si incluís familiares, prepará también su documentación.</p></div>
            <h2 className="pcf-form__title">Ficha de afiliación</h2>
            <p className="pcf-intro">
              Solicitud de inscripción como afiliado activo. <span className="pcf-req">*</span> Campos obligatorios.
            </p>
            <div className="pcf-hp" aria-hidden="true">
              <label>
                No completar
                <input tabIndex={-1} autoComplete="off" onChange={(e) => (web.current = e.target.value)} />
              </label>
            </div>

            {SECCIONES.map((sec, index) => {
              const visibles = Object.entries(sec.campos).filter(([, f]) => condOk(f, norm));
              if (!visibles.length) return null;
              n += 1;
              return (
                <fieldset className="pcf-sec" id={`seccion-${index}`} key={sec.titulo}>
                  <legend className="pcf-sec__t">
                    <span className="pcf-sec__n">{n}</span>
                    {sec.titulo}
                  </legend>
                  {sec.nota && <p className="pcf-sec__nota">{sec.nota}</p>}
                  <div className="pcf-grid">
                    {visibles.map(([k, f]) => (
                      <Campo
                        key={k}
                        k={k}
                        f={f}
                        v={datos[k]}
                        error={err[k]}
                        set={set}
                        revisar={revisar}
                        files={files}
                        setFiles={(v) => {
                          setFiles((x) => ({ ...x, [k]: v }));
                          setErr((e) => ({ ...e, [k]: '' }));
                        }}
                        setError={(m) => setErr((e) => ({ ...e, [k]: m }))}
                        firma={firma}
                        setFirma={(v) => {
                          setFirma(v);
                          if (v) setErr((e) => ({ ...e, firma: '' }));
                        }}
                        aclaracion={aclaracion}
                      />
                    ))}
                  </div>
                </fieldset>
              );
            })}

            <div className="pcf-actions" id="enviar-solicitud">
              {global && (
                <div className="pcf-global-err" role="alert">
                  {global}
                </div>
              )}
              {enviando && (
                <>
                  <div className="pcf-progress">
                    <span style={{ width: progreso.pct + '%' }} />
                  </div>
                  <div className="pcf-steps">{progreso.txt}</div>
                </>
              )}
              <button type="submit" className="pcf-btn pcf-btn--primary pcf-submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              <p className="pcf-submit-note">Al enviar verás tu número de trámite y podrás descargar la ficha. También intentaremos enviarte la constancia al correo que ingresaste.</p>
            </div>
          </form>
          <aside className="pcf-tracker" aria-label="Avance de tu ficha">
            <div className="pcf-tracker__top">
              <div><span className="pcf-tracker__eyebrow">Paso a paso</span><h2>Tu ficha de afiliación</h2></div>
              <div className="pcf-tracker__ring" style={{ '--avance': `${avance.porcentaje}%` }} aria-hidden="true"><strong>{avance.porcentaje}<small>%</small></strong></div>
            </div>
            <div className="pcf-tracker__bar" role="progressbar" aria-label="Ficha completada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance.porcentaje}><span style={{ width: `${avance.porcentaje}%` }} /></div>
            <p className="pcf-tracker__summary">{avance.porcentaje === 100 ? '¡Todo listo! Revisá tu ficha y enviá la solicitud.' : `${avance.completos} de ${avance.total} requisitos completos`}</p>
            <nav aria-label="Secciones de la ficha" className="pcf-tracker__sections">
              {avance.secciones.map((sec, index) => {
                const completa = sec.total > 0 && sec.completos === sec.total;
                const actual = avance.siguiente?.id === sec.id;
                return <a key={sec.id} href={`#${sec.id}`} className={`${completa ? 'is-complete' : ''}${actual ? ' is-current' : ''}`} aria-current={actual ? 'step' : undefined}>
                  <span className="pcf-tracker__step" aria-hidden="true">{completa ? '✓' : String(index + 1).padStart(2, '0')}</span>
                  <span className="pcf-tracker__section-name">{sec.titulo}<small>{sec.total ? (completa ? 'Completo' : `${sec.completos} de ${sec.total} completos`) : 'Opcional'}</small></span>
                </a>;
              })}
            </nav>
            <a className="pcf-tracker__next" href={avance.siguiente ? `#${avance.siguiente.id}` : '#enviar-solicitud'}>{avance.siguiente ? 'Continuar completando' : 'Revisar y enviar'} <span aria-hidden="true">→</span></a>
            <p className="pcf-tracker__note">El avance cuenta los datos obligatorios válidos, tus adjuntos y la firma. La solicitud se registra al enviarla.</p>
          </aside>
          </div>
        )}
        {!embed && (
          <p className="pcf-foot">
            ¿Dudas? Escribinos a <a href="mailto:info@pecifa.org">info@pecifa.org</a> · <a href="https://www.pecifa.org">www.pecifa.org</a>
          </p>
        )}
      </div>
    </div>
  );
}

function Campo({ k, f, v, error, set, revisar, files, setFiles, setError, firma, setFirma, aclaracion }) {
  const id = `pcf-${k}`;
  const req = f.req ? (
    <span className="pcf-req" aria-hidden="true">
      {' '}
      *
    </span>
  ) : null;
  const help = f.help ? (
    <small className="pcf-help" id={`${id}-h`}>
      {f.help}
    </small>
  ) : null;
  const common = {
    id,
    name: k,
    className: 'pcf-input',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': f.help ? `${id}-h` : undefined,
    required: f.req,
    placeholder: f.placeholder,
    autoComplete: f.auto,
    maxLength: f.max && f.type !== 'select' ? f.max : undefined,
    onBlur: () => revisar(k),
  };
  let ctrl;
  switch (f.type) {
    case 'radio':
      ctrl = (
        <>
          <span className="pcf-label" id={`${id}-l`}>
            {f.label}
            {req}
          </span>
          <div className="pcf-chips" role="radiogroup" aria-labelledby={`${id}-l`}>
            {Object.entries(f.opts).map(([ov, ot]) => (
              <label className="pcf-chip" key={ov}>
                <input type="radio" name={k} value={ov} checked={v === ov} onChange={() => set(k, ov)} />
                <span>{ot}</span>
              </label>
            ))}
          </div>
          {help}
        </>
      );
      break;
    case 'select':
      ctrl = (
        <>
          <label className="pcf-label" htmlFor={id}>
            {f.label}
            {req}
          </label>
          <select {...common} value={v} onChange={(e) => set(k, e.target.value)}>
            <option value="">Seleccioná…</option>
            {Object.entries(f.opts).map(([ov, ot]) => (
              <option key={ov} value={ov}>
                {ot}
              </option>
            ))}
          </select>
          {help}
        </>
      );
      break;
    case 'familiares':
      ctrl = (
        <>
          <span className="pcf-label">
            {f.label}
            {req}
          </span>
          <Familiares value={v} max={f.max} onChange={(x) => set(k, x)} />
          {help}
        </>
      );
      break;
    case 'file':
      ctrl = (
        <>
          <span className="pcf-label">
            {f.label}
            {req}
          </span>
          <Archivos id={id} value={files[k] || []} multiple={f.multiple} onChange={setFiles} onError={setError} />
          {help}
        </>
      );
      break;
    case 'selfie':
      ctrl = <Selfie value={files[k] || null} onChange={setFiles} />;
      break;
    case 'firma':
      ctrl = (
        <>
          <span className="pcf-label">
            {f.label}
            {req}
          </span>
          <FirmaPad onChange={setFirma} aclaracion={aclaracion} error={error} />
          {help}
        </>
      );
      break;
    case 'declaracion':
      ctrl = (
        <label className="pcf-decl">
          <input type="checkbox" id={id} checked={!!v} onChange={(e) => set(k, e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
      break;
    case 'date':
      ctrl = (
        <>
          <label className="pcf-label" htmlFor={id}>
            {f.label}
            {req}
          </label>
          <input {...common} type="date" min="1920-01-01" max={hoyAR()} value={v} onChange={(e) => set(k, e.target.value)} />
          {help}
        </>
      );
      break;
    default: {
      const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text';
      const extra =
        f.type === 'digits'
          ? { inputMode: 'numeric', onChange: (e) => set(k, soloDigitos(e.target.value).slice(0, f.max)) }
          : f.type === 'money'
          ? { inputMode: 'decimal', onChange: (e) => set(k, e.target.value.replace(/[^\d.,]/g, '')) }
          : { onChange: (e) => set(k, e.target.value) };
      ctrl = (
        <>
          <label className="pcf-label" htmlFor={id}>
            {f.label}
            {req}
          </label>
          <input {...common} type={type} value={v} list={f.type === 'datalist' ? `${id}-dl` : undefined} {...extra} />
          {f.type === 'datalist' && (
            <datalist id={`${id}-dl`}>
              {Object.keys(f.opts).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
          {help}
        </>
      );
    }
  }
  return (
    <div className={`pcf-field pcf-col-${f.col || 'full'} pcf-t-${f.type}${error ? ' has-error' : ''}`} data-key={k}>
      {ctrl}
      <span className="pcf-err" role="alert">
        {error}
      </span>
    </div>
  );
}
