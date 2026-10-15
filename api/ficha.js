// GET /api/ficha?id=..&t=..  → PDF de la ficha para el afiliado (enlace personal).
import crypto from 'node:crypto';
import { admin, cargarArchivos, lugarFicha } from './_lib/supa.js';
import { json, pdf } from './_lib/http.js';
import { generarPdf, nombrePdf } from './_lib/pdf.js';
import { uuidValido } from '../lib/ids.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  const t = String(req.query.t || '');
  if (!uuidValido(id) || t.length < 20) return json(res, 404, { error: 'Ficha no encontrada.' });
  try {
  const { data: row, error } = await admin().from('afiliaciones').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const ok = row && row.token.length === t.length && crypto.timingSafeEqual(Buffer.from(row.token), Buffer.from(t));
  if (!ok) return json(res, 404, { error: 'Ficha no encontrada.' });
  const files = await cargarArchivos(row, ['firma', 'adj_selfie']);
  const bytes = await generarPdf(row, files, { expediente: false, lugar: lugarFicha() });
  pdf(res, bytes, nombrePdf(row, false), req.query.ver !== '1');
  } catch (error) {
    console.error('Supabase/PDF: descargar ficha', error);
    json(res, 500, { error: 'No pudimos generar tu ficha. Tu solicitud sigue registrada; intentá descargarla más tarde.' });
  }
}
