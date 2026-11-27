# L'Amore — sitio de bodas

Sitio estático (HTML + CSS + JS, sin dependencias ni build).

## Páginas
- `index.html` — landing (hero, servicios, cómo funciona, galería, testimonios, CTA)
- `login.html` — inicio de sesión
- `registro.html` — registro (crea siempre una cuenta de **pareja**)
- `panel.html` — panel de la pareja (rol `pareja`)
- `admin/index.html` — panel de administración (rol `superadmin`)
- `legal/` — aviso legal, privacidad, cookies, términos

## Estructura
- `assets/css/styles.css` — estilos globales
- `assets/js/layout.js` — cabecera, menú (responsive) y footer compartidos; se editan en un solo sitio
- `assets/js/session.js` — sesión y roles (`window.LAmore.auth`); se carga antes que `layout.js`
- `assets/js/auth.js` — formularios de login y registro
- `assets/js/panel.js` / `assets/js/admin.js` — lógica de cada panel
- `assets/img/favicon.svg` — favicon

## Roles (demo)
- **superadmin**: ve estadísticas y todos los usuarios, cambia roles y elimina cuentas. No puede cambiar su propio rol ni borrarse, así que siempre queda al menos uno.
- **pareja**: edita los datos de su boda (fecha, lugar, invitados, presupuesto).

Cuenta superadmin inicial: `admin@lamore.example` / `Admin1234!`.

⚠️ Sin backend: los usuarios se guardan en el `localStorage` del navegador (contraseñas con hash SHA-256 + sal), así que **los roles no son seguros** y cada navegador tiene sus propios usuarios. Para producción, reimplementa `session.js` contra un backend (p. ej. Supabase con políticas RLS por rol) manteniendo la misma interfaz.

## Ver en local
Sirve la carpeta (el login necesita `localhost` o https): `python3 -m http.server 8000 --bind 127.0.0.1`.
