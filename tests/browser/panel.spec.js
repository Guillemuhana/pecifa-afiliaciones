import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';

const states = ['pendiente', 'en_revision', 'observada', 'aprobada', 'rechazada'];
const records = Array.from({ length: 63 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  nro_tramite: `AF-2026-${String(index + 1).padStart(5, '0')}`,
  apellido: index === 0 ? 'Pérez' : `Apellido ${String(index + 1).padStart(2, '0')}`,
  nombres: index === 0 ? 'Ana' : 'Nombre de prueba', dni: String(30000000 + index), cuil: `20300000${String(index).padStart(3, '0')}`,
  email: `persona${index + 1}@example.org`, telefono: '3511234567', fuerza: index % 2 ? 'Ejército Argentino' : 'Armada Argentina',
  localidad: index % 2 ? 'Rosario' : 'Córdoba',
  estado: states[index % 5], nro_afiliado: index % 5 === 3 ? `N-${index}` : '',
  created_at: `2026-${index % 3 ? '10' : '09'}-${String(index % 19 + 1).padStart(2, '0')}T15:00:00Z`,
  updated_at: '2026-10-20T12:00:00Z',
  seccional: index % 3 === 0 ? '' : index % 2 ? 'Rosario' : 'Córdoba',
  categoria: index % 2 ? 'docente_civil' : 'personal_civil', afiliado_por: 'Delegado de prueba', organismo: 'Organismo de prueba',
  datos: { nro_documento: String(30000000 + index), cbu: '1234567890123456789012', seccional: index % 3 === 0 ? '' : index % 2 ? 'Rosario' : 'Córdoba', categoria: index % 2 ? 'docente_civil' : 'personal_civil', afiliado_por: 'Delegado de prueba' },
  archivos: [], historial: [], notas: '=Texto ingresado por una persona', token: 'MUST-NOT-BE-EXPORTED',
}));

