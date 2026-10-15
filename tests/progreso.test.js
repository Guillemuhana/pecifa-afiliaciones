import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, esArchivo } from '../lib/schema.js';
import { progresoFicha } from '../lib/progreso.js';

function fichaCompleta() {
  const datos = {};
  for (const [key, campo] of Object.entries(CAMPOS)) {
    if (!campo.req || esArchivo(campo) || campo.type === 'firma' || campo.cond) continue;
    datos[key] = campo.opts ? Object.keys(campo.opts)[0] : campo.type === 'date' ? '2000-01-01' : campo.type === 'declaracion' ? true : 'Prueba';
  }
  Object.assign(datos, { tipo_documento: 'DNI', nro_documento: '12345678', cuil: '20123456786', cbu: '0000000000000000000000', tel_area: '11', tel_numero: '12345678', email: 'prueba@example.com', tiene_familiares: 'no' });
  return datos;
}
const archivos = { adj_recibo: [{}], adj_dni: [{}], adj_selfie: {} };

test('la ficha vacía comienza en cero y los campos opcionales no suman', () => {
  assert.equal(progresoFicha().porcentaje, 0);
  assert.equal(progresoFicha({ afiliado_por: 'Delegado' }).completos, 0);
  assert.equal(progresoFicha().siguiente.id, 'seccion-0');
});

test('solo llega a 100 con datos válidos, adjuntos y firma', () => {
  const datos = fichaCompleta();
  assert.equal(progresoFicha(datos, archivos, 'firma').porcentaje, 100);
  assert.equal(progresoFicha(datos, archivos, 'firma').siguiente, undefined);
  assert.ok(progresoFicha(datos, archivos).porcentaje < 100);
  assert.ok(progresoFicha(datos, {}, 'firma').porcentaje < 100);
  assert.ok(progresoFicha({ ...datos, email: 'incorrecto' }, archivos, 'firma').porcentaje < 100);
  assert.ok(progresoFicha({ ...datos, nro_documento: '87654321' }, archivos, 'firma').porcentaje < 100);
});

test('los familiares cambian los requisitos y quitar archivos reduce el avance', () => {
  const datos = fichaCompleta();
  const inicial = progresoFicha(datos, archivos, 'firma');
  const conFamilia = { ...datos, tiene_familiares: 'si' };
  assert.equal(progresoFicha(conFamilia, archivos, 'firma').total, inicial.total + 2);
  assert.ok(progresoFicha(conFamilia, archivos, 'firma').porcentaje < 100);
  conFamilia.familiares = [{ nombre: 'Familiar', parentesco: 'Hijo/a', dni: '12345678', nacimiento: '2020-01-01' }];
  const completos = { ...archivos, adj_familiares: [{}] };
  assert.equal(progresoFicha(conFamilia, completos, 'firma').porcentaje, 100);
  assert.ok(progresoFicha(conFamilia, { ...completos, adj_selfie: null }, 'firma').porcentaje < 100);
  assert.equal(progresoFicha({ ...conFamilia, tiene_familiares: 'no' }, archivos, 'firma').porcentaje, 100);
});
