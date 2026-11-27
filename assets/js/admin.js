/* ==========================================================
   Panel de administración (rol "superadmin").
   Los datos de usuario se pintan con textContent, nunca con
   innerHTML, porque los escriben las propias parejas.
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var ROLES = auth.ROLES;
  var me = auth.guard(ROLES.SUPERADMIN);
  if (!me) return;

  var body = document.getElementById("users-body");
  var empty = document.getElementById("users-empty");
  var search = document.getElementById("search");
  var roleFilter = document.getElementById("role-filter");
  var message = document.getElementById("admin-message");
  var DAY = 86400000;

  function el(tag, props, children) {
    var node = document.createElement(tag);
    for (var k in props || {}) {
      if (k === "text") node.textContent = props[k];
      else if (k === "className") node.className = props[k];
      else node.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function parseDate(str) {
    if (!str) return null;
    var p = str.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function fmt(date) {
    return date ? date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
  }

  function displayName(u) {
    return u.partner ? u.name + " & " + u.partner : u.name || u.email;
  }

  function showMessage(text, ok) {
    message.textContent = text;
    message.className = "form__message is-visible " + (ok ? "form__message--ok" : "form__message--error");
  }

  function renderStats(users) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var couples = users.filter(function (u) { return u.role === ROLES.PAREJA; });
    document.getElementById("stat-couples").textContent = couples.length;
    document.getElementById("stat-upcoming").textContent = couples.filter(function (u) {
      var d = parseDate(u.weddingDate);
      return d && d >= today && d - today <= 90 * DAY;
    }).length;
    document.getElementById("stat-new").textContent = couples.filter(function (u) {
      return Date.now() - new Date(u.createdAt) <= 30 * DAY;
    }).length;
    document.getElementById("stat-admins").textContent = users.length - couples.length;
  }

  function row(u) {
    var isMe = u.id === me.id;

    var select = el("select", { "data-role-for": u.id, "aria-label": "Rol de " + displayName(u) }, [
      el("option", { value: ROLES.PAREJA, text: "Pareja" }),
      el("option", { value: ROLES.SUPERADMIN, text: "Superadmin" })
    ]);
    select.value = u.role;
    select.disabled = isMe;

    var del = el("button", { type: "button", className: "btn btn--sm btn--danger", "data-delete": u.id, text: "Eliminar" });
    del.disabled = isMe;
    if (isMe) del.title = "No puedes eliminar tu propia cuenta";

    return el("tr", null, [
      el("td", null, [
        el("strong", { text: displayName(u) + (isMe ? " (tú)" : "") }),
        el("small", { text: u.email })
      ]),
      el("td", { text: u.role === ROLES.PAREJA ? fmt(parseDate(u.weddingDate)) : "—" }),
      el("td", { text: fmt(new Date(u.createdAt)) }),
      el("td", null, [select]),
      el("td", { className: "data-table__actions" }, [del])
    ]);
  }

  function render() {
    var users = auth.listUsers();
    renderStats(users);

    var q = search.value.trim().toLowerCase();
    var role = roleFilter.value;
    var rows = users
      .filter(function (u) {
        if (role && u.role !== role) return false;
        return !q || (displayName(u) + " " + u.email).toLowerCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });

    body.textContent = "";
    rows.forEach(function (u) { body.appendChild(row(u)); });
    empty.hidden = rows.length > 0;
  }

  function byIdFromList(id) {
    return auth.listUsers().filter(function (u) { return u.id === id; })[0];
  }

  body.addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-role-for");
    if (!id) return;
    try {
      var u = auth.setRole(id, e.target.value);
      showMessage(displayName(u) + " ahora es " + (u.role === ROLES.SUPERADMIN ? "superadmin" : "pareja") + ".", true);
    } catch (err) {
      showMessage(err.message, false);
    }
    render();
  });

  body.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-delete]");
    if (!btn) return;
    var u = byIdFromList(btn.getAttribute("data-delete"));
    if (!u || !confirm("¿Eliminar la cuenta de " + displayName(u) + "? No se puede deshacer.")) return;
    try {
      auth.deleteUser(u.id);
      showMessage("Cuenta de " + displayName(u) + " eliminada.", true);
    } catch (err) {
      showMessage(err.message, false);
    }
    render();
  });

  search.addEventListener("input", render);
  roleFilter.addEventListener("change", render);

  document.getElementById("admin-hello").textContent = "Sesión iniciada como " + me.email + ".";
  render();
  document.querySelector("main").hidden = false;
})();
