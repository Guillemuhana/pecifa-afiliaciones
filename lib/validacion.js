// Validación compartida entre el navegador y el servidor.
import { CAMPOS, PARENTESCOS, condOk, esArchivo } from './schema.js';

export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function cuilDv(diez) {
  const p = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(diez[i]) * p[i];
  const r = 11 - (s % 11);
  return r === 11 ? 0 : r; // 10 = no válido con ese prefijo
}

export function cuilValido(v) {
  if (!/^(20|23|24|25|26|27|30|33|34)\d{9}$/.test(v)) return false;
  const dni = v.slice(2, 10);
  const ver = Number(v[10]);
  if (cuilDv(v.slice(0, 10)) === ver) return true;
  const pref = v.slice(0, 2);
  if (pref === '23') return (ver === 9 && cuilDv('20' + dni) === 10) || (ver === 4 && cuilDv('27' + dni) === 10) || (ver === 3 && cuilDv('24' + dni) === 10);
  if (pref === '33') return ver === 9 && cuilDv('30' + dni) === 10;
  return false;
}

function cbuBloque(s, w) {
  let sum = 0;
  const n = s.length - 1;
  for (let i = 0; i < n; i++) sum += Number(s[i]) * w[i % w.length];
  return (10 - (sum % 10)) % 10 === Number(s[n]);
}
export const cbuValido = (v) => /^\d{22}$/.test(v) && cbuBloque(v.slice(0, 8), [7, 1, 3, 9]) && cbuBloque(v.slice(8), [3, 9, 7, 1]);

/** "1.234.567,89" | "1234567.89" | "1500" → "1234567.89" ('' si vacío, null si inválido). */
export function parseMoney(v) {
  v = String(v ?? '').replace(/[^\d,.]/g, '');
  if (!v) return '';
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if ((v.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(v)) v = v.replace(/\./g, '');
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? n.toFixed(2) : null;
}

export function hoyAR() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fechaValida(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function edad(v) {
  const h = hoyAR();
  let e = Number(h.slice(0, 4)) - Number(v.slice(0, 4));
  if (h.slice(5) < v.slice(5)) e -= 1;
  return e;
}

const limpiar = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Normaliza un valor según el tipo de campo. */
export function normalizar(f, raw) {
  if (f.type === 'familiares') {
    return (Array.isArray(raw) ? raw : [])
      .map((r) => ({
        nombre: limpiar(r?.nombre, 100),
        parentesco: limpiar(r?.parentesco, 30),
        dni: soloDigitos(r?.dni).slice(0, 9),
        nacimiento: limpiar(r?.nacimiento, 10),
      }))
      .filter((r) => r.nombre || r.parentesco || r.dni || r.nacimiento);
  }
  if (f.type === 'declaracion') return raw === true || raw === '1' || raw === 1 ? '1' : '';
  if (f.type === 'digits') return soloDigitos(raw);
  if (f.type === 'email') return limpiar(raw, 120).toLowerCase().replace(/\s/g, '');
  if (f.type === 'money') {
    const m = parseMoney(raw);
    return m === null ? String(raw ?? '').trim() : m;
  }
  return limpiar(raw, f.max || 200);
}

function validarFamiliares(rows, f) {
  if (!rows.length) return 'Cargá al menos un familiar o marcá «No».';
  if (rows.length > f.max) return `Máximo ${f.max} familiares.`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const n = i + 1;
    if (!r.nombre) return `Familiar ${n}: falta el apellido y nombre.`;
    if (!PARENTESCOS.includes(r.parentesco)) return `Familiar ${n}: elegí el parentesco.`;
    if (!/^\d{6,9}$/.test(r.dni)) return `Familiar ${n}: el DNI debe tener entre 6 y 9 dígitos.`;
    if (!fechaValida(r.nacimiento) || r.nacimiento > hoyAR() || r.nacimiento < '1910-01-01') return `Familiar ${n}: revisá la fecha de nacimiento.`;
  }
  return '';
}

/**
 * Valida un campo (ya normalizado). `datos` = resto de los datos, para reglas cruzadas.
 * Devuelve el mensaje de error o ''.
 */
export function validarCampo(key, v, datos = {}) {
  const f = CAMPOS[key];
  if (!f || esArchivo(f) || f.type === 'firma') return '';
  if (!condOk(f, datos)) return '';
  if (f.type === 'familiares') return validarFamiliares(v || [], f);

  if (v === '' || v === undefined || v === null) {
    if (!f.req) return '';
    if (f.type === 'declaracion') return 'Tenés que aceptar la declaración para continuar.';
    if (f.type === 'radio') return 'Elegí una opción.';
    return 'Este dato es obligatorio.';
  }
  if (f.max && f.type !== 'digits' && String(v).length > f.max) return `Máximo ${f.max} caracteres.`;

  switch (f.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Ingresá un correo válido.';
    case 'radio':
    case 'select':
      return f.opts[v] ? '' : 'Elegí una opción válida.';
    case 'money':
      return /^\d+\.\d{2}$/.test(v) ? '' : 'Ingresá un importe válido.';
    case 'date': {
      if (!fechaValida(v)) return 'Fecha inválida.';
      if (v > hoyAR()) return 'La fecha no puede ser futura.';
      if (v < '1940-01-01') return 'Revisá la fecha.';
      if (key === 'fecha_nacimiento') {
        const e = edad(v);
        if (e < 16 || e > 100) return 'Revisá la fecha de nacimiento.';
      }
      return '';
    }
  }

  switch (key) {
    case 'nro_documento':
      return /^\d{6,9}$/.test(v) ? '' : 'Entre 6 y 9 dígitos, sin puntos.';
    case 'tel_area':
      return /^\d{2,5}$/.test(v) ? '' : 'Entre 2 y 5 dígitos, sin 0.';
    case 'tel_numero':
      return /^\d{6,10}$/.test(v) ? '' : 'Entre 6 y 10 dígitos, sin 15.';
    case 'cbu':
      return cbuValido(v) ? '' : 'El CBU no es válido. Revisá los 22 dígitos.';
    case 'cuil': {
      if (!cuilValido(v)) return 'El CUIL no es válido. Revisá los 11 dígitos.';
      if (datos.tipo_documento === 'DNI' && /^\d{6,9}$/.test(datos.nro_documento || '')) {
        if (v.slice(2, 10) !== String(datos.nro_documento).padStart(8, '0')) return 'El CUIL no coincide con el N.º de documento.';
      }
      return '';
    }
  }
  return '';
}

/** Normaliza y valida todos los datos (sin archivos ni firma). */
export function validarTodo(input = {}) {
  const datos = {};
  const errores = {};
  for (const [k, f] of Object.entries(CAMPOS)) {
    if (esArchivo(f) || f.type === 'firma') continue;
    datos[k] = normalizar(f, input[k]);
  }
  for (const [k, f] of Object.entries(CAMPOS)) {
    if (esArchivo(f) || f.type === 'firma') continue;
    if (!condOk(f, datos)) {
      datos[k] = f.type === 'familiares' ? [] : '';
      continue;
    }
    const e = validarCampo(k, datos[k], datos);
    if (e) errores[k] = e;
  }
  return { datos, errores };
}
