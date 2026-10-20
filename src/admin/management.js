import { CAMPOS, ESTADOS, esArchivo, legible, fechaHora } from '../../lib/schema.js';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = value => value ? dayFormat.format(new Date(value)) : '';
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const field = (row, key) => row[key] ?? row.datos?.[key] ?? '';
export const EMPTY_FILTERS = { q: '', estado: '', seccional: '', fuerza: '', categoria: '', desde: '', hasta: '', prioridad: '' };
export const unresolved = row => ['pendiente', 'en_revision', 'observada'].includes(row.estado);
export const overdue = (row, now = new Date()) => unresolved(row) && (new Date(now) - new Date(row.created_at)) >= 7 * 86400000;
export function filterRows(rows, filters, now = new Date()) {
  const words = normalize(filters.q).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (filters.estado && row.estado !== filters.estado) return false;
    if (filters.seccional && (field(row, 'seccional') || 'Sin seccional') !== filters.seccional) return false;
    if (filters.fuerza && (row.fuerza || 'Sin fuerza') !== filters.fuerza) return false;
    if (filters.categoria && field(row, 'categoria') !== filters.categoria) return false;
    const date = dayKey(row.created_at);
    if (filters.desde && date < filters.desde) return false;
    if (filters.hasta && date > filters.hasta) return false;
    if (filters.prioridad === 'demoradas' && !overdue(row, now)) return false;
    if (filters.prioridad === 'sin-seccional' && field(row, 'seccional')) return false;
    const searchable = normalize(['apellido', 'nombres', 'dni', 'cuil', 'email', 'telefono', 'nro_tramite', 'nro_afiliado', 'fuerza', 'localidad', 'seccional', 'afiliado_por', 'organismo'].map(key => field(row, key)).join(' '));
    return words.every(word => searchable.includes(word));
  });
}
export function groupRows(rows, key, fallback) {
  const groups = new Map();
  for (const row of rows) {
    const name = field(row, key) || fallback;
    const group = groups.get(name) || { name, total: 0, aprobada: 0, pendiente: 0, observada: 0, en_revision: 0, rechazada: 0 };
    group.total++;
    group[row.estado] = (group[row.estado] || 0) + 1;
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}
export function statistics(rows, now = new Date()) {
  const states = Object.fromEntries(Object.keys(ESTADOS).map(key => [key, 0]));
  rows.forEach(row => { states[row.estado] = (states[row.estado] || 0) + 1; });
  const current = dayKey(now).slice(0, 7);
  const [year, month] = current.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1, 12));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), total: 0, aprobada: 0 };
  });
  let thisMonth = 0;
  for (const row of rows) {
    const key = dayKey(row.created_at).slice(0, 7);
    if (key === current) thisMonth++;
    const item = months.find(month => month.key === key);
    if (item) { item.total++; if (row.estado === 'aprobada') item.aprobada++; }
  }
  return { total: rows.length, states, thisMonth, months, pending: rows.filter(unresolved).length,
    overdue: rows.filter(row => overdue(row, now)).length,
    unassigned: rows.filter(row => !field(row, 'seccional')).length,
    approvalRate: rows.length ? Math.round(states.aprobada / rows.length * 100) : 0,
    sections: groupRows(rows, 'seccional', 'Sin seccional'), forces: groupRows(rows, 'fuerza', 'Sin fuerza'),
    delegates: groupRows(rows, 'afiliado_por', 'Sin referente informado') };
}

// All exports use an explicit set of business fields. Tokens and private storage paths never enter exports.
export function exportTable(rows) {
  const fields = Object.entries(CAMPOS).filter(([, field]) => !esArchivo(field) && !['firma', 'declaracion'].includes(field.type));
  const headers = ['Trámite', 'Fecha de carga', 'Estado', 'N.º de afiliado', ...fields.flatMap(([, f]) => f.type === 'familiares' ? ['Familiares', 'Cantidad de familiares'] : [f.label]), 'Teléfono completo', 'Adjuntos', 'Firmó', 'Notas internas'];
  const values = rows.map(row => {
    const data = row.datos || {};
    const result = [row.nro_tramite, fechaHora(row.created_at), ESTADOS[row.estado] || row.estado, row.nro_afiliado || ''];
    for (const [key, f] of fields) {
      if (f.type === 'familiares') {
        const family = data.tiene_familiares === 'si' ? data.familiares || [] : [];
        result.push(family.map(person => `${person.nombre} (${person.parentesco}, DNI ${person.dni})`).join(' | '), family.length);
      } else result.push(legible(f, data[key] ?? row[key]));
    }
    result.push(row.telefono || '', (row.archivos || []).length, (row.archivos || []).some(file => file.campo === 'firma') ? 'Sí' : 'No', row.notas || '');
    return result;
  });
  return { headers, values };
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^\d{10,}$/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export const toCSV = table => '\uFEFF' + [table.headers, ...table.values].map(row => row.map(csvCell).join(';')).join('\r\n');

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
