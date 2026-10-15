// POST /api/enviar → valida, registra la afiliación, mueve los adjuntos y envía los correos con el PDF.
import crypto from 'node:crypto';
import { admin, BUCKET } from './_lib/supa.js';
import { json, soloMetodo, firmaOk, ip, sniff } from './_lib/http.js';
import { avisoInterno, constanciaAfiliado } from './_lib/avisos.js';
import { CAMPOS, LIMITES, esArchivo, condOk } from '../lib/schema.js';
import { validarTodo } from '../lib/validacion.js';

export const config = { maxDuration: 60 };

const RATE_MAX = 6;
const RATE_MIN = 15;

function decodificarFirma(dataUrl) {
  const s = String(dataUrl || '');
  if (!s.startsWith('data:image/png;base64,')) return null;
  const b = Buffer.from(s.slice(22), 'base64');
  if (b.length < 400 || b.length > 1024 * 1024 || sniff(b) !== 'image/png') return null;
  return b;
}

export default async function handler(req, res) {
  if (!soloMetodo(req, res, 'POST')) return;
  const sb = admin();
  const body = req.body || {};
  try {
    // Anti-bots: honeypot + borrador firmado con tiempo mínimo de carga.
    if (body.web) return json(res, 400, { error: 'No pudimos procesar el envío.' });
    const { draft, ts, sig } = body.borrador || {};
    if (!draft || !firmaOk(`${draft}.${ts}`, sig)) return json(res, 400, { error: 'La sesión de carga no es válida. Volvé a enviar.', renovar: true });
    if (Date.now() - Number(ts) > 6 * 3600 * 1000) return json(res, 400, { error: 'La sesión de carga venció. Volvé a enviar.', renovar: true });

    const dir = ip(req);
    const desde = new Date(Date.now() - RATE_MIN * 60000).toISOString();
    const { count } = await sb.from('afiliaciones').select('id', { count: 'exact', head: true }).eq('ip', dir).gte('created_at', desde);
    if ((count || 0) >= RATE_MAX) return json(res, 429, { error: 'Recibimos demasiados envíos desde tu conexión. Probá en unos minutos.' });

    const { datos, errores } = validarTodo(body.datos || {});

    // Adjuntos.
    const archivos = (Array.isArray(body.archivos) ? body.archivos : []).filter((a) => typeof a?.path === 'string' && a.path.startsWith(`borradores/${draft}/`) && !a.path.includes('..'));
    const files = {};
    for (const a of archivos) {
      const f = CAMPOS[a.campo];
      if (!f || !esArchivo(f) || !condOk(f, datos) || !a.path.includes(`/${a.campo}-`)) continue;
      const { data, error } = await sb.storage.from(BUCKET).download(a.path);
      if (error || !data) {
        errores[a.campo] = 'Un archivo no se terminó de subir. Volvé a adjuntarlo.';
        continue;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      const mime = sniff(bytes);
      if (!mime || !LIMITES.mimes.includes(mime) || bytes.length > LIMITES.maxBytes) {
        errores[a.campo] = `«${String(a.nombre || 'archivo').slice(0, 60)}» no es un PDF, JPG o PNG válido.`;
        continue;
      }
      (files[a.campo] ||= []).push({ campo: a.campo, path: a.path, nombre: String(a.nombre || 'archivo').replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 80) || 'archivo', mime, bytes: bytes, size: bytes.length });
    }
    for (const [k, f] of Object.entries(CAMPOS)) {
      if (!esArchivo(f) || !f.req || !condOk(f, datos) || errores[k]) continue;
      if (!files[k]?.length) errores[k] = f.type === 'selfie' ? 'Sacate la selfie o subí una foto tuya.' : 'Adjuntá este documento.';
    }
    if (files.adj_selfie?.[0] && files.adj_selfie[0].mime === 'application/pdf') errores.adj_selfie = 'La selfie tiene que ser una foto.';

    const firma = decodificarFirma(body.firma);
    if (!firma) errores.firma = 'Firmá dentro del recuadro.';

    if (Object.keys(errores).length) return json(res, 422, { error: 'Revisá los datos marcados.', errores });

    // Duplicados.
    const { data: dup } = await sb.from('afiliaciones').select('nro_tramite').eq('dni', datos.nro_documento).neq('estado', 'rechazada').limit(1);
    if (dup?.length) {
      return json(res, 409, { error: `Ya existe una solicitud de afiliación para este documento (trámite ${dup[0].nro_tramite}). Si necesitás corregir datos, comunicate con tu seccional.`, errores: { nro_documento: 'Ya registrado.' } });
    }

    const ahora = new Date().toISOString();
    datos.firma_fecha = ahora;
    datos.firma_ip = dir;
    const token = crypto.randomBytes(24).toString('base64url');

    const { data: ins, error: e1 } = await sb
      .from('afiliaciones')
      .insert({
        estado: 'pendiente',
        apellido: datos.apellido,
        nombres: datos.nombres,
        dni: datos.nro_documento,
        cuil: datos.cuil,
        email: datos.email,
        telefono: `${datos.tel_area} ${datos.tel_numero}`.trim(),
        fuerza: datos.fuerza,
        localidad: datos.localidad,
        datos,
        token,
        ip: dir,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 255),
        historial: [{ fecha: ahora, estado: 'pendiente', usuario: 'Formulario web', nota: 'Solicitud recibida' }],
      })
      .select('id, created_at')
      .single();
    if (e1) {
      if (e1.code === '23505') return json(res, 409, { error: 'Ya existe una solicitud de afiliación para este documento.', errores: { nro_documento: 'Ya registrado.' } });
      throw e1;
    }

    const id = ins.id;
    const anio = ins.created_at.slice(0, 4);
    const nro = `AF-${anio}-${String(id).padStart(5, '0')}`;
    const base = `${anio}/${nro}`;

    // Mover adjuntos a la carpeta definitiva y guardar la firma.
    const meta = [];
    const cuenta = {};
    for (const campo of Object.keys(files)) {
      for (const f of files[campo]) {
        cuenta[campo] = (cuenta[campo] || 0) + 1;
        const ext = f.path.split('.').pop();
        const dest = `${base}/${campo.replace('adj_', '')}-${cuenta[campo]}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).move(f.path, dest);
        const path = error ? f.path : dest;
        f.path = path;
        meta.push({ campo, path, nombre: f.nombre, mime: f.mime, bytes: f.size });
      }
    }
    const fpath = `${base}/firma.png`;
    const { error: ef } = await sb.storage.from(BUCKET).upload(fpath, firma, { contentType: 'image/png', upsert: true });
    if (!ef) {
      meta.push({ campo: 'firma', path: fpath, nombre: 'firma.png', mime: 'image/png', bytes: firma.length });
      files.firma = [{ campo: 'firma', mime: 'image/png', bytes: new Uint8Array(firma), nombre: 'firma.png' }];
    }

    const { data: row, error: e2 } = await sb.from('afiliaciones').update({ nro_tramite: nro, archivos: meta }).eq('id', id).select('*').single();
    if (e2) throw e2;

    // Correos (si fallan, la afiliación igual queda registrada).
    let correo = true;
    try {
      await avisoInterno(row, req, files);
    } catch (e) {
      correo = false;
      console.error('aviso interno', e);
      await sb.from('afiliaciones').update({ historial: [...row.historial, { fecha: new Date().toISOString(), estado: 'pendiente', usuario: 'Sistema', nota: 'No se pudo enviar el aviso por correo: ' + String(e.message || e).slice(0, 200) }] }).eq('id', id);
    }
    let correoAfiliado = false;
    try {
      await constanciaAfiliado(row, req, files);
      correoAfiliado = true;
    } catch (e) {
      console.error('constancia', e);
    }

    json(res, 200, { nro, id, token, ficha: `/api/ficha?id=${id}&t=${token}`, correo, correoAfiliado });
  } catch (e) {
    console.error('enviar', e);
    json(res, 500, { error: 'No pudimos guardar la solicitud. Probá de nuevo en unos minutos.' });
  }
}
