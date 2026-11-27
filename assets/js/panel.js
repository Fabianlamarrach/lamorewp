/* ==========================================================
   Panel de la pareja (rol "pareja").
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var me = auth.guard(auth.ROLES.PAREJA);
  if (!me) return;

  var form = document.getElementById("wedding-form");
  var money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  function parseDate(str) {
    if (!str) return null;
    var p = str.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function countdownText(str) {
    var date = parseDate(str);
    if (!date) return "Aún no habéis fijado la fecha. ¡Añadidla abajo!";
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.round((date - today) / 86400000);
    if (days > 1) return "Faltan " + days + " días para el gran día.";
    if (days === 1) return "¡Es mañana!";
    if (days === 0) return "¡Hoy es el gran día!";
    return "Os casasteis hace " + -days + " días. ¡Enhorabuena!";
  }

  function render(user) {
    var date = parseDate(user.weddingDate);
    document.getElementById("couple-names").textContent = user.name + " & " + user.partner;
    document.getElementById("countdown").textContent = countdownText(user.weddingDate);
    document.getElementById("stat-date").textContent = date
      ? date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
      : "—";
    document.getElementById("stat-venue").textContent = user.venue || "—";
    document.getElementById("stat-guests").textContent = user.guests != null ? user.guests : "—";
    document.getElementById("stat-budget").textContent = user.budget != null ? money.format(user.budget) : "—";
  }

  function fill(user) {
    ["name", "partner", "weddingDate", "venue"].forEach(function (k) { form[k].value = user[k] || ""; });
    form.guests.value = user.guests != null ? user.guests : "";
    form.budget.value = user.budget != null ? user.budget : "";
  }

  function setError(input, msg) {
    var field = input.closest(".field");
    field.classList.toggle("is-invalid", !!msg);
    field.querySelector(".field__error").textContent = msg || "";
    return !msg;
  }

  function showMessage(text, ok) {
    var box = form.querySelector(".form__message");
    box.textContent = text;
    box.className = "form__message is-visible " + (ok ? "form__message--ok" : "form__message--error");
  }

  function wholeNumberOrEmpty(input) {
    var v = input.value.trim();
    return v === "" || /^\d+$/.test(v);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var valid = [
      setError(form.name, form.name.value.trim() ? "" : "Indica tu nombre."),
      setError(form.partner, form.partner.value.trim() ? "" : "Indica el nombre de tu pareja."),
      setError(form.guests, wholeNumberOrEmpty(form.guests) ? "" : "Introduce un número entero."),
      setError(form.budget, wholeNumberOrEmpty(form.budget) ? "" : "Introduce un importe sin decimales.")
    ].every(Boolean);
    if (!valid) return;

    try {
      me = auth.updateUser(me.id, {
        name: form.name.value.trim(),
        partner: form.partner.value.trim(),
        weddingDate: form.weddingDate.value,
        venue: form.venue.value.trim(),
        guests: form.guests.value.trim() === "" ? null : parseInt(form.guests.value, 10),
        budget: form.budget.value.trim() === "" ? null : parseInt(form.budget.value, 10)
      });
      render(me);
      showMessage("Cambios guardados.", true);
    } catch (err) {
      showMessage(err.message, false);
    }
  });

  form.querySelectorAll("input").forEach(function (input) {
    input.addEventListener("input", function () { setError(input, ""); });
  });

  render(me);
  fill(me);
  document.querySelector("main").hidden = false;
})();
