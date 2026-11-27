/* ==========================================================
   Panel de administración (rol "superadmin").
   - Bodas: todas las bodas con su presupuesto; detalle editable
     (datos, estado, notas internas y partidas) en #boda=<id>.
   - Usuarios: cambiar rol y eliminar cuentas (RPC en Supabase).
   Los datos de usuario se pintan con textContent, nunca con innerHTML.
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var ui = window.LAmore.ui;
  var sb = auth.client;
  var ROLES = auth.ROLES;
  var el = ui.el;
  var me = null;

  var weddings = [];
  var users = [];
  var $ = function (id) { return document.getElementById(id); };
  var message = $("admin-message");

  function say(text, ok) { ui.showMessage(message, text, ok); }
  function clearMessage() { message.className = "form__message"; message.textContent = ""; }

  // ---------- Carga ----------
  function loadWeddings() {
    return sb.from("wedding_overview").select("*").eq("owner_role", ROLES.PAREJA).then(function (r) {
      if (r.error) throw r.error;
      weddings = r.data;
    });
  }

  function loadUsers() {
    return sb.from("profiles").select("*").order("created_at", { ascending: false }).then(function (r) {
      if (r.error) throw r.error;
      users = r.data;
    });
  }

  function reload() {
    return Promise.all([loadWeddings(), loadUsers()])
      .then(function () { renderStats(); renderWeddings(); renderUsers(); })
      .catch(function (err) { say(auth.friendly(err), false); });
  }

  // ---------- Estadísticas ----------
  function renderStats() {
    var active = weddings.filter(function (w) { return w.status !== "cancelada"; });
    $("stat-weddings").textContent = active.length;
    $("stat-upcoming").textContent = active.filter(function (w) {
      var d = ui.daysUntil(w.wedding_date);
      return d != null && d >= 0 && d <= 90;
    }).length;
    $("stat-confirmed").textContent = active.filter(function (w) { return w.status === "confirmada"; }).length;
    $("stat-budget").textContent = ui.fmtMoney(active.reduce(function (s, w) { return s + Number(w.budget_total || 0); }, 0), true);
  }

  // ---------- Bodas ----------
  var statusFilter = $("w-status");
  Object.keys(ui.STATUS).forEach(function (k) { statusFilter.appendChild(el("option", { value: k, text: ui.STATUS[k] })); });

  function weddingRow(w) {
    var days = ui.daysUntil(w.wedding_date);
    var when = days == null ? "" : days > 0 ? "en " + days + " días" : days === 0 ? "¡hoy!" : "hace " + -days + " días";
    var over = w.budget_total != null && Number(w.actual_total) > Number(w.budget_total);
    return el("tr", null, [
      el("td", null, [el("strong", { text: ui.coupleName(w) }), el("small", { text: w.email })]),
      el("td", null, [el("span", { text: ui.fmtDate(w.wedding_date) }), when ? el("small", { text: when }) : null]),
      el("td", { text: [w.venue, w.city].filter(Boolean).join(", ") || "—" }),
      el("td", { className: "num", text: w.guests_estimated != null ? w.guests_estimated : "—" }),
      el("td", { className: "num", text: ui.fmtMoney(w.budget_total, true) }),
      el("td", { className: "num" }, [
        el("span", { className: over ? "warn" : null, text: w.item_count ? ui.fmtMoney(w.actual_total, true) : "—" }),
        el("small", { text: w.item_count ? "pagado " + ui.fmtMoney(w.paid_total, true) : "sin partidas" })
      ]),
      el("td", null, [ui.statusBadge(w.status)]),
      el("td", { className: "data-table__actions" }, [
        el("a", { className: "btn btn--sm", href: "#boda=" + w.id, text: "Ver" })
      ])
    ]);
  }

  function renderWeddings() {
    var q = $("w-search").value.trim().toLowerCase();
    var st = statusFilter.value;
    var when = $("w-when").value;
    var rows = weddings.filter(function (w) {
      if (st && w.status !== st) return false;
      var d = ui.daysUntil(w.wedding_date);
      if (when === "upcoming" && d != null && d < 0) return false;
      if (when === "past" && (d == null || d >= 0)) return false;
      if (when === "nodate" && d != null) return false;
      return !q || [ui.coupleName(w), w.email, w.venue, w.city, w.full_name].join(" ").toLowerCase().indexOf(q) !== -1;
    });
    rows.sort(function (a, b) {
      if (when === "upcoming") {
        // Con fecha (más cercana primero) y después las que no tienen fecha.
        if (!a.wedding_date !== !b.wedding_date) return a.wedding_date ? -1 : 1;
        if (a.wedding_date && a.wedding_date !== b.wedding_date) return a.wedding_date < b.wedding_date ? -1 : 1;
      }
      if (when === "past" && a.wedding_date !== b.wedding_date) return a.wedding_date < b.wedding_date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    var body = $("weddings-body");
    body.textContent = "";
    rows.forEach(function (w) { body.appendChild(weddingRow(w)); });
    $("weddings-empty").hidden = rows.length > 0;
  }

  ["w-search", "w-status", "w-when"].forEach(function (id) {
    $(id).addEventListener(id === "w-search" ? "input" : "change", renderWeddings);
  });

  // ---------- Usuarios ----------
  function userRow(u) {
    var isMe = u.id === me.id;
    var select = el("select", { "data-role-for": u.id, "aria-label": "Rol de " + (u.full_name || u.email), disabled: isMe }, [
      el("option", { value: ROLES.PAREJA, text: "Pareja" }),
      el("option", { value: ROLES.SUPERADMIN, text: "Superadmin" })
    ]);
    select.value = u.role;
    return el("tr", null, [
      el("td", null, [el("strong", { text: (u.full_name || "Sin nombre") + (isMe ? " (tú)" : "") }), el("small", { text: u.email })]),
      el("td", { text: ui.fmtDate(u.created_at) }),
      el("td", null, [select]),
      el("td", { className: "data-table__actions" }, [
        el("button", {
          type: "button", className: "btn btn--sm btn--danger", "data-delete": u.id, text: "Eliminar",
          disabled: isMe, title: isMe ? "No puedes eliminar tu propia cuenta" : null
        })
      ])
    ]);
  }

  function renderUsers() {
    var q = $("u-search").value.trim().toLowerCase();
    var role = $("u-role").value;
    var rows = users.filter(function (u) {
      if (role && u.role !== role) return false;
      return !q || ((u.full_name || "") + " " + u.email).toLowerCase().indexOf(q) !== -1;
    });
    var body = $("users-body");
    body.textContent = "";
    rows.forEach(function (u) { body.appendChild(userRow(u)); });
    $("users-empty").hidden = rows.length > 0;
  }

  $("u-search").addEventListener("input", renderUsers);
  $("u-role").addEventListener("change", renderUsers);

  function userById(id) { return users.filter(function (u) { return u.id === id; })[0]; }

  $("users-body").addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-role-for");
    if (!id) return;
    var u = userById(id);
    var role = e.target.value;
    sb.rpc("set_user_role", { target: id, new_role: role }).then(function (r) {
      if (r.error) say(auth.friendly(r.error), false);
      else say((u.full_name || u.email) + " ahora es " + (role === ROLES.SUPERADMIN ? "superadmin" : "pareja") + ".", true);
      reload();
    });
  });

  $("users-body").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete]");
    if (!btn) return;
    var u = userById(btn.getAttribute("data-delete"));
    var name = u && (u.full_name || u.email);
    if (!u || !confirm("¿Eliminar la cuenta de " + name + "? Se borrarán también su boda y su presupuesto. No se puede deshacer.")) return;
    sb.rpc("admin_delete_user", { target: u.id }).then(function (r) {
      if (r.error) say(auth.friendly(r.error), false);
      else say("Cuenta de " + name + " eliminada.", true);
      reload();
    });
  });

  // ---------- Pestañas ----------
  function selectTab(name) {
    ["weddings", "users"].forEach(function (t) {
      $("tab-" + t).setAttribute("aria-selected", String(t === name));
      $("panel-" + t).hidden = t !== name;
    });
  }
  $("tab-weddings").addEventListener("click", function () { selectTab("weddings"); });
  $("tab-users").addEventListener("click", function () { selectTab("users"); });

  // ---------- Detalle de una boda ----------
  var notesForm = $("notes-form");
  var currentId = null;

  function renderDetailHead(w, email) {
    $("d-names").textContent = ui.coupleName(w);
    var days = ui.daysUntil(w.wedding_date);
    var meta = $("d-meta");
    meta.textContent = "";
    meta.appendChild(ui.statusBadge(w.status));
    meta.appendChild(document.createTextNode(
      "  " + email + " · " + ui.fmtDate(w.wedding_date, true) +
      (days != null && days >= 0 ? " (faltan " + days + " días)" : "")
    ));
  }

  function showDetail(id) {
    currentId = id;
    clearMessage();
    $("view-list").hidden = true;
    $("view-detail").hidden = false;
    $("d-names").textContent = "Cargando…";
    $("d-meta").textContent = "";
    $("d-form").textContent = "";
    $("d-budget").textContent = "";
    notesForm.notes.value = "";
    window.scrollTo(0, 0);

    Promise.all([
      sb.from("wedding_overview").select("*").eq("id", id).maybeSingle(),
      sb.from("wedding_notes").select("notes").eq("wedding_id", id).maybeSingle()
    ]).then(function (res) {
      if (currentId !== id) return;
      var w = res[0].data;
      if (res[0].error || !w) {
        $("d-names").textContent = "Boda no encontrada";
        if (res[0].error) say(auth.friendly(res[0].error), false);
        return;
      }
      var email = w.email;
      renderDetailHead(w, email);
      notesForm.notes.value = (res[1].data && res[1].data.notes) || "";
      var budget = ui.budget($("d-budget"), w);
      ui.weddingForm($("d-form"), w, {
        admin: true,
        onSaved: function (nw) { renderDetailHead(nw, email); budget.setWedding(nw); }
      });
    });
  }

  notesForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var box = notesForm.querySelector(".form__message");
    var btn = notesForm.querySelector("button");
    btn.disabled = true;
    sb.from("wedding_notes").upsert({ wedding_id: currentId, notes: notesForm.notes.value }).then(function (r) {
      btn.disabled = false;
      if (r.error) ui.showMessage(box, auth.friendly(r.error), false);
      else ui.showMessage(box, "Notas guardadas.", true);
    });
  });

  $("back-link").addEventListener("click", function (e) {
    e.preventDefault();
    location.hash = "";
  });

  function route() {
    var m = location.hash.match(/^#boda=([0-9a-f-]{36})$/i);
    if (m) return showDetail(m[1]);
    currentId = null;
    $("view-detail").hidden = true;
    $("view-list").hidden = false;
    reload(); // refresca totales por si se editó algo en el detalle
  }

  // ---------- Inicio ----------
  auth.guard(ROLES.SUPERADMIN).then(function (u) {
    if (!u) return;
    me = u;
    $("admin-hello").textContent = "Sesión iniciada como " + me.email + ".";
    document.querySelector("main").hidden = false;
    window.addEventListener("hashchange", route);
    route();
  });
})();