async function mockPanel(page, { empty = false, fail = false, files = null, fileError = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('pecifa-admin', JSON.stringify({ access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: 2000000000, expires_in: 3600, token_type: 'bearer', user: { id: 'staff-test', aud: 'authenticated', role: 'authenticated', email: 'staff@example.org', app_metadata: { provider: 'email' }, user_metadata: {} } }));
  });
  await page.route('https://pecifa-test.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/staff')) return route.fulfill({ json: [{ email: 'staff@example.org', nombre: 'Equipo PECIFA' }] });
    if (url.pathname.startsWith('/rest/v1/afiliaciones')) {
      if (fail) return route.fulfill({ status: 500, json: { message: 'Error de prueba de conexión' } });
      let data = empty ? [] : records.map((row, index) => files && index === 0 ? { ...row, archivos: files } : row);
      const id = url.searchParams.get('id');
      if (id?.startsWith('eq.')) data = data.filter(row => row.id === id.slice(3));
      if (id?.startsWith('in.')) data = data.filter(row => id.includes(row.id));
      const total = data.length;
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 1000);
      // Mimic a Supabase project with a low row cap to exercise complete pagination.
      data = data.slice(offset, offset + Math.min(limit, 30));
      return route.fulfill({ headers: { 'content-range': `${offset}-${offset + data.length - 1}/${total}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' }, json: data });
    }
    if (url.pathname.includes('/storage/v1/object/')) {
      if (fileError) return route.fulfill({ status: 404, json: { statusCode: '404', message: 'Object not found' } });
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.paths) return route.fulfill({ json: body.paths.map(path => ({ path, signedURL: `/object/sign/afiliaciones/${path}?token=test`, error: null })) });
        return route.fulfill({ json: { signedURL: '/object/sign/afiliaciones/test.pdf?token=test' } });
      }
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 test attachment' });
    }
    return route.fulfill({ json: {} });
  });
}

test('resumen completo, filtros persistentes entre vistas y paginación', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Resumen nacional' })).toBeVisible();
  await expect(page.getByText('63 de 63 solicitudes')).toBeVisible();
  await page.getByRole('link', { name: 'Base de afiliaciones', exact: true }).click();
  await expect(page.getByText('1–25 de 63', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByText('26–50 de 63', { exact: true })).toBeVisible();
  await page.getByLabel('Buscar afiliaciones').fill('perez');
  await expect(page.getByText('1 de 63 solicitudes')).toBeVisible();
  await expect(page.getByRole('link', { name: 'AF-2026-00001', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Informes y seccionales', exact: true }).click();
  await expect(page.getByLabel('Buscar afiliaciones')).toHaveValue('perez');
  await expect(page.getByRole('heading', { name: 'Gestión por seccional' })).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByText('63 de 63 solicitudes')).toBeVisible();
  await page.screenshot({ path: 'test-results/panel-nacional-escritorio.png', fullPage: true });
});

test('recibo y DNI visibles al abrir la ficha, con descarga individual y vista previa', async ({ page }) => {
  await mockPanel(page, { files: [
    { campo: 'adj_recibo', nombre: 'recibo.pdf', path: 'test/recibo.pdf', mime: 'application/pdf', bytes: 1200 },
    { campo: 'adj_dni', nombre: 'dni-frente.pdf', path: 'test/dni-frente.pdf', mime: 'application/pdf', bytes: 800 },
    { campo: 'adj_dni', nombre: 'dni-dorso.pdf', path: 'test/dni-dorso.pdf', mime: 'application/pdf', bytes: 900 },
  ] });
  await page.goto('/admin?vista=base&q=perez');
  await page.getByRole('link', { name: 'Ver adjuntos de Pérez, Ana' }).click();
  await expect(page.getByRole('heading', { name: 'Documentos del solicitante' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recibo de haberes', exact: true })).toContainText('recibo.pdf');
  await expect(page.getByRole('region', { name: 'DNI · frente y dorso', exact: true })).toContainText('dni-dorso.pdf');
  const receipt = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar recibo.pdf', exact: true }).click();
  const receiptFile = await receipt;
  expect(receiptFile.suggestedFilename()).toBe('recibo.pdf');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(await receiptFile.path(), 'utf8')).toBe('%PDF-1.4 test attachment');
  const dni = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar dni-frente.pdf', exact: true }).click();
  expect((await dni).suggestedFilename()).toBe('dni-frente.pdf');
  await page.getByRole('button', { name: 'Ver dni-dorso.pdf', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTitle('dni-dorso.pdf', { exact: true })).toHaveAttribute('src', /object\/sign\/afiliaciones/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('un archivo ausente informa el error y no ofrece una descarga ficticia', async ({ page }) => {
  await mockPanel(page, { files: [{ campo: 'adj_recibo', nombre: 'recibo.pdf', path: 'test/missing.pdf', mime: 'application/pdf', bytes: 1200 }], fileError: true });
  await page.goto(`/admin/${records[0].id}`);
  await expect(page.getByText('No hay un DNI registrado en esta solicitud.')).toBeVisible();
  await page.getByRole('button', { name: 'Descargar recibo.pdf', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo descargar el documento');
});

test('exporta toda la base y una selección en Excel sin límites silenciosos', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/admin?vista=base');
  await expect(page.getByText('63 de 63 solicitudes')).toBeVisible();
  const downloadAll = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await (await downloadAll).path());
  expect(workbook.getWorksheet('Afiliaciones').rowCount).toBe(64);
  expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Afiliaciones', 'Resumen', 'Seccionales', 'Fuerzas', 'Referentes']);
  const headers = workbook.getWorksheet('Afiliaciones').getRow(1).values;
  const cbuColumn = headers.indexOf('CBU');
  expect(workbook.getWorksheet('Afiliaciones').getRow(2).getCell(cbuColumn).value).toBe('1234567890123456789012');
  expect(JSON.stringify(workbook.getWorksheet('Afiliaciones').getSheetValues())).not.toContain('MUST-NOT-BE-EXPORTED');
  await page.getByRole('checkbox', { name: 'Seleccionar esta página' }).check();
  const downloadSelected = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const { readFile } = await import('node:fs/promises');
  const csv = await readFile(await (await downloadSelected).path(), 'utf8');
  expect(csv.split('\r\n')).toHaveLength(26);
  expect(csv).toContain("'=Texto ingresado por una persona");
});

test('ficha conserva el regreso a filtros y prepara un expediente para compartir', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/api/admin', route => route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 test file' }));
  await page.goto('/admin?vista=base&q=perez');
  await page.getByRole('link', { name: 'AF-2026-00001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pérez, Ana', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar PDF para compartir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Descargar PDF preparado' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al listado' }).click();
  await expect(page.getByLabel('Buscar afiliaciones')).toHaveValue('perez');
});

test('móvil sin desbordes de página y reporte imprimible completo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPanel(page);
  await page.goto('/admin');
  await expect(page.getByText('63 de 63 solicitudes')).toBeVisible();
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(element => !element.closest('.np-table-scroll') && element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width })) }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  await page.screenshot({ path: 'test-results/panel-nacional-movil.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'PECIFA Nacional · Informe de afiliaciones' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación del panel' })).toBeHidden();
});

test('asignar seccional conserva la ficha y registra quién hizo el cambio', async ({ page }) => {
  await mockPanel(page);
  await page.goto(`/admin/${records[0].id}`);
  await expect(page.getByRole('heading', { name: 'Pérez, Ana', exact: true })).toBeVisible();
  await page.getByLabel('Seccional asignada', { exact: true }).fill('Buenos Aires');
  const request = page.waitForRequest(request => request.method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const saved = (await request).postDataJSON();
  expect(saved.datos.seccional).toBe('Buenos Aires');
  expect(saved.datos.cbu).toBe('1234567890123456789012');
  expect(saved.historial.at(-1).usuario).toBe('Equipo PECIFA');
  expect(saved.historial.at(-1).nota).toContain('Seccional: Buenos Aires');
  expect((await request).url()).toContain('updated_at=eq.');
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
});

test('no sobrescribe la ficha si otra persona la modificó antes de guardar', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/rest/v1/afiliaciones?**', async route => {
    if (route.request().method() === 'PATCH') return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto(`/admin/${records[0].id}`);
  await page.getByLabel('Seccional asignada', { exact: true }).fill('Buenos Aires');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Otra persona modificó esta ficha');
});

test('errores de carga bloquean exportaciones y la base vacía explica el estado', async ({ page }) => {
  await mockPanel(page, { empty: true });
  await page.goto('/admin?vista=base');
  await expect(page.getByText('La base está lista para recibir afiliaciones')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar Excel', exact: true })).toBeDisabled();
  await page.unroute('https://pecifa-test.supabase.co/**');
  await mockPanel(page, { fail: true });
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar la base');
  await expect(page.getByRole('button', { name: 'Descargar Excel', exact: true })).toBeDisabled();
});

test('recupera una pestaña que intenta cargar un módulo anterior al despliegue', async ({ page }) => {
  await mockPanel(page);
  let interrupted = 0;
  await page.route('**/src/admin/Dashboard.jsx*', async route => {
    if (interrupted++ === 0) return route.abort('failed');
    return route.continue();
  });
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('63 de 63 solicitudes')).toBeVisible({ timeout: 15000 });
  expect(interrupted).toBeGreaterThanOrEqual(2);
});

test('un error del panel muestra recuperación en lugar de una página vacía', async ({ page }) => {
  await mockPanel(page);
  await page.route('**/src/admin/Dashboard.jsx*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export default function Dashboard() { throw new Error("Simulated render failure"); }',
  }));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'No pudimos abrir el panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a cargar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver al ingreso', exact: true })).toBeVisible();
});
