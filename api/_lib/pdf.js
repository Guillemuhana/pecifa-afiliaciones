// Ficha de afiliación en PDF con pdf-lib.
//  - ficha:      hoja 1 (formato de la ficha en papel, con firma) + hoja 2 (anexo: selfie, familia, firma).
//  - expediente: ficha + cada documento adjunto (recibo, DNI, familiares) como páginas del mismo PDF.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CAMPOS, NOMBRE_ARCHIVO, DECLARACION, legible, formatoCuil, fechaLarga, fechaHora, condOk } from '../../lib/schema.js';
import { ENCABEZADO_JPG } from './assets.js';

const MM = 72 / 25.4;
const A4 = [595.28, 841.89];
const ML = 13;
const W = 184;
const AZUL = rgb(11 / 255, 35 / 255, 80 / 255);
const NAVY = rgb(15 / 255, 42 / 255, 92 / 255);
const NEGRO = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.4, 0.4, 0.4);

/** Solo caracteres representables en WinAnsi (fuentes estándar). */
const safe = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿ]/g, '');

class Hoja {
  constructor(doc, fonts) {
    this.doc = doc;
    this.page = doc.addPage(A4);
    this.f = fonts;
  }
  Y(mm) {
    return A4[1] - mm * MM;
  }
  text(x, y, t, { size = 10, bold = false, italic = false, color = NEGRO } = {}) {
    const font = bold ? this.f.b : italic ? this.f.i : this.f.r;
    this.page.drawText(safe(t), { x: x * MM, y: this.Y(y), size, font, color });
  }
  width(t, size = 10, bold = false) {
    return (bold ? this.f.b : this.f.r).widthOfTextAtSize(safe(t), size) / MM;
  }
  line(x1, y1, x2, y2, { w = 0.25, color = GRIS, dash = null } = {}) {
    this.page.drawLine({ start: { x: x1 * MM, y: this.Y(y1) }, end: { x: x2 * MM, y: this.Y(y2) }, thickness: w * MM, color, dashArray: dash || undefined });
  }
  rect(x, y, w, h, { fill = null, border = GRIS, bw = 0.3 } = {}) {
    this.page.drawRectangle({ x: x * MM, y: this.Y(y + h), width: w * MM, height: h * MM, color: fill || undefined, borderColor: border || undefined, borderWidth: border ? bw * MM : 0 });
  }
  image(img, x, y, w, h) {
    const k = Math.min(w / img.width, h / img.height);
    const iw = img.width * k;
    const ih = img.height * k;
    this.page.drawImage(img, { x: (x + (w - iw) / 2) * MM, y: this.Y(y + (h - ih) / 2 + ih), width: iw * MM, height: ih * MM });
  }
  /** Párrafo con salto de línea automático. Devuelve la Y final. */
  para(x, y, w, t, { size = 10.5, lh = 5, bold = false, color = NEGRO } = {}) {
    const words = safe(t).split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (this.width(test, size, bold) > w && line) {
        this.text(x, y, line, { size, bold, color });
        y += lh;
        line = word;
      } else line = test;
    }
    if (line) this.text(x, y, line, { size, bold, color });
    return y + lh;
  }
  /** "Etiqueta: ......valor......" */
  campo(x, y, w, label, valor) {
    const lw = this.width(label, 10) + 1.2;
    this.text(x, y, label, { size: 10 });
    const vx = x + lw;
    const vw = w - lw - 2;
    this.line(vx, y + 0.9, vx + vw, y + 0.9, { dash: [1, 2] });
    let t = safe(valor);
    let size = 10;
    while (size > 6.5 && this.width(t, size, true) > vw - 2) size -= 0.5;
    while (t.length > 1 && this.width(t, size, true) > vw - 2) t = t.slice(0, -1);
    if (t) this.text(vx + 1.2, y - 0.4, t, { size, bold: true, color: AZUL });
  }
  fila(y, campos) {
    const gap = 4;
    const total = campos.reduce((a, c) => a + c[2], 0);
    const disp = W - gap * (campos.length - 1);
    let x = ML;
    for (const c of campos) {
      const w = (disp * c[2]) / total;
      this.campo(x, y, w, c[0], c[1]);
      x += w + gap;
    }
  }
  casilla(x, y, on, label) {
    const s = 4.6;
    if (on) {
      this.rect(x, y - s + 0.8, s, s, { fill: rgb(231 / 255, 239 / 255, 251 / 255), border: rgb(31 / 255, 79 / 255, 160 / 255), bw: 0.45 });
      this.line(x + 1, y - s + 1.8, x + s - 1, y - 0.2, { w: 0.6, color: NAVY });
      this.line(x + s - 1, y - s + 1.8, x + 1, y - 0.2, { w: 0.6, color: NAVY });
    } else this.rect(x, y - s + 0.8, s, s, { border: rgb(31 / 255, 79 / 255, 160 / 255), bw: 0.45 });
    this.text(x + s + 1.8, y, label, { size: 10 });
  }
  casillas(y, items, x0 = ML, ancho = W) {
    const ws = items.map((it) => 4.6 + 1.8 + this.width(it[1], 10));
    const gap = items.length > 1 ? (ancho - ws.reduce((a, b) => a + b, 0)) / (items.length - 1) : 0;
    let x = x0;
    items.forEach((it, i) => {
      this.casilla(x, y, it[0], it[1]);
      x += ws[i] + gap;
    });
  }
  subtitulo(y, t) {
    this.text(ML, y, t.toUpperCase(), { size: 10.5, bold: true, color: NAVY });
    this.line(ML, y + 1.6, ML + W, y + 1.6, { w: 0.4, color: NAVY });
    return y + 6;
  }
}

