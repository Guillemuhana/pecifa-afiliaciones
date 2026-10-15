// Correos de la afiliación: aviso interno con el expediente PDF y constancia al afiliado.
import { generarPdf, nombrePdf } from './pdf.js';
import { cargarArchivos, lugarFicha } from './supa.js';
import { enviarCorreo, layout, boton, esc, destinosInternos } from './mail.js';
import { formatoCuil, ESTADOS } from '../../lib/schema.js';

const MAX_ADJ = 20 * 1024 * 1024;

export const baseUrl = (req) => process.env.PUBLIC_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

export async function avisoInterno(row, req, files = null) {
  files = files || (await cargarArchivos(row));
  let pdf = await generarPdf(row, files, { expediente: true, lugar: lugarFicha() });
  let nota = '';
  if (pdf.length > MAX_ADJ) {
    pdf = await generarPdf(row, files, { expediente: false, lugar: lugarFicha() });
    nota = 'El expediente completo supera el tamaño máximo para correo: se adjunta la ficha y el anexo; la documentación está en el panel.';
  }
  const d = row.datos || {};
  const fams = d.tiene_familiares === 'si' ? (d.familiares || []).length : 0;
  const filas = [
    ['Trámite', row.nro_tramite],
    ['Nombre', `${row.apellido}, ${row.nombres}`],
    ['Documento', row.dni],
    ['CUIL', formatoCuil(row.cuil)],
    ['Fuerza', row.fuerza],
    ['Localidad', row.localidad],
    ['Afiliado por', d.afiliado_por || 'No indicado'],
    ['Teléfono', row.telefono],
    ['Correo', row.email],
    ['Familiares', fams ? `${fams} declarado(s)` : 'No'],
    ['Adjuntos', `${(row.archivos || []).length} archivo(s), incluida firma y selfie`],
  ]
    .map(([k, v]) => `<tr><td style="color:#6b7690">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`)
    .join('');
  const html = layout(
    'Nueva afiliación',
    `<p>Ingresó una nueva <strong>solicitud de afiliación</strong>. Va adjunto el expediente en PDF (ficha firmada, anexo con selfie y grupo familiar, y toda la documentación).</p>
<table cellpadding="6" style="border-collapse:collapse;font-size:14px">${filas}</table>
${nota ? `<p style="color:#a12424">${esc(nota)}</p>` : ''}
${boton(`${baseUrl(req)}/admin/${row.id}`, 'Ver en el panel')}`
  );
  await enviarCorreo({
    to: destinosInternos(),
    subject: `[PECIFA] Nueva afiliación ${row.nro_tramite} - ${row.apellido}, ${row.nombres}`,
    html,
    replyTo: row.email,
    attachments: [{ filename: nombrePdf(row, true), content: pdf, contentType: 'application/pdf' }],
  });
}

export async function constanciaAfiliado(row, req, files) {
  if (!row.email) return;
  const pdf = await generarPdf(row, files, { expediente: false, lugar: lugarFicha() });
  const link = `${baseUrl(req)}/api/ficha?id=${row.id}&t=${row.token}`;
  const html = layout(
    'Recibimos tu solicitud',
    `<p>Hola ${esc(row.nombres)},</p>
<p>Recibimos tu solicitud de <strong>afiliación</strong>. Tu número de trámite es:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:1px;color:#0f2a5c;margin:8px 0">${esc(row.nro_tramite)}</p>
<p style="background:#f2f5fa;padding:14px 16px;border-left:4px solid #c9a227"><strong>Estado: pendiente de revisión.</strong><br>Guardá este número para consultar por tu solicitud. Todavía no es tu número de afiliado; tu afiliación debe ser revisada por PE.CI.F.A.</p>
<p>Te adjuntamos tu ficha firmada en PDF. También podés descargarla cuando quieras:</p>
${boton(link, 'Descargar mi ficha')}
<p style="font-size:13px;color:#6b7690">Este enlace es personal: no lo compartas. Ante cualquier duda escribinos a info@pecifa.org.</p>`
  );
  await enviarCorreo({
    to: row.email,
    subject: `PECIFA - Recibimos tu solicitud ${row.nro_tramite}`,
    html,
    attachments: [{ filename: nombrePdf(row, false), content: pdf, contentType: 'application/pdf' }],
  });
}

export async function cambioEstado(row, nota) {
  if (!row.email) return;
  const e = ESTADOS[row.estado] || row.estado;
  let c = `<p>Hola ${esc(row.nombres)},</p><p>Tu solicitud de <strong>afiliación</strong> (trámite ${esc(row.nro_tramite)}) cambió de estado a: <strong>${esc(e)}</strong>.</p>`;
  if (row.estado === 'aprobada' && row.nro_afiliado) c += `<p>Tu número de afiliado es <strong>${esc(row.nro_afiliado)}</strong>.</p>`;
  if (nota) c += `<p style="background:#f2f5fa;border-left:4px solid #1f6fd1;padding:10px 14px">${esc(nota).replace(/\n/g, '<br>')}</p>`;
  await enviarCorreo({ to: row.email, subject: `PECIFA - Tu trámite ${row.nro_tramite}: ${e}`, html: layout('Afiliación', c) });
}
