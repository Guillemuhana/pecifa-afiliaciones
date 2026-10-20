import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, dayKey, EMPTY_FILTERS, exportTable, filterRows, statistics, toCSV } from '../src/admin/management.js';

const now = new Date('2026-10-20T15:00:00Z');
const rows = [
  { id: 'a', apellido: 'Pérez', nombres: 'Ana', dni: '12345678', cuil: '20123456789', estado: 'aprobada', created_at: '2026-10-01T02:00:00Z', fuerza: 'Armada', seccional: 'Córdoba', afiliado_por: 'María Suárez', datos: { nro_documento: '12345678' }, archivos: [{ campo: 'firma', path: 'PRIVATE-PATH' }], token: 'PRIVATE-TOKEN' },
  { id: 'b', apellido: 'López', nombres: 'José', dni: '23456789', estado: 'pendiente', created_at: '2026-10-01T03:00:00Z', fuerza: 'Ejército', datos: { seccional: 'Rosario', categoria: 'docente_civil', tiene_familiares: 'si', familiares: [{ nombre: 'Juan', dni: '123', parentesco: 'Hijo/a' }] } },
  { id: 'c', apellido: 'García', nombres: 'Lucía', estado: 'observada', created_at: '2026-10-20T10:00:00Z', fuerza: 'Ejército' },
  { id: 'd', apellido: 'Gómez', nombres: 'Pedro', estado: 'rechazada', created_at: '2026-09-05T10:00:00Z' },
];
test('fecha de Argentina y filtros inclusivos respetan la medianoche local', () => {
  assert.equal(dayKey(rows[0].created_at), '2026-09-30');
  assert.equal(dayKey(rows[1].created_at), '2026-10-01');
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, desde: '2026-10-01', hasta: '2026-10-01' }, now).map(row => row.id), ['b']);
});
test('búsqueda por múltiples términos, acentos, seccional y categoría', () => {
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, q: 'perez maria cordoba' }, now).map(row => row.id), ['a']);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, seccional: 'Rosario', categoria: 'docente_civil' }, now).map(row => row.id), ['b']);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, estado: 'observada', fuerza: 'Ejército' }, now).map(row => row.id), ['c']);
});
test('estadísticas nacionales, cohortes mensuales y demoras usan estados reales', () => {
  const stats = statistics(rows, now);
  assert.equal(stats.total, 4);
  assert.equal(stats.approvalRate, 25);
  assert.equal(stats.pending, 2);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.thisMonth, 2);
  assert.equal(stats.months.at(-1).total, 2);
  assert.equal(stats.months.at(-2).total, 2);
  assert.equal(stats.months.at(-2).aprobada, 1);
  assert.equal(stats.sections.find(group => group.name === 'Sin seccional').total, 2);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTERS, prioridad: 'demoradas' }, now).map(row => row.id), ['b']);
});
test('una base vacía produce indicadores válidos y no porcentajes NaN', () => {
  const stats = statistics([], now);
  assert.equal(stats.approvalRate, 0);
  assert.equal(stats.months.length, 6);
  assert.ok(stats.months.every(month => month.total === 0));
});
test('exportación incluye familiares y datos de negocio sin tokens ni rutas de documentos', () => {
  const table = exportTable(rows);
  assert.equal(table.values.length, 4);
  assert.ok(table.values.every(row => row.length === table.headers.length));
  assert.equal(table.values[1][table.headers.indexOf('Cantidad de familiares')], 1);
  assert.equal(table.values[0][table.headers.indexOf('N.º de CUIL')], '20123456789');
  const csv = toCSV(table);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(!csv.includes('PRIVATE-TOKEN'));
  assert.ok(!csv.includes('PRIVATE-PATH'));
});
test('CSV neutraliza fórmulas incluso después de espacios o tabulaciones', () => {
  for (const value of ['=HYPERLINK("evil")', '+1', '-1', '@SUM(A1)', '\t=SUM(A1)', '  =1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('1234567890123456789012'), '"\'1234567890123456789012"');
  assert.equal(csvCell('Texto; "con comillas"\ny líneas'), '"Texto; ""con comillas""\ny líneas"');
});
