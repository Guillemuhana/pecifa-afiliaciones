// Definición única de la ficha de afiliación. La usan el formulario (React),
// la validación del servidor, el PDF, el panel y la exportación CSV.
//
// type: text | email | tel | date | money | digits | select | radio | datalist |
//       familiares | file | selfie | firma | declaracion
// cond: [campo, valor] → el campo solo aplica cuando ese otro campo vale eso.

export const ESTADOS = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  observada: 'Observada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export const ESTADO_CIVIL = ['Soltero/a', 'Casado/a', 'Unión convivencial', 'Divorciado/a', 'Separado/a', 'Viudo/a'];
export const FUERZAS = ['Ejército Argentino', 'Armada Argentina', 'Fuerza Aérea Argentina', 'Estado Mayor Conjunto', 'Ministerio de Defensa', 'IOSFA'];
export const PARENTESCOS = ['Cónyuge', 'Conviviente', 'Hijo/a', 'Padre', 'Madre', 'Otro'];
export const SECCIONALES = [];

const opts = (arr) => Object.fromEntries(arr.map((v) => [v, v]));

export const DECLARACION =
  'Declaro cumplir en un todo los Estatutos de la Institución, adhiriendo al beneficio del servicio de sepelio, y que los datos consignados son verdaderos.';

export const SECCIONES = [
  {
    titulo: 'Condición',
    campos: {
      categoria: { label: 'Personal', type: 'radio', req: true, opts: { personal_civil: 'Personal Civil', docente_civil: 'Docente Civil' }, col: 'half' },
      situacion: { label: 'Situación de revista', type: 'radio', req: true, opts: { permanente: 'Permanente', contratado: 'Contratado' }, col: 'half' },
    },
  },
  {
    titulo: 'Datos personales',
    campos: {
      apellido: { label: 'Apellido', type: 'text', req: true, max: 80, col: 'half', auto: 'family-name', help: 'Para el género femenino, indicar solamente el apellido de soltera.' },
      nombres: { label: 'Nombres', type: 'text', req: true, max: 80, col: 'half', auto: 'given-name' },
      fecha_nacimiento: { label: 'Fecha de nacimiento', type: 'date', req: true, col: 'third', auto: 'bday' },
      nacionalidad: { label: 'Nacionalidad', type: 'text', req: true, max: 40, col: 'third', placeholder: 'Argentina' },
      estado_civil: { label: 'Estado civil', type: 'select', req: true, opts: opts(ESTADO_CIVIL), col: 'third' },
      tipo_documento: { label: 'Tipo de documento', type: 'select', req: true, opts: opts(['DNI', 'LC', 'LE', 'CI', 'Pasaporte']), col: 'third' },
      nro_documento: { label: 'N.º de documento', type: 'digits', req: true, max: 9, col: 'third', placeholder: 'Sin puntos' },
      codigo_postal: { label: 'Código postal', type: 'text', req: true, max: 10, col: 'third', auto: 'postal-code' },
      domicilio: { label: 'Domicilio', type: 'text', req: true, max: 150, col: 'twothird', auto: 'street-address', placeholder: 'Calle, número, piso, depto.' },
      localidad: { label: 'Localidad', type: 'text', req: true, max: 80, col: 'third', auto: 'address-level2' },
      fuerza: { label: 'Fuerza', type: 'datalist', req: true, max: 80, opts: opts(FUERZAS), col: 'third', placeholder: 'Elegí o escribí' },
      email: { label: 'Correo electrónico', type: 'email', req: true, max: 120, col: 'third', auto: 'email', help: 'Te enviamos la constancia a este correo.' },
      tel_area: { label: 'Cód. área', type: 'digits', req: true, max: 5, col: 'sixth', placeholder: '351' },
      tel_numero: { label: 'Teléfono', type: 'digits', req: true, max: 10, col: 'sixth', placeholder: 'Sin 15' },
    },
  },
  {
    titulo: 'Nivel de estudios',
    campos: {
      nivel_estudios: { label: 'Máximo nivel alcanzado', type: 'radio', req: true, opts: { primario: 'Primario', secundario: 'Secundario', terciario: 'Terciario', universitario: 'Universitario' }, col: 'full' },
    },
  },
  {
    titulo: 'Datos laborales',
    campos: {
      fecha_ingreso: { label: 'Fecha de ingreso', type: 'date', req: true, col: 'third' },
      organismo: { label: 'Organismo', type: 'text', req: true, max: 100, col: 'third' },
      legajo: { label: 'M.R. / NOU / OSFA / Legajo', type: 'text', req: false, max: 30, col: 'third' },
      codigo_destino: { label: 'Código destino', type: 'text', req: false, max: 30, col: 'third' },
      funcion: { label: 'Función que desempeña', type: 'text', req: true, max: 100, col: 'third' },
      tel_laboral: { label: 'Teléfono laboral', type: 'tel', req: false, max: 30, col: 'third' },
      cuil: { label: 'N.º de CUIL', type: 'digits', req: true, max: 11, col: 'third', placeholder: '11 dígitos, sin guiones' },
      cbu: { label: 'CBU', type: 'digits', req: true, max: 22, col: 'twothird', placeholder: '22 dígitos' },
      agrupamiento: { label: 'Agrupamiento', type: 'text', req: false, max: 50, col: 'quarter' },
      nivel: { label: 'Nivel', type: 'text', req: false, max: 10, col: 'quarter' },
      grado: { label: 'Grado', type: 'text', req: false, max: 10, col: 'quarter' },
      remuneracion_bruta: { label: 'Remuneración bruta ($)', type: 'money', req: false, col: 'quarter', placeholder: '0,00' },
    },
  },
  {
    titulo: 'Afiliación',
    campos: {
      afiliado_por: { label: 'Afiliado por', type: 'text', req: false, max: 80, col: 'half', help: 'Nombre del delegado/a o compañero/a que te acompaña, si corresponde.' },
      seccional: { label: 'Seccional interviniente', type: 'datalist', req: false, max: 80, opts: opts(SECCIONALES), col: 'half' },
    },
  },
  {
    titulo: 'Grupo familiar',
    campos: {
      tiene_familiares: { label: '¿Querés incluir familiares a cargo? (cónyuge, hijos/as, padres)', type: 'radio', req: true, opts: { no: 'No', si: 'Sí' }, col: 'full' },
      familiares: { label: 'Familiares', type: 'familiares', req: true, max: 8, col: 'full', cond: ['tiene_familiares', 'si'], help: 'Hasta 8 familiares. Cargá uno por fila.' },
      adj_familiares: { label: 'DNI de cada familiar y partida de nacimiento / acta de matrimonio según corresponda', type: 'file', req: true, multiple: true, col: 'full', cond: ['tiene_familiares', 'si'] },
    },
  },
  {
    titulo: 'Documentación',
    nota: 'PDF, JPG o PNG (máx. 8 MB por archivo). Podés sacarle una foto con el celular.',
    campos: {
      adj_recibo: { label: 'Último recibo de haberes', type: 'file', req: true, multiple: true, col: 'full', help: 'Si son varias hojas, subilas todas.' },
      adj_dni: { label: 'DNI frente y dorso', type: 'file', req: true, multiple: true, col: 'full', help: 'Subí las dos caras (dos fotos o un PDF).' },
    },
  },
  {
    titulo: 'Foto de validación de identidad',
    nota: 'Sacate una selfie de frente, con buena luz, sin anteojos de sol ni gorra. Así validamos que sos vos.',
    campos: {
      adj_selfie: { label: 'Selfie', type: 'selfie', req: true, col: 'full' },
    },
  },
  {
    titulo: 'Declaración y firma',
    campos: {
      acepta: { label: DECLARACION, type: 'declaracion', req: true, col: 'full' },
      firma: { label: 'Firma', type: 'firma', req: true, col: 'full', help: 'Firmá con el dedo o con el mouse dentro del recuadro.' },
    },
  },
];

