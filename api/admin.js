// POST /api/admin  (Authorization: Bearer <token de sesión del panel>)
// { accion: 'expediente' | 'ficha' | 'reenviar' | 'notificar', id, nota? }
import { admin, cargarArchivos, staffDesdeReq, lugarFicha } from './_lib/supa.js';
import { json, pdf, soloMetodo } from './_lib/http.js';
import { generarPdf, nombrePdf } from './_lib/pdf.js';
import { avisoInterno, cambioEstado } from './_lib/avisos.js';
import { correoConfigurado, destinosInternos } from './_lib/mail.js';
import { uuidValido } from '../lib/ids.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!soloMetodo(req, res, 'POST')) return;
  try {
  const staff = await staffDesdeReq(req);
  if (!staff) return json(res, 401, { error: 'Sesión inválida o sin permiso.' });
  const { accion, id, nota } = req.body || {};

  if (accion === 'estado-correo') return json(res, 200, { configurado: correoConfigurado(), destinos: destinosInternos() });

  if (!uuidValido(id)) return json(res, 400, { error: 'Identificador de solicitud inválido.' });
  const { data: row, error } = await admin().from('afiliaciones').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) return json(res, 404, { error: 'Solicitud inexistente.' });

    if (accion === 'expediente' || accion === 'ficha') {
      const exp = accion === 'expediente';
      const files = await cargarArchivos(row, exp ? null : ['firma', 'adj_selfie']);
      const bytes = await generarPdf(row, files, { expediente: exp, lugar: lugarFicha() });
      return pdf(res, bytes, nombrePdf(row, exp));
    }
    if (accion === 'reenviar') {
      await avisoInterno(row, req);
      return json(res, 200, { ok: true, destinos: destinosInternos() });
    }
    if (accion === 'notificar') {
      await cambioEstado(row, String(nota || '').slice(0, 2000));
      return json(res, 200, { ok: true });
    }
    json(res, 400, { error: 'Acción desconocida.' });
  } catch (e) {
    console.error('Supabase/admin', e);
    json(res, 500, { error: String(e.message || e).slice(0, 300) });
  }
}
