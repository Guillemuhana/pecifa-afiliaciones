import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'afiliaciones';

let _c = null;
/** Cliente con service role (solo servidor). */
export function admin() {
  if (_c) return _c;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  _c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _c;
}

/** Descarga los archivos de una afiliación agrupados por campo. */
export async function cargarArchivos(row, campos = null) {
  const out = {};
  for (const a of row.archivos || []) {
    if (campos && !campos.includes(a.campo)) continue;
    const { data, error } = await admin().storage.from(BUCKET).download(a.path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    (out[a.campo] ||= []).push({ ...a, bytes });
  }
  return out;
}

/** Usuario del panel a partir del token Bearer (debe estar en la tabla staff). */
export async function staffDesdeReq(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const { data: s } = await admin().from('staff').select('email,nombre').ilike('email', data.user.email).maybeSingle();
  return s ? { email: data.user.email, nombre: s.nombre || data.user.email } : null;
}

export function lugarFicha() {
  return process.env.LUGAR_FICHA || '';
}
