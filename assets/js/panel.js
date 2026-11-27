/* ==========================================================
   Panel de la pareja (rol "pareja"): datos de su boda y
   presupuesto por partidas. RLS garantiza que solo ve lo suyo.
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var ui = window.LAmore.ui;
  var sb = auth.client;

  function countdownText(str) {
    var days = ui.daysUntil(str);
    if (days == null) return "Aún no habéis fijado la fecha. ¡Añadidla abajo!";
    if (days > 1) return "Faltan " + days + " días para el gran día.";
    if (days === 1) return "¡Es mañana!";
    if (days === 0) return "¡Hoy es el gran día!";
    return "Os casasteis hace " + -days + " días. ¡Enhorabuena!";
  }

  function renderHead(w) {
    document.getElementById("couple-names").textContent = ui.coupleName(w);
    document.getElementById("countdown").textContent = countdownText(w.wedding_date);
    document.getElementById("stat-date").textContent = ui.fmtDate(w.wedding_date, true);
    document.getElementById("stat-venue").textContent = [w.venue, w.city].filter(Boolean).join(", ") || "—";
    document.getElementById("stat-guests").textContent = w.guests_estimated != null ? w.guests_estimated : "—";
    var st = document.getElementById("stat-status");
    st.textContent = "";
    st.appendChild(ui.statusBadge(w.status));
  }

  auth.guard(auth.ROLES.PAREJA).then(function (me) {
    if (!me) return;
    return sb.from("weddings").select("*").eq("owner_id", me.id).maybeSingle().then(function (r) {
      document.querySelector("main").hidden = false;
      if (r.error || !r.data) {
        ui.showMessage(document.getElementById("panel-message"),
          r.error ? auth.friendly(r.error) : "No encontramos vuestra boda. Escríbenos y lo revisamos.", false);
        return;
      }
      var wedding = r.data;
      renderHead(wedding);
      var budget = ui.budget(document.getElementById("budget"), wedding);
      ui.weddingForm(document.getElementById("wedding-form"), wedding, {
        onSaved: function (w) { renderHead(w); budget.setWedding(w); }
      });
    });
  });
})();
