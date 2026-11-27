/* ==========================================================
   Formularios de login, registro y recuperación de contraseña.
   La autenticación y los roles viven en session.js
   (window.LAmore.auth); aquí solo se valida y se redirige.
   ========================================================== */
(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var auth = window.LAmore.auth;
  var login = document.getElementById("login-form");
  var register = document.getElementById("register-form");
  var recovering = /type=recovery/.test(location.hash);

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

  // Si ya hay sesión, login y registro llevan directamente al panel
  // (también al volver del enlace de confirmación del correo).
  if ((login || register) && !recovering) {
    auth.me().then(function (me) { if (me) location.replace(auth.homeFor(me)); }, function () {});
  }

  // ---------- Login ----------
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
        .then(function (user) {
          if (!user) throw new Error("Tu cuenta no tiene perfil. Escríbenos y lo revisamos.");
          location.href = auth.homeFor(user);
        })
        .catch(function (err) {
          showMessage(login, err.message, false);
          setBusy(login, false);
        });
    });

    // ¿Olvidaste tu contraseña? -> envía el enlace al correo escrito arriba.
    var forgot = document.querySelector("[data-forgot]");
    if (forgot) {
      forgot.addEventListener("click", function (e) {
        e.preventDefault();
        if (!setError(login.email, EMAIL_RE.test(login.email.value.trim()) ? "" : "Escribe aquí tu correo y vuelve a pulsar «¿Olvidaste tu contraseña?».")) {
          login.email.focus();
          return;
        }
        auth.resetPassword(login.email.value)
          .then(function () { showMessage(login, "Si existe una cuenta con ese correo, te hemos enviado un enlace para crear una contraseña nueva.", true); })
          .catch(function (err) { showMessage(login, err.message, false); });
      });
    }

    // Vuelta desde el enlace de recuperación: pedir la contraseña nueva.
    if (recovering) {
      var box = login.parentNode;
      box.querySelector("h1").textContent = "Nueva contraseña";
      box.querySelector("h1 + p").textContent = "Elige una contraseña nueva para tu cuenta.";
      login.hidden = true;
      var reset = document.createElement("form");
      reset.className = "form";
      reset.noValidate = true;
      reset.innerHTML =
        '<div class="form__message" role="status"></div>' +
        '<div class="field"><label for="new-password">Contraseña nueva</label>' +
        '<input type="password" id="new-password" name="password" autocomplete="new-password" minlength="8" required>' +
        '<span class="field__error"></span></div>' +
        '<button class="btn btn--block" type="submit">Guardar contraseña</button>';
      login.parentNode.insertBefore(reset, login);
      reset.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!setError(reset.password, reset.password.value.length >= 8 ? "" : "Mínimo 8 caracteres.")) return;
        setBusy(reset, true);
        auth.client.auth.updateUser({ password: reset.password.value })
          .then(function (r) {
            if (r.error) throw new Error(auth.friendly(r.error));
            return auth.me();
          })
          .then(function (me) { location.href = auth.homeFor(me); })
          .catch(function (err) {
            showMessage(reset, err.message, false);
            setBusy(reset, false);
          });
      });
    }
  }

  // ---------- Registro (siempre crea una cuenta de pareja) ----------
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
        .then(function (res) {
          if (res.needsConfirmation) {
            register.reset();
            showMessage(register, "¡Cuenta creada! Te hemos enviado un correo: pulsa el enlace para confirmarla y luego inicia sesión.", true);
            setBusy(register, false);
            return;
          }
          location.href = auth.homeFor(res.user);
        })
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
