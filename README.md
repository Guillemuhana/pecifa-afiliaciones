# PECIFA · Afiliaciones online

App para la **Ficha de Afiliación** de PE.CI.F.A. El afiliado completa la ficha desde el celular o la compu, adjunta la documentación, se saca una selfie de validación y **firma en pantalla**. Cada afiliación queda registrada y llega por correo a `guillemuhana@gmail.com` con el **expediente en PDF** (ficha firmada + anexo + toda la documentación).

**Stack:** React + Vite · Vercel Functions (Node) · Supabase (Postgres + Storage privado + Auth) · pdf-lib · Gmail SMTP o Resend.

## Qué hace

**Formulario (`/`)**
- Todos los campos de la ficha en papel, con validación en vivo: CUIL y CBU con dígito verificador, CUIL que coincida con el DNI, fechas y teléfonos.
- Grupo familiar opcional (hasta 8): apellido y nombre, parentesco, DNI y fecha de nacimiento, más su documentación.
- Adjuntos: recibo de haberes, DNI frente y dorso, documentación familiar. Acepta PDF o fotos. Las fotos se achican y se pasan a JPG en el celular antes de subirlas.
- Selfie con la cámara (con guía ovalada) o subiendo una foto.
- Firma manuscrita en pantalla. Queda registrada con fecha, hora e IP.
- Al enviar: número de trámite `AF-2026-00001`, botón para descargar la ficha y correo al afiliado con la ficha en PDF.

**PDF**
- Hoja 1: ficha con el formato original, casillas marcadas, firma y aclaración.
- Hoja 2: anexo con la selfie, el grupo familiar, la documentación presentada y la constancia de firma.
- Expediente (el que llega por mail y se descarga en el panel): ficha y anexo, más cada documento como páginas del mismo PDF.

**Panel (`/admin`)** (con usuario y contraseña; solo los correos de la tabla `staff`)
- Listado: buscador, filtros por estado y fechas, contadores por estado y exportación a Excel (CSV).
- Detalle de cada solicitud: selfie, firma, datos, documentos (ver y descargar), estado, N.º de afiliado, notas internas, historial y aviso por mail al afiliado.
- Acciones: descargar el expediente PDF, la ficha para imprimir o reenviar el correo.

**Seguridad**
- Los archivos van a un bucket **privado** (8 MB máx., solo PDF/JPG/PNG) con URLs firmadas. Se valida el tipo real de cada archivo.
- La base tiene RLS: el público no puede leer nada, y el panel solo funciona para cuentas en `staff`.
- Protección anti-bots (honeypot y sesión de carga firmada), límite de 6 envíos cada 15 minutos por IP, y no permite dos afiliaciones vigentes con el mismo DNI.

## Puesta en marcha

### 1. Supabase
1. Creá el proyecto (región **São Paulo**).
2. **SQL Editor:** pegá y ejecutá todo `supabase/schema.sql`. Crea las tablas, RLS y el bucket, y habilita `guillemuhana@gmail.com` en el panel.
3. **Authentication → Users → Add user:** creá tu usuario (`guillemuhana@gmail.com` y una contraseña) y marcá *Auto Confirm*.
4. **Authentication → URL Configuration:** en *Site URL* poné la URL de Vercel (para «Olvidé mi contraseña»).
5. **Project Settings → API:** copiá la *Project URL*, la *anon/publishable key* y la *service_role key* (esta última es secreta).

### 2. Correo (Gmail)
1. En la cuenta de Google `guillemuhana@gmail.com` activá la verificación en 2 pasos.
2. Entrá a <https://myaccount.google.com/apppasswords> y creá una contraseña de aplicación «PECIFA».
3. Esa clave de 16 letras va en `SMTP_PASS`.

Alternativa: Resend (`RESEND_API_KEY`, con un dominio verificado para `MAIL_FROM`).

### 3. Vercel
1. Subí esta carpeta a GitHub e importala en Vercel (Framework: **Vite**), o desde VS Code: `npx vercel`.
2. En **Settings → Environment Variables** cargá las de `.env.example`:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**secreta**) |
| `FORM_SECRET` | cualquier frase larga al azar |
| `MAIL_TO` | `guillemuhana@gmail.com` (podés sumar más, separados por coma) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `smtp.gmail.com` / `465` / tu Gmail / la contraseña de aplicación |
| `MAIL_FROM` | `PECIFA Afiliaciones <guillemuhana@gmail.com>` |
| `LUGAR_FICHA` | opcional: lugar fijo para el encabezado de la ficha |

3. Redeploy.

### 4. En WordPress
Agregá un botón con el link a la app (lo más simple, y la cámara funciona siempre):

```html
<a href="https://TU-APP.vercel.app" target="_blank" rel="noopener" class="elementor-button">Afiliate online</a>
```

O embebida en una página (widget HTML de Elementor). El `allow="camera"` es necesario para la selfie:

```html
<iframe src="https://TU-APP.vercel.app/?embed=1" style="width:100%;min-height:2600px;border:0" allow="camera" title="Ficha de afiliación PECIFA"></iframe>
```

## Desarrollo local
```bash
npm install
cp .env.example .env.local   # completar
npx vercel dev                 # front + /api en http://localhost:3000
```

## Estructura
```
lib/schema.js        campos de la ficha (una sola definición para todo)
lib/validacion.js    validaciones compartidas navegador/servidor (CUIL, CBU, etc.)
api/subir.js         URLs firmadas para subir adjuntos al storage
api/enviar.js        registra la afiliación, mueve adjuntos, PDF y correos
api/ficha.js         PDF de la ficha para el afiliado (link personal)
api/admin.js         expediente, ficha, reenviar y notificar (panel)
api/_lib/pdf.js      generación del PDF
src/Formulario.jsx   formulario público
src/admin/Admin.jsx  panel
supabase/schema.sql  base de datos, RLS y bucket
```
Para agregar o cambiar un campo, se edita `lib/schema.js`. El PDF se arma en `api/_lib/pdf.js`.
