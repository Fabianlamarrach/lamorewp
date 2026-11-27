# L'Amore — sitio de bodas

Sitio estático (HTML + CSS + JS, sin build). Usuarios y datos en Supabase (supabase-js por CDN).

## Páginas
- `index.html` — landing (hero, servicios, cómo funciona, galería, testimonios, CTA)
- `login.html` — inicio de sesión
- `registro.html` — registro (crea siempre una cuenta de **pareja**)
- `panel.html` — panel de la pareja (rol `pareja`)
- `admin/index.html` — panel de administración (rol `superadmin`), con menú lateral: Resumen, Bodas en curso, Nueva boda, Historial y Usuarios
- `legal/` — aviso legal, privacidad, cookies, términos

## Estructura
- `assets/css/styles.css` — estilos globales
- `assets/js/layout.js` — cabecera, menú (responsive) y footer compartidos; se editan en un solo sitio
- `assets/js/session.js` — cliente Supabase, sesión y roles (`window.LAmore.auth`); se carga antes que `layout.js`
- `assets/js/wedding-ui.js` — formulario de boda, presupuesto por partidas y checklist de tareas, compartidos por los dos paneles
- `assets/js/seating-plan.js` — plan de mesas interactivo de cada boda, con el salón visto desde arriba y una bandeja de invitados agrupados por familia (pestaña «Mesas» del admin y sección del panel de pareja)
- `assets/js/auth.js` — formularios de login y registro
- `assets/js/panel.js` / `assets/js/admin.js` — lógica de cada panel
- `assets/img/favicon.svg` — favicon

## Usuarios, roles y datos (Supabase)
Auth y datos en Supabase (proyecto del cliente). El esquema está en `supabase/migrations/` y se aplica con `npm run db:migrate` (o al desplegar).

| Tabla | Qué guarda |
|---|---|
| `profiles` | un perfil por usuario de Auth: nombre, teléfono y **rol** (`superadmin` / `pareja`) |
| `weddings` | la boda: nombres, contacto, fecha y hora, tipo de ceremonia, lugar de ceremonia y banquete, ciudad, invitados, presupuesto total, planner y **estado** (consulta → presupuestada → confirmada → celebrada / cancelada). `owner_id` vacío = creada por el equipo, pendiente de que la pareja se registre |
| `wedding_tasks` | checklist de tareas de cada boda, con fecha límite |
| `wedding_tables` | plan de mesas: mesas (redonda / rectangular, con plazas) y elementos del salón (pista, barra, música, entrada) con su posición en el plano |
| `wedding_guests` | invitados: grupo / familia, lado de la pareja, asistencia, menú especial, notas y mesa + silla asignadas |
| `budget_items` | partidas del presupuesto: categoría, concepto, proveedor, estimado, real, pagado, fecha de pago |
| `wedding_notes` | notas internas del equipo sobre cada boda (la pareja no las ve) |
| `wedding_overview` (vista) | cada boda con sus totales de presupuesto, para el panel admin |

Permisos (RLS en la base de datos, no en el navegador):
- **pareja**: ve y edita solo su perfil, su boda y sus partidas. No puede cambiar su rol ni el estado de su boda.
- **superadmin**: ve y edita todas las bodas y presupuestos, cambia estados, escribe notas internas, cambia roles y elimina cuentas (`set_user_role`, `admin_delete_user`). No puede cambiarse el rol ni borrarse a sí misma.
- Sin sesión: no ve nada.

El registro público siempre crea una cuenta **pareja** (con su boda).

**Bodas creadas por el equipo**: en *Nueva boda* el superadmin da de alta la boda con un correo de contacto (y, si quiere, partidas de presupuesto base y un checklist de 16 tareas con fechas calculadas). Cuando la pareja se registra con ese correo y lo **confirma**, la boda se vincula a su cuenta en lugar de crearse otra vacía. Para nombrar superadmin a alguien, que se registre en el sitio y después:

    npm run db:admin -- correo@ejemplo.com            # superadmin
    npm run db:admin -- correo@ejemplo.com --pareja   # volver a pareja

## Ver en local
Sirve la carpeta (el login necesita `localhost` o https): `python3 -m http.server 8000 --bind 127.0.0.1`.
