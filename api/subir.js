// POST /api/subir  → URLs firmadas para subir los adjuntos directo a Supabase Storage.
// Body: { archivos: [ { campo, mime, bytes } ] }
import crypto from 'node:crypto';
import { admin, BUCKET } from './_lib/supa.js';
import { json, soloMetodo, firmar } from './_lib/http.js';
import { CAMPOS, LIMITES, esArchivo } from '../lib/schema.js';

const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export default async function handler(req, res) {
  if (!soloMetodo(req, res, 'POST')) return;
  try {
    const lista = Array.isArray(req.body?.archivos) ? req.body.archivos : [];
    if (!lista.length || lista.length > LIMITES.maxTotal) return json(res, 400, { error: `Podés adjuntar hasta ${LIMITES.maxTotal} archivos en total.` });
    const porCampo = {};
    for (const a of lista) {
      const f = CAMPOS[a?.campo];
      if (!f || !esArchivo(f)) return json(res, 400, { error: 'Campo de archivo inválido.' });
      if (!LIMITES.mimes.includes(a.mime)) return json(res, 400, { error: 'Formato no permitido (PDF, JPG o PNG).', campo: a.campo });
      if (!(a.bytes > 0) || a.bytes > LIMITES.maxBytes) return json(res, 400, { error: 'Cada archivo puede pesar hasta 8 MB.', campo: a.campo });
      porCampo[a.campo] = (porCampo[a.campo] || 0) + 1;
      if (porCampo[a.campo] > (f.type === 'selfie' ? 1 : LIMITES.maxPorCampo)) return json(res, 400, { error: 'Demasiados archivos en un mismo campo.', campo: a.campo });
    }

    const draft = crypto.randomUUID();
    const ts = Date.now();
    const uploads = [];
    let i = 0;
    for (const a of lista) {
      const path = `borradores/${draft}/${a.campo}-${++i}-${crypto.randomBytes(6).toString('hex')}.${EXT[a.mime]}`;
      const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      uploads.push({ campo: a.campo, path: data.path, token: data.token });
    }
    json(res, 200, { draft, ts, sig: firmar(`${draft}.${ts}`), uploads });
  } catch (e) {
    console.error('subir', e);
    json(res, 500, { error: 'No pudimos preparar la subida de archivos. Probá de nuevo.' });
  }
}
