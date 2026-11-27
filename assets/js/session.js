/* ==========================================================
   Sesión y roles: "superadmin" y "pareja".
   DEMO SOLO NAVEGADOR: los usuarios se guardan en localStorage,
   así que los permisos NO son seguros (cualquiera puede tocar su
   navegador). Al conectar un backend (Supabase, API propia...)
   sustituye las funciones de este archivo manteniendo la misma
   interfaz (window.LAmore.auth) y el resto del sitio seguirá igual.
   Debe cargarse antes que layout.js.
   ========================================================== */
(function () {
  var USERS_KEY = "lamore.users";
  var SESSION_KEY = "lamore.session";
  var ROLES = { SUPERADMIN: "superadmin", PAREJA: "pareja" };
  // Cuenta superadmin inicial (solo demo). Cámbiala al conectar un backend.
  var SEED_ADMIN = { email: "admin@lamore.example", password: "Admin1234!", name: "Superadmin" };
  var EDITABLE = ["name", "partner", "weddingDate", "venue", "guests", "budget"];
  var BAD_LOGIN = "Correo o contraseña incorrectos.";
  var root = document.body.getAttribute("data-root") || "./";

  function readJSON(store, key, fallback) {
    try { var v = store.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function loadUsers() { return readJSON(localStorage, USERS_KEY, []); }
  function saveUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function byId(list, id) { return list.filter(function (u) { return u.id === id; })[0]; }
  function byEmail(list, email) { email = normEmail(email); return list.filter(function (u) { return u.email === email; })[0]; }

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function hashPassword(password, salt) {
    if (!window.crypto || !crypto.subtle) throw new Error("Abre el sitio desde localhost o https para poder iniciar sesión.");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + password)).then(toHex);
  }

  function publicUser(u) {
    if (!u) return null;
    var copy = {};
    for (var k in u) if (k !== "salt" && k !== "passwordHash") copy[k] = u[k];
    return copy;
  }

  function createUser(data, role) {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var salt = toHex(bytes.buffer);
    return hashPassword(data.password, salt).then(function (hash) {
      return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        role: role,
        email: normEmail(data.email),
        name: String(data.name || "").trim(),
        partner: String(data.partner || "").trim(),
        weddingDate: data.weddingDate || "",
        venue: "",
        guests: null,
        budget: null,
        createdAt: new Date().toISOString(),
        salt: salt,
        passwordHash: hash
      };
    });
  }

  // Garantiza que siempre exista al menos un superadmin.
  var ready = Promise.resolve().then(function () {
    var hasAdmin = loadUsers().some(function (u) { return u.role === ROLES.SUPERADMIN; });
    if (hasAdmin) return;
    return createUser(SEED_ADMIN, ROLES.SUPERADMIN).then(function (u) {
      var users = loadUsers();
      users.push(u);
      saveUsers(users);
    });
  });

  // ---------- Sesión ----------
  function startSession(u, remember) {
    logout();
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
  }
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  function current() {
    var s = readJSON(sessionStorage, SESSION_KEY, null) || readJSON(localStorage, SESSION_KEY, null);
    if (!s) return null;
    var u = byId(loadUsers(), s.userId);
    if (!u) { logout(); return null; } // la cuenta se eliminó
    return publicUser(u);
  }

  function login(email, password, remember) {
    return ready.then(function () {
      var u = byEmail(loadUsers(), email);
      if (!u) throw new Error(BAD_LOGIN);
      return hashPassword(password, u.salt).then(function (hash) {
        if (hash !== u.passwordHash) throw new Error(BAD_LOGIN);
        startSession(u, remember);
        return publicUser(u);
      });
    });
  }

  // El registro público siempre crea cuentas de pareja.
  function register(data) {
    return ready.then(function () {
      if (byEmail(loadUsers(), data.email)) throw new Error("Ya existe una cuenta con ese correo.");
      return createUser(data, ROLES.PAREJA);
    }).then(function (u) {
      var users = loadUsers();
      users.push(u);
      saveUsers(users);
      startSession(u, false);
      return publicUser(u);
    });
  }

  function homeFor(user) {
    return root + (user && user.role === ROLES.SUPERADMIN ? "admin/index.html" : "panel.html");
  }

  // Protege una página: devuelve el usuario o redirige.
  function guard(role) {
    var me = current();
    if (!me) { location.replace(root + "login.html"); return null; }
    if (me.role !== role) { location.replace(homeFor(me)); return null; }
    return me;
  }

  // ---------- Datos ----------
  function updateUser(id, patch) {
    var me = current();
    if (!me || (me.id !== id && me.role !== ROLES.SUPERADMIN)) throw new Error("No tienes permisos para esta acción.");
    var users = loadUsers();
    var u = byId(users, id);
    if (!u) throw new Error("Usuario no encontrado.");
    EDITABLE.forEach(function (k) { if (k in patch) u[k] = patch[k]; });
    saveUsers(users);
    return publicUser(u);
  }

  function requireAdmin() {
    var me = current();
    if (!me || me.role !== ROLES.SUPERADMIN) throw new Error("No tienes permisos para esta acción.");
    return me;
  }

  function listUsers() {
    requireAdmin();
    return loadUsers().map(publicUser);
  }

  // Un superadmin no puede degradarse ni borrarse a sí mismo,
  // así que siempre queda al menos uno.
  function setRole(id, role) {
    var me = requireAdmin();
    if (role !== ROLES.SUPERADMIN && role !== ROLES.PAREJA) throw new Error("Rol no válido.");
    if (id === me.id) throw new Error("No puedes cambiar tu propio rol.");
    var users = loadUsers();
    var u = byId(users, id);
    if (!u) throw new Error("Usuario no encontrado.");
    u.role = role;
    saveUsers(users);
    return publicUser(u);
  }

  function deleteUser(id) {
    var me = requireAdmin();
    if (id === me.id) throw new Error("No puedes eliminar tu propia cuenta.");
    saveUsers(loadUsers().filter(function (u) { return u.id !== id; }));
  }

  ready.catch(function (err) { console.error("[L'Amore] No se pudo preparar la sesión:", err); });

  window.LAmore = window.LAmore || {};
  window.LAmore.auth = {
    ROLES: ROLES,
    current: current,
    login: login,
    logout: logout,
    register: register,
    homeFor: homeFor,
    guard: guard,
    updateUser: updateUser,
    listUsers: listUsers,
    setRole: setRole,
    deleteUser: deleteUser
  };
})();