async function embedImg(doc, a) {
  if (!a?.bytes) return null;
  try {
    if (a.mime === 'image/png') return await doc.embedPng(a.bytes);
    if (a.mime === 'image/jpeg') return await doc.embedJpg(a.bytes);
  } catch {
    return null;
  }
  return null;
}

const v = (d, k) => (k === 'cuil' ? formatoCuil(d[k]) : legible(CAMPOS[k], d[k]));

/**
 * @param {object} row      fila de la tabla afiliaciones
 * @param {object} files    { campo: [ { bytes:Uint8Array, mime, nombre } ] }
 * @param {object} opts     { expediente: bool, lugar: string }
 */
export async function generarPdf(row, files = {}, { expediente = false, lugar = '' } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Ficha de Afiliación ${row.nro_tramite} - ${row.apellido}, ${row.nombres}`));
  doc.setAuthor('PE.CI.F.A.');
  doc.setCreator('PECIFA Afiliaciones');
  const fonts = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const d = row.datos || {};
  const firma = await embedImg(doc, files.firma?.[0]);
  const selfie = await embedImg(doc, files.adj_selfie?.[0]);
  const nom = [d.apellido, d.nombres].filter(Boolean).join(', ');

  /* ---------------- Hoja 1: ficha ---------------- */
  const h = new Hoja(doc, fonts);
  const enc = await doc.embedJpg(Buffer.from(ENCABEZADO_JPG, 'base64'));
  const ih = (W * 392) / 1600;
  h.page.drawImage(enc, { x: ML * MM, y: h.Y(8 + ih), width: W * MM, height: ih * MM });
  let y = 8 + ih + 5;

  const lug = lugar || d.localidad || '';
  h.text(ML + 1, y, (lug ? lug + ', ' : '') + fechaLarga(row.created_at), { size: 10.5 });
  h.line(ML, y + 0.9, ML + 100, y + 0.9, { dash: [1, 2] });
  h.campo(ML + W - 62, y, 62, 'Afiliado N.º', row.nro_afiliado || '');
  h.text(ML, y + 4.6, `Trámite web N.º ${row.nro_tramite}`, { size: 7.5, color: GRIS });

  y = h.para(ML, y + 11, W, 'Me dirijo al compañero secretario general de la Unión del Personal Civil de las Fuerzas Armadas OSFA y de Seguridad, con el objeto de solicitarle mi inscripción como afiliado ACTIVO.');
  y += 5;
  h.casillas(y, [
    [d.categoria === 'personal_civil', 'PERSONAL CIVIL'],
    [d.categoria === 'docente_civil', 'DOCENTE CIVIL'],
    [d.situacion === 'permanente', 'PERMANENTE'],
    [d.situacion === 'contratado', 'CONTRATADO'],
  ]);
  y = h.para(ML, y + 7, W, 'A tal efecto, adjunto mis datos personales y declaro cumplir en un todo los Estatutos de la Institución, adhiriendo el beneficio del servicio de sepelio. Saludo al Compañero secretario general.');

  y += 4;
  const tit = 'D A T O S   P E R S O N A L E S';
  h.text(ML + (W - h.width(tit, 11)) / 2, y, tit, { size: 11 });

  const tel = d.tel_area ? `(${d.tel_area}) ${d.tel_numero || ''}` : '';
  const R = 7.6;
  y += 8;
  h.fila(y, [['Apellido y Nombre:', nom, 1]]);
  y += R;
  h.fila(y, [['Fecha de Nacimiento:', v(d, 'fecha_nacimiento'), 1.15], ['Nacionalidad:', v(d, 'nacionalidad'), 1], ['Estado Civil:', v(d, 'estado_civil'), 1]]);
  y += R;
  h.fila(y, [['Tipo y N.º de Documento:', `${v(d, 'tipo_documento')} ${v(d, 'nro_documento')}`.trim(), 1.05], ['Domicilio:', v(d, 'domicilio'), 1.45]]);
  y += R;
  h.fila(y, [['Código Postal:', v(d, 'codigo_postal'), 0.7], ['Localidad:', v(d, 'localidad'), 1.1], ['Fuerza:', v(d, 'fuerza'), 1.2]]);
  y += R;
  h.fila(y, [['Correo Electrónico:', v(d, 'email'), 1.4], ['Teléfono Particular:', tel, 1]]);

  y += R + 2;
  h.text(ML, y, 'Nivel de Estudios:', { size: 10 });
  const lx = ML + h.width('Nivel de Estudios:', 10) + 8;
  h.casillas(
    y,
    [
      [d.nivel_estudios === 'primario', 'Primario'],
      [d.nivel_estudios === 'secundario', 'Secundario'],
      [d.nivel_estudios === 'terciario', 'Terciario'],
      [d.nivel_estudios === 'universitario', 'Universitario'],
    ],
    lx,
    ML + W - lx
  );
  y += R + 1;
  h.fila(y, [['Fecha de Ingreso:', v(d, 'fecha_ingreso'), 0.95], ['Organismo:', v(d, 'organismo'), 1.15], ['M.R/NOU/OSFA/LEGAJO:', v(d, 'legajo'), 1.15]]);
  y += R;
  h.fila(y, [['Código Destino:', v(d, 'codigo_destino'), 0.9], ['Función que Desempeña:', v(d, 'funcion'), 1.35], ['Tel. Laboral:', v(d, 'tel_laboral'), 0.95]]);
  y += R;
  h.fila(y, [['N.º CUIL:', v(d, 'cuil'), 0.85], ['CBU:', v(d, 'cbu'), 1.3]]);
  y += R;
  h.fila(y, [['Agrupamiento:', v(d, 'agrupamiento'), 1], ['Nivel:', v(d, 'nivel'), 0.5], ['Grado:', v(d, 'grado'), 0.5], ['Remuneración Bruta:', v(d, 'remuneracion_bruta'), 1.25]]);
  y += R;
  h.fila(y, [['Afiliado por:', v(d, 'afiliado_por'), 1], ['Seccional Interviniente:', v(d, 'seccional'), 1.15]]);

  // Firma y aclaración.
  y += 27;
  const fw = 62;
  const x2 = ML + W - fw;
  const x1 = x2 - 12 - fw;
  h.line(x1, y, x1 + fw, y, { w: 0.3, color: NEGRO });
  h.line(x2, y, x2 + fw, y, { w: 0.3, color: NEGRO });
  if (firma) h.image(firma, x1 + 2, y - 22, fw - 4, 21.5);
  h.text(x2 + Math.max(0, (fw - h.width(nom, 10, true)) / 2), y - 1.5, nom, { size: 10, bold: true, color: AZUL });
  h.text(x1 + (fw - h.width('Firma', 10)) / 2, y + 4.5, 'Firma', { size: 10 });
  h.text(x2 + (fw - h.width('Aclaración', 10)) / 2, y + 4.5, 'Aclaración', { size: 10 });

  y = Math.max(y + 12, 250);
  h.text(ML, y, '(*) Para el género femenino, deberá indicarse solamente el Apellido de soltera.', { size: 9.5 });
  h.text(ML, y + 4.6, 'Se deberá adjuntar fotocopia del último Recibo de Haberes.', { size: 9.5 });
  if (firma && d.firma_fecha) {
    h.text(ML, y + 9.2, `Firmada en línea el ${fechaHora(d.firma_fecha)} hs${d.firma_ip ? ' desde IP ' + d.firma_ip : ''}. Documentación y foto de validación en el anexo.`, { size: 7.5, color: GRIS });
  }
  const by = y + 12;
  h.rect(ML, by, W, 14, { border: rgb(0.6, 0.6, 0.6), bw: 0.25 });
  h.text(ML + 3, by + 4.2, 'PARA USO DE LA INSTITUCIÓN', { size: 7, bold: true, color: GRIS });
  h.text(ML + 3, by + 10.5, 'Recibido: ____/____/______', { size: 8.5 });
  h.text(ML + 66, by + 10.5, 'Alta N.º: ________________', { size: 8.5 });
  h.text(ML + 118, by + 10.5, 'Firma y sello: ______________________', { size: 8.5 });

  /* ---------------- Hoja 2: anexo ---------------- */
  const a = new Hoja(doc, fonts);
  a.rect(ML, 10, W, 11, { fill: NAVY, border: null });
  a.text(ML + 4, 17.3, 'ANEXO · Registro de afiliación', { size: 12, bold: true, color: rgb(1, 1, 1) });
  const tr = `Trámite ${row.nro_tramite}`;
  a.text(ML + W - 4 - a.width(tr, 9), 17.3, tr, { size: 9, color: rgb(1, 1, 1) });

  y = 28;
  const pw = 46;
  const ph = 58;
  a.rect(ML, y, pw, ph);
  if (selfie) a.image(selfie, ML + 0.6, y + 0.6, pw - 1.2, ph - 1.2);
  else a.text(ML + 14, y + ph / 2, 'Sin foto', { size: 8, italic: true, color: GRIS });
  a.text(ML, y + ph + 4, 'Foto de validación de identidad', { size: 7.5, color: GRIS });

  const ax = ML + pw + 8;
  const aw = W - pw - 8;
  let yy = y + 5;
  a.text(ax, yy, nom, { size: 14, bold: true, color: NAVY });
  yy += 9;
  for (const [l, val] of [
    ['Documento:', `${v(d, 'tipo_documento')} ${v(d, 'nro_documento')}`.trim()],
    ['CUIL:', v(d, 'cuil')],
    ['Fuerza / Organismo:', [v(d, 'fuerza'), v(d, 'organismo')].filter(Boolean).join(' · ')],
    ['Correo / Teléfono:', [v(d, 'email'), tel].filter(Boolean).join('  ·  ')],
    ['Recibida:', fechaHora(row.created_at) + ' hs'],
  ]) {
    a.campo(ax, yy, aw, l, val);
    yy += 8;
  }

  y = a.subtitulo(y + ph + 12, 'Grupo familiar');
  const fams = d.tiene_familiares === 'si' && Array.isArray(d.familiares) ? d.familiares : [];
  if (!fams.length) {
    a.text(ML, y + 4, 'No declara familiares a cargo.', { size: 10 });
    y += 10;
  } else {
    const cols = [['#', 8], ['Apellido y nombre', 74], ['Parentesco', 34], ['DNI', 32], ['Fecha de nac.', 36]];
    let x = ML;
    for (const c of cols) {
      a.rect(x, y, c[1], 7, { fill: rgb(234 / 255, 241 / 255, 251 / 255), border: rgb(0.5, 0.5, 0.5), bw: 0.2 });
      a.text(x + 1.5, y + 4.8, c[0], { size: 9, bold: true });
      x += c[1];
    }
    y += 7;
    fams.forEach((f, i) => {
      const vals = [String(i + 1), f.nombre, f.parentesco, f.dni, legible({ type: 'date' }, f.nacimiento)];
      let cx = ML;
      cols.forEach((c, k) => {
        a.rect(cx, y, c[1], 7, { border: rgb(0.5, 0.5, 0.5), bw: 0.2 });
        let t = safe(vals[k]);
        while (t.length > 1 && a.width(t, 9.5) > c[1] - 3) t = t.slice(0, -1);
        a.text(cx + 1.5, y + 4.8, t, { size: 9.5 });
        cx += c[1];
      });
      y += 7;
    });
    y += 6;
  }

  y = a.subtitulo(y, 'Documentación presentada en línea');
  for (const k of ['adj_recibo', 'adj_dni', 'adj_familiares', 'adj_selfie']) {
    const f = CAMPOS[k];
    if (!condOk(f, d)) continue;
    const n = (row.archivos || []).filter((x) => x.campo === k).length;
    a.casilla(ML, y + 4, n > 0, `${f.label}  (${n ? n + ' archivo' + (n > 1 ? 's' : '') : 'no adjuntado'})`);
    y += 7.5;
  }

  y = a.subtitulo(y + 6, 'Firma electrónica');
  a.rect(ML, y, 80, 32);
  if (firma) a.image(firma, ML + 2, y + 2, 76, 28);
  const ftxt = firma
    ? `El/la solicitante firmó la presente ficha en forma manuscrita digital sobre la pantalla de su dispositivo, aceptando la declaración: «${DECLARACION}»`
    : 'Sin firma digital.';
  let fy = a.para(ML + 86, y + 4, W - 86, ftxt, { size: 9.5, lh: 4.6 });
  if (firma) {
    fy += 2;
    a.text(ML + 86, fy, `Fecha y hora: ${d.firma_fecha ? fechaHora(d.firma_fecha, true) : '-'} (hora Argentina)`, { size: 9.5 });
    a.text(ML + 86, fy + 4.6, `IP: ${d.firma_ip || '-'}`, { size: 9.5 });
  }
  a.para(ML, 287, W, 'PE.CI.F.A. · Unión del Personal Civil de las Fuerzas Armadas OSFA y de Seguridad · Personería Gremial N.º 825 · Av. La Plata 2047 (1250) CABA · www.pecifa.org', { size: 7.5, lh: 3, color: GRIS });

  /* ---------------- Documentos adjuntos ---------------- */
  if (expediente) {
    for (const campo of ['adj_recibo', 'adj_dni', 'adj_familiares']) {
      const lista = files[campo] || [];
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        const titulo = `${NOMBRE_ARCHIVO[campo] || campo}${lista.length > 1 ? ` (${i + 1}/${lista.length})` : ''} · ${f.nombre || ''}`;
        if (f.mime === 'application/pdf') {
          try {
            const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
            const pages = await doc.copyPages(src, src.getPageIndices());
            pages.forEach((p) => doc.addPage(p));
          } catch {
            const hj = new Hoja(doc, fonts);
            hj.text(ML, 20, titulo, { size: 11, bold: true, color: NAVY });
            hj.text(ML, 30, 'No se pudo incrustar este PDF (protegido o dañado). Descargalo desde el panel.', { size: 10 });
          }
          continue;
        }
        const img = await embedImg(doc, f);
        const hj = new Hoja(doc, fonts);
        hj.text(ML, 14, titulo, { size: 10, bold: true, color: NAVY });
        hj.text(ML + W - hj.width(row.nro_tramite, 8), 14, row.nro_tramite, { size: 8, color: GRIS });
        hj.line(ML, 16, ML + W, 16, { w: 0.3, color: NAVY });
        if (img) hj.image(img, ML, 20, W, 265);
        else hj.text(ML, 30, 'No se pudo incrustar esta imagen. Descargala desde el panel.', { size: 10 });
      }
    }
  }

  return await doc.save();
}

export const nombrePdf = (row, expediente = false) =>
  `${expediente ? 'Expediente' : 'Ficha'}-Afiliacion-${row.nro_tramite}-${String(row.apellido || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
