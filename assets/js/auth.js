/* ==========================================================
   Formularios de login y registro.
   La autenticación y los roles viven en session.js
   (window.LAmore.auth); aquí solo se valida y se redirige.
   ========================================================== */
(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var auth = window.LAmore.auth;

  // Si ya hay sesión, login y registro llevan directamente al panel.
  var me = auth.current();
  if (me && (document.getElementById("login-form") || document.getElementById("register-form"))) {
    location.replace(auth.homeFor(me));
    return;
  }

  function setError(input, msg) {
    var field = input.closest(".field");
    var out = field && field.querySelector(".field__error");
    if (field) field.classList.toggle("is-invalid", !!msg);
    if (out) out.textContent = msg || "";
    return !msg;
  }

  function showMessage(form, text, ok) {
    var box = form.querySelector(".form__message");
    if (!box) return;
    box.textContent = text;
    box.className = "form__message is-visible " + (ok ? "form__message--ok" : "form__message--error");
  }

  function setBusy(form, busy) {
    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = busy;
  }

  // ---------- Login ----------
  var login = document.getElementById("login-form");
  if (login) {
    login.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = login.email, pass = login.password;
      var valid = [
        setError(email, EMAIL_RE.test(email.value.trim()) ? "" : "Introduce un correo válido."),
        setError(pass, pass.value ? "" : "Introduce tu contraseña.")
      ].every(Boolean);
      if (!valid) return;

      setBusy(login, true);
      auth.login(email.value, pass.value, login.remember.checked)
        .then(function (user) { location.href = auth.homeFor(user); })
        .catch(function (err) {
          showMessage(login, err.message, false);
          setBusy(login, false);
        });
    });
  }

  // ---------- Registro (siempre crea una cuenta de pareja) ----------
  var register = document.getElementById("register-form");
  if (register) {
    register.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = register;
      var valid = [
        setError(f.name, f.name.value.trim() ? "" : "Indica tu nombre."),
        setError(f.partner, f.partner.value.trim() ? "" : "Indica el nombre de tu pareja."),
        setError(f.email, EMAIL_RE.test(f.email.value.trim()) ? "" : "Introduce un correo válido."),
        setError(f.password, f.password.value.length >= 8 ? "" : "Mínimo 8 caracteres."),
        setError(f.confirm, f.confirm.value === f.password.value && f.confirm.value ? "" : "Las contraseñas no coinciden."),
        setError(f.terms, f.terms.checked ? "" : "Debes aceptar los términos y la política de privacidad.")
      ].every(Boolean);
      if (!valid) return;

      setBusy(register, true);
      auth.register({
        name: f.name.value,
        partner: f.partner.value,
        email: f.email.value,
        weddingDate: f.date.value,
        password: f.password.value
      })
        .then(function (user) { location.href = auth.homeFor(user); })
        .catch(function (err) {
          showMessage(register, err.message, false);
          setBusy(register, false);
        });
    });
  }

  // Limpia el error al escribir
  document.querySelectorAll(".form input").forEach(function (input) {
    input.addEventListener("input", function () { setError(input, ""); });
    input.addEventListener("change", function () { setError(input, ""); });
  });
})();
