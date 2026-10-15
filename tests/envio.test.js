import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import handler from '../api/enviar.js';
import { firmar } from '../api/_lib/http.js';
import { CAMPOS, esArchivo } from '../lib/schema.js';
import { uuidValido } from '../lib/ids.js';

const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const draft = '11111111-2222-4333-8444-555555555555';
const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afo8AAAAASUVORK5CYII=', 'base64'), Buffer.alloc(450)]);
const doc = await PDFDocument.create(); doc.addPage();
const pdf = await doc.save();
function body() {
  const datos = {};
  for (const [key, campo] of Object.entries(CAMPOS)) {
    if (!campo.req || esArchivo(campo) || campo.type === 'firma' || campo.cond) continue;
    datos[key] = campo.opts ? Object.keys(campo.opts)[0] : campo.type === 'date' ? '2000-01-01' : campo.type === 'declaracion' ? true : 'Prueba';
  }
  Object.assign(datos, { tipo_documento: 'DNI', nro_documento: '12345678', cuil: '20123456786', cbu: '0000000000000000000000', tel_area: '11', tel_numero: '12345678', email: 'test@example.com', tiene_familiares: 'no' });
  const ts = Date.now();
  return { datos, borrador: { draft, ts, sig: firmar(`${draft}.${ts}`) }, firma: `data:image/png;base64,${png.toString('base64')}`,
    archivos: ['adj_recibo', 'adj_dni', 'adj_selfie'].map(campo => ({ campo, path: `borradores/${draft}/${campo}-1.${campo === 'adj_selfie' ? 'png' : 'pdf'}`, nombre: campo })) };
}
async function enviar() {
  const res = { status(n) { this.code = n; return this; }, setHeader() { return this; }, send(s) { this.body = JSON.parse(s); } };
  await handler({ method: 'POST', body: body(), headers: { host: 'test.example' } }, res);
  return res;
}
const originalFetch = globalThis.fetch;
let caso = '', insertado = null, correos = [];
function respuesta(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
function configurar() {
  process.env.SUPABASE_URL = 'https://hnkrtdrogkxdndquofpz.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.FORM_SECRET = 'test-form-secret';
  process.env.RESEND_API_KEY = 'test-resend';
  process.env.PUBLIC_URL = 'https://test.example';
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input), method = init.method || 'GET';
    if (url.hostname === 'api.resend.com') {
      if (caso === 'mail') return respuesta({ message: 'test provider failure' }, 503);
      correos.push(JSON.parse(init.body)); return respuesta({ id: 'test-email' });
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      if (method === 'GET') return new Response(url.pathname.includes('adj_selfie') ? png : pdf);
      if (caso === 'firma' && url.pathname.includes('/firma-')) return respuesta({ message: 'signature upload failed', statusCode: '500' }, 500);
      return respuesta({ Key: 'test', message: 'ok' });
    }
    if (url.pathname === '/rest/v1/afiliaciones') {
      if (method === 'HEAD') return respuesta(null, 200, { 'content-range': '*/0' });
      if (method === 'GET') return respuesta([]);
      if (method === 'POST') {
        insertado = { ...JSON.parse(init.body), id, numero: 1, nro_tramite: 'AF-2026-00001', created_at: '2026-10-15T12:00:00Z' };
        return respuesta(insertado);
      }
      if (method === 'PATCH') {
        if (caso === 'rutas') return respuesta({ message: 'update failed', code: 'XX000' }, 500);
        return respuesta({ ...insertado, ...JSON.parse(init.body) });
      }
    }
    throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
  };
}

test('configuración ausente devuelve un error JSON claro', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await enviar(); assert.equal(res.code, 503); assert.match(res.body.error, /configurado/);
});
test('registra UUID con firma y documentos y envía los dos correos con PDF', async () => {
  configurar(); caso = ''; correos = []; insertado = null;
  const res = await enviar();
  assert.equal(res.code, 200); assert.ok(uuidValido(res.body.id)); assert.equal(res.body.nro, 'AF-2026-00001');
  assert.equal(insertado.archivos.length, 4); assert.ok(insertado.archivos.some(a => a.campo === 'firma'));
  assert.equal(res.body.correoAfiliado, true); assert.equal(correos.length, 2);
  assert.deepEqual(correos[0].to, ['guillemuhana@gmail.com']);
  assert.deepEqual(correos[1].to, ['test@example.com']);
  assert.equal(Buffer.from(correos[1].attachments[0].content, 'base64').subarray(0, 4).toString(), '%PDF');
});
test('si falla la firma no crea la afiliación', async () => {
  configurar(); caso = 'firma'; insertado = null;
  const res = await enviar(); assert.equal(res.code, 500); assert.equal(insertado, null);
});
test('si falla actualizar rutas conserva los originales registrados', async () => {
  configurar(); caso = 'rutas'; insertado = null;
  const res = await enviar(); assert.equal(res.code, 200); assert.equal(res.body.nro, 'AF-2026-00001');
  assert.ok(insertado.archivos.every(a => a.path.startsWith(`borradores/${draft}/`)));
});
test('fallar el correo no pierde el registro ni informa que el correo salió', async () => {
  configurar(); caso = 'mail';
  const res = await enviar(); assert.equal(res.code, 200); assert.equal(res.body.correo, false); assert.equal(res.body.correoAfiliado, false);
  globalThis.fetch = originalFetch;
});
