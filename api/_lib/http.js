import crypto from 'node:crypto';

export function ip(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (f || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').slice(0, 45);
}

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(body));
}

export function pdf(res, bytes, nombre, descargar = true) {
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', bytes.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`);
  res.send(Buffer.from(bytes));
}

const secreto = () => process.env.FORM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';

/** Firma HMAC corta (borradores y tiempos del formulario). */
export function firmar(valor) {
  return crypto.createHmac('sha256', secreto()).update(String(valor)).digest('base64url').slice(0, 32);
}
export function firmaOk(valor, sig) {
  const a = Buffer.from(firmar(valor));
  const b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function soloMetodo(req, res, m) {
  if (req.method !== m) {
    res.setHeader('Allow', m);
    json(res, 405, { error: 'Método no permitido' });
    return false;
  }
  return true;
}

/** Detecta el tipo real por los primeros bytes. */
export function sniff(b) {
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return '';
}
