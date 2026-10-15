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
  const body = req.body || {};
  let registrada = null;
  try {
    const sb = admin();
    // Anti-bots: honeypot + borrador firmado con tiempo mínimo de carga.
    if (body.web) return json(res, 400, { error: 'No pudimos procesar el envío.' });
    const { draft, ts, sig } = body.borrador || {};
    if (!draft || !firmaOk(`${draft}.${ts}`, sig)) return json(res, 400, { error: 'La sesión de carga no es válida. Volvé a enviar.', renovar: true });
    if (Date.now() - Number(ts) > 6 * 3600 * 1000) return json(res, 400, { error: 'La sesión de carga venció. Volvé a enviar.', renovar: true });

    const dir = ip(req);
    const desde = new Date(Date.now() - RATE_MIN * 60000).toISOString();
    const { count, error: rateError } = await sb.from('afiliaciones').select('id', { count: 'exact', head: true }).eq('ip', dir).gte('created_at', desde);
    if (rateError) throw rateError;
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
        console.error('Supabase: validar adjunto', { campo: a.campo, code: error?.code, message: error?.message });
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
    const { data: dup, error: duplicateError } = await sb.from('afiliaciones').select('nro_tramite').eq('dni', datos.nro_documento).neq('estado', 'rechazada').limit(1);
    if (duplicateError) throw duplicateError;
    if (dup?.length) {
      return json(res, 409, { error: `Ya existe una solicitud de afiliación para este documento (trámite ${dup[0].nro_tramite}). Si necesitás corregir datos, comunicate con tu seccional.`, errores: { nro_documento: 'Ya registrado.' } });
    }

    const ahora = new Date().toISOString();
    datos.firma_fecha = ahora;
    datos.firma_ip = dir;
    const token = crypto.randomBytes(24).toString('base64url');

    // Guardar la firma ANTES de crear el registro: no confirmar una ficha sin firma.
    const firmaPath = `borradores/${draft}/firma-${crypto.randomBytes(6).toString('hex')}.png`;
    const { error: firmaError } = await sb.storage.from(BUCKET).upload(firmaPath, firma, { contentType: 'image/png' });
    if (firmaError) throw firmaError;
    files.firma = [{ campo: 'firma', path: firmaPath, mime: 'image/png', bytes: new Uint8Array(firma), nombre: 'firma.png', size: firma.length }];
    const originalMeta = Object.values(files).flat().map((f) => ({ campo: f.campo, path: f.path, nombre: f.nombre, mime: f.mime, bytes: f.size }));

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
        archivos: originalMeta,
        token,
        ip: dir,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 255),
        historial: [{ fecha: ahora, estado: 'pendiente', usuario: 'Formulario web', nota: 'Solicitud recibida' }],
      })
      .select('*')
      .single();
    if (e1) {
      console.error('Supabase: insertar afiliación', e1);
      if (e1.code === '23505') return json(res, 409, { error: 'Ya existe una solicitud de afiliación para este documento.', errores: { nro_documento: 'Ya registrado.' } });
      throw e1;
    }
    registrada = ins;

    const id = ins.id;
    const anio = ins.created_at.slice(0, 4);
    const nro = ins.nro_tramite;
    const base = `${anio}/${nro}`;

    // Copiar antes de actualizar las rutas. Si falla, el registro conserva
    // los originales válidos y nunca queda apuntando a archivos inexistentes.
    const meta = [];
    const originalesCopiados = [];
    const cuenta = {};
    for (const campo of Object.keys(files)) {
      for (const f of files[campo]) {
        cuenta[campo] = (cuenta[campo] || 0) + 1;
        const ext = f.path.split('.').pop();
        const dest = `${base}/${campo.replace('adj_', '')}-${cuenta[campo]}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).copy(f.path, dest);
        if (error) console.error('Supabase: organizar adjunto; se conserva original', { campo, code: error.code, message: error.message });
        else originalesCopiados.push(f.path);
        const path = error ? f.path : dest;
        f.path = path;
        meta.push({ campo, path, nombre: f.nombre, mime: f.mime, bytes: f.size });
      }
    }
    const { data: organizada, error: e2 } = await sb.from('afiliaciones').update({ archivos: meta }).eq('id', id).select('*').single();
    const row = e2 ? ins : organizada;
    if (e2) console.error('Supabase: actualizar rutas; se conservan originales registrados', e2);
    else if (originalesCopiados.length) {
      const { error } = await sb.storage.from(BUCKET).remove(originalesCopiados);
      if (error) console.error('Supabase: limpiar copias temporales', error);
    }

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
    // Nunca inducir un segundo envío si el INSERT ya se confirmó.
    if (registrada) return json(res, 200, {
      nro: registrada.nro_tramite, id: registrada.id, token: registrada.token,
      ficha: `/api/ficha?id=${registrada.id}&t=${registrada.token}`,
      correo: false, correoAfiliado: false,
      advertencia: 'La solicitud quedó registrada. Descargá tu ficha; no hace falta volver a enviarla.',
    });
    json(res, e.code === 'SUPABASE_CONFIG' ? 503 : 500, { error: e.code === 'SUPABASE_CONFIG'
      ? 'El servicio de afiliaciones todavía no está configurado. Comunicate con PE.CI.F.A. para completar tu solicitud.'
      : 'No pudimos registrar la solicitud en la base de datos. Revisá la conexión e intentá de nuevo. Si continúa, comunicate con PE.CI.F.A.' });
  }
}
