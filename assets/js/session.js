/* ==========================================================
   Sesión y roles con Supabase Auth: "superadmin" y "pareja".
   Los permisos reales los aplica la base de datos (RLS, ver
   supabase/migrations); aquí solo se decide qué pantalla mostrar.
   Necesita cargar antes supabase-js (CDN) y debe ir antes que layout.js.
   ========================================================== */
(function () {
  var SUPABASE_URL = "https://ltnhxtomueleruuuqyjh.supabase.co";
  // Clave publicable: está pensada para ir en el navegador (la seguridad la da RLS).
  var SUPABASE_KEY = "sb_publishable_1m4S9jup1LvVQUGAtW8T3w_JD_PMfnm";

  var ROLES = { SUPERADMIN: "superadmin", PAREJA: "pareja" };
  var REMEMBER_KEY = "lamore.remember";
  var CACHE_KEY = "lamore.me"; // copia del perfil para pintar la cabecera sin esperar a la red
  var root = document.body.getAttribute("data-root") || "./";

  // "Recordarme": la sesión va a localStorage; si no, a sessionStorage (se borra al cerrar el navegador).
  var storage = {
    getItem: function (k) { return sessionStorage.getItem(k) || localStorage.getItem(k); },
    setItem: function (k, v) {
      var persistent = localStorage.getItem(REMEMBER_KEY) !== "0";
      (persistent ? localStorage : sessionStorage).setItem(k, v);
      (persistent ? sessionStorage : localStorage).removeItem(k);
    },
    removeItem: function (k) { sessionStorage.removeItem(k); localStorage.removeItem(k); }
  };

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storage: storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var mePromise = null;

  function cache(profile) {
    if (profile) sessionStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    else sessionStorage.removeItem(CACHE_KEY);
    return profile;
  }

  function cached() {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }

  function friendly(error) {
    var msg = (error && error.message) || String(error);
    if (/Invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
    if (/Email not confirmed/i.test(msg)) return "Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).";
    if (/already registered|already exists/i.test(msg)) return "Ya existe una cuenta con ese correo.";
    if (/Password should be/i.test(msg)) return "La contraseña no es lo bastante segura (mínimo 8 caracteres).";
    if (/rate limit/i.test(msg)) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    if (/Failed to fetch|NetworkError/i.test(msg)) return "No hay conexión con el servidor. Inténtalo de nuevo.";
    return msg;
  }

  function fail(error) { throw new Error(friendly(error)); }

  // Perfil del usuario con sesión (o null). Se cachea hasta login/logout.
  function me() {
    if (!mePromise) {
      mePromise = sb.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return cache(null);
        return sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(function (r) {
          if (r.error) fail(r.error);
          return cache(r.data);
        });
      });
      mePromise.catch(function () { mePromise = null; });
    }
    return mePromise;
  }

  sb.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT") { mePromise = null; cache(null); }
    if (event === "SIGNED_IN" || event === "USER_UPDATED") mePromise = null;
  });

  function login(email, password, remember) {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    return sb.auth.signInWithPassword({ email: String(email).trim(), password: password }).then(function (r) {
      if (r.error) fail(r.error);
      mePromise = null;
      return me();
    });
  }

  // El registro público siempre crea cuentas de pareja (lo garantiza la base de datos).
  // Devuelve { user, needsConfirmation }.
  function register(data) {
    localStorage.setItem(REMEMBER_KEY, "0");
    return sb.auth.signUp({
      email: String(data.email).trim(),
      password: data.password,
      options: {
        data: { name: data.name.trim(), partner: data.partner.trim(), weddingDate: data.weddingDate || "" },
        emailRedirectTo: new URL(root + "login.html", location.href).href
      }
    }).then(function (r) {
      if (r.error) fail(r.error);
      // Con confirmación de correo activa no hay sesión hasta que pulsen el enlace.
      if (!r.data.session) {
        // Supabase devuelve un usuario sin identidades si el correo ya existía.
        if (r.data.user && r.data.user.identities && !r.data.user.identities.length) {
          throw new Error("Ya existe una cuenta con ese correo.");
        }
        return { user: null, needsConfirmation: true };
      }
      mePromise = null;
      return me().then(function (u) { return { user: u, needsConfirmation: false }; });
    });
  }

  function logout() {
    cache(null);
    mePromise = null;
    return sb.auth.signOut().catch(function () {});
  }

  function resetPassword(email) {
    return sb.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo: new URL(root + "login.html", location.href).href
    }).then(function (r) { if (r.error) fail(r.error); });
  }

  function homeFor(user) {
    return root + (user && user.role === ROLES.SUPERADMIN ? "admin/index.html" : "panel.html");
  }

  // Protege una página: resuelve con el usuario o redirige (y resuelve con null).
  function guard(role) {
    return me().then(function (u) {
      if (!u) { location.replace(root + "login.html"); return null; }
      if (u.role !== role) { location.replace(homeFor(u)); return null; }
      return u;
    }, function () {
      location.replace(root + "login.html");
      return null;
    });
  }

  window.LAmore = window.LAmore || {};
  window.LAmore.auth = {
    ROLES: ROLES,
    client: sb,
    friendly: friendly,
    me: me,
    cached: cached,
    login: login,
    logout: logout,
    register: register,
    resetPassword: resetPassword,
    homeFor: homeFor,
    guard: guard
  };
})();
