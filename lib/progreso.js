import { SECCIONES, condOk, esArchivo } from './schema.js';
import { validarTodo } from './validacion.js';

/** Avance de los requisitos visibles, usando las mismas validaciones que el envío. */
export function progresoFicha(input = {}, archivos = {}, firma = '') {
  const { datos, errores } = validarTodo(input);
  const secciones = SECCIONES.map((seccion, index) => {
    const campos = Object.entries(seccion.campos).filter(([, campo]) => campo.req && condOk(campo, datos));
    const pendientes = campos.filter(([key, campo]) => {
      if (campo.type === 'firma') return !firma;
      if (esArchivo(campo)) return campo.type === 'selfie' ? !archivos[key] : !archivos[key]?.length;
      return Boolean(errores[key]);
    }).map(([key]) => key);
    return { titulo: seccion.titulo, id: `seccion-${index}`, total: campos.length, completos: campos.length - pendientes.length, pendientes };
  });
  const total = secciones.reduce((s, x) => s + x.total, 0);
  const completos = secciones.reduce((s, x) => s + x.completos, 0);
  const porcentaje = total ? Math.floor(completos / total * 100) : 0;
  return { secciones, total, completos, porcentaje, siguiente: secciones.find((x) => x.pendientes.length) };
}