export const CAMPOS = Object.assign({}, ...SECCIONES.map((s) => s.campos));
export const ARCHIVOS = ['file', 'selfie'];
export const esArchivo = (f) => ARCHIVOS.includes(f.type);
export const condOk = (f, datos) => !f.cond || String(datos?.[f.cond[0]] ?? '') === String(f.cond[1]);

export const NOMBRE_ARCHIVO = {
  adj_recibo: 'Recibo de haberes',
  adj_dni: 'DNI',
  adj_familiares: 'Documentación familiar',
  adj_selfie: 'Selfie',
  firma: 'Firma',
};

export const LIMITES = {
  maxBytes: 8 * 1024 * 1024,
  maxPorCampo: 8,
  maxTotal: 24,
  mimes: ['application/pdf', 'image/jpeg', 'image/png'],
};

export function legible(f, v) {
  if (v === undefined || v === null || v === '' || typeof v === 'object') return '';
  v = String(v);
  switch (f?.type) {
    case 'radio':
    case 'select':
      return f.opts?.[v] ?? v;
    case 'date':
      return fechaCorta(v);
    case 'money':
      return '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'declaracion':
      return v ? 'Sí' : 'No';
    default:
      return v;
  }
}

export function fechaCorta(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v || '';
}

export function formatoCuil(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha/hora en Argentina (UTC-3) a partir de un ISO. */
export function partesAR(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export function fechaLarga(iso) {
  const p = partesAR(iso);
  return `${p.d} de ${MESES[p.m]} de ${p.y}`;
}
export function fechaHora(iso, seg = false) {
  const p = partesAR(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(p.d)}/${z(p.m + 1)}/${p.y} ${z(p.h)}:${z(p.mi)}${seg ? ':' + z(p.s) : ''}`;
}
