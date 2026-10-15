// Envío de correos: Resend (RESEND_API_KEY) o SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS, p. ej. Gmail con contraseña de aplicación).
import nodemailer from 'nodemailer';

const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'PECIFA Afiliaciones <onboarding@resend.dev>';
export const destinosInternos = () =>
  String(process.env.MAIL_TO || 'guillemuhana@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function correoConfigurado() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

/**
 * @param {{to:string|string[], subject:string, html:string, replyTo?:string, attachments?:{filename:string, content:Uint8Array|Buffer, contentType?:string}[]}} m
 */
export async function enviarCorreo(m) {
  const to = Array.isArray(m.to) ? m.to : [m.to];
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM(),
        to,
        subject: m.subject,
        html: m.html,
        reply_to: m.replyTo || undefined,
        attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
      }),
    });
    if (!r.ok) throw new Error('Resend: ' + (await r.text()).slice(0, 300));
    return true;
  }
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 465);
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await t.sendMail({
      from: FROM(),
      to: to.join(', '),
      subject: m.subject,
      html: m.html,
      replyTo: m.replyTo || undefined,
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    });
    return true;
  }
  throw new Error('Correo no configurado (falta RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS).');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { esc };

export function layout(titulo, cuerpo) {
  return `<!doctype html><html><body style="margin:0;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#1d2a44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#fff;font-size:18px;font-weight:bold;border-bottom:4px solid #c9a227">PE.CI.F.A. · ${esc(titulo)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${cuerpo}</td></tr>
<tr><td style="padding:14px 24px;background:#f7f9fc;color:#6b7690;font-size:12px">Unión del Personal Civil de las Fuerzas Armadas · Av. La Plata 2047 (1250) CABA · www.pecifa.org</td></tr>
</table></td></tr></table></body></html>`;
}

export const boton = (url, txt) =>
  `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#1f6fd1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(txt)}</a></p>`;
