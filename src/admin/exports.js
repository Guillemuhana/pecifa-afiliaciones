import { dayKey, exportTable, saveBlob, toCSV, statistics } from './management.js';
import { ESTADOS } from '../../lib/schema.js';

export async function exportRecords(rows, format, filters) {
  const date = dayKey(new Date());
  const table = exportTable(rows);
  if (format === 'csv') {
    saveBlob(new Blob([toCSV(table)], { type: 'text/csv;charset=utf-8' }), `pecifa-afiliaciones-${date}.csv`);
    return;
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PECIFA Nacional';
  workbook.created = new Date();
  const addSheet = (name, headers, values) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers);
    values.forEach(row => sheet.addRow(row.map(value => value == null ? '' : value)));
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15365D' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.getRow(1).height = 32;
    sheet.columns.forEach((column, index) => { column.width = Math.min(45, Math.max(18, headers[index].length + 4)); });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: headers.length } };
    sheet.eachRow((row, number) => {
      if (number > 1 && number % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FA' } }; });
    });
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return sheet;
  };
  const stats = statistics(rows);
  addSheet('Afiliaciones', table.headers, table.values);
  addSheet('Resumen', ['Indicador', 'Valor'], [
    ['Generado el', date], ['Alcance', `${rows.length} solicitudes exportadas`],
    ...Object.entries(filters).filter(([, value]) => value).map(([key, value]) => [`Filtro: ${key}`, value]),
    ['Solicitudes', stats.total], ...Object.entries(ESTADOS).map(([key, label]) => [label, stats.states[key]]),
    ['Porcentaje aprobado sobre solicitudes', `${stats.approvalRate}%`], ['Sin resolver con 7 días o más', stats.overdue],
  ]);
  addSheet('Seccionales', ['Seccional', 'Solicitudes', 'Aprobadas', 'Pendientes', 'En revisión', 'Observadas', 'Rechazadas'],
    stats.sections.map(row => [row.name, row.total, row.aprobada, row.pendiente, row.en_revision, row.observada, row.rechazada]));
  addSheet('Fuerzas', ['Fuerza', 'Solicitudes', 'Aprobadas'], stats.forces.map(row => [row.name, row.total, row.aprobada]));
  addSheet('Referentes', ['Referente informado', 'Solicitudes', 'Aprobadas'], stats.delegates.map(row => [row.name, row.total, row.aprobada]));
  saveBlob(new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `pecifa-afiliaciones-${date}.xlsx`);
}
