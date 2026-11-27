/* ==========================================================
   Panel de administración (rol "superadmin"), con menú lateral.
   Vistas (por hash):
     #resumen      cifras, próximas bodas, tareas atrasadas
     #en-curso     bodas en consulta / presupuestada / confirmada
     #nueva        alta de una boda (con o sin cuenta de pareja)
     #historial    bodas celebradas y canceladas
     #usuarios     roles y cuentas
     #boda=<id>    detalle: datos, notas internas, tareas y presupuesto
   Los datos de usuario se pintan con textContent, nunca con innerHTML.
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var ui = window.LAmore.ui;
  var sb = auth.client;
  var ROLES = auth.ROLES;
  var el = ui.el;
  var me = null;

  var ACTIVE = ["consulta", "presupuestada", "confirmada"];
  var VIEWS = ["resumen", "en-curso", "nueva", "historial", "usuarios", "boda"];

  var weddings = [];
  var users = [];
  var overdue = [];
  var $ = function (id) { return document.getElementById(id); };
  var message = $("admin-message");
  var flash = null; // mensaje a mostrar tras el siguiente cambio de vista

  function say(text, ok) { ui.showMessage(message, text, ok); }
  function clearMessage() { message.className = "form__message"; message.textContent = ""; }
  function isActive(w) { return ACTIVE.indexOf(w.status) !== -1; }
  function planners() {
    return users.filter(function (u) { return u.role === ROLES.SUPERADMIN; })
      .map(function (u) { return { id: u.id, name: u.full_name || u.email }; });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function whenText(dateStr) {
    var days = ui.daysUntil(dateStr);
    return days == null ? "" : days > 1 ? "en " + days + " días" : days === 1 ? "mañana" : days === 0 ? "¡hoy!" : "hace " + -days + " días";
  }

  // ---------- Carga ----------
  function reload() {
    return Promise.all([
      // Bodas de parejas y bodas aún sin cuenta (no la boda de registro de un superadmin).
      sb.from("wedding_overview").select("*").or("owner_role.is.null,owner_role.eq." + ROLES.PAREJA),
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("wedding_tasks").select("id,title,due_date,wedding_id").eq("done", false)
        .lt("due_date", today()).order("due_date").limit(50)
    ]).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      weddings = res[0].data;
      users = res[1].data;
      overdue = res[2].data;
      renderAll();
    }).catch(function (err) { say(auth.friendly(err), false); });
  }

  function renderAll() {
    renderCounts();
    renderSummary();
    renderActive();
    renderHistory();
    renderUsers();
    fillPlannerSelects();
  }

  function renderCounts() {
    $("count-active").textContent = weddings.filter(isActive).length || "";
    $("count-history").textContent = weddings.filter(function (w) { return !isActive(w); }).length || "";
    $("count-users").textContent = users.length || "";
  }

  // ---------- Resumen ----------
  function miniItem(href, title, sub, badge) {
    return el("li", null, [el("a", { href: href }, [
      el("span", null, [el("strong", { text: title }), el("small", { text: sub })]),
      badge || null
    ])]);
  }

  function renderSummary() {
    var active = weddings.filter(isActive);
    $("stat-active").textContent = active.length;
    $("stat-upcoming").textContent = active.filter(function (w) {
      var d = ui.daysUntil(w.wedding_date);
      return d != null && d >= 0 && d <= 90;
    }).length;
    $("stat-confirmed").textContent = active.filter(function (w) { return w.status === "confirmada"; }).length;
    $("stat-budget").textContent = ui.fmtMoney(active.reduce(function (s, w) { return s + Number(w.budget_total || 0); }, 0), true);

    var upcoming = active.filter(function (w) { var d = ui.daysUntil(w.wedding_date); return d != null && d >= 0; })
      .sort(function (a, b) { return a.wedding_date < b.wedding_date ? -1 : 1; }).slice(0, 6);
    var ul = $("upcoming-list");
    ul.textContent = "";
    upcoming.forEach(function (w) {
      ul.appendChild(miniItem("#boda=" + w.id, ui.coupleName(w),
        ui.fmtDate(w.wedding_date) + " · " + whenText(w.wedding_date) + (w.venue ? " · " + w.venue : ""), ui.statusBadge(w.status)));
    });
    $("upcoming-empty").hidden = upcoming.length > 0;

    var byId = {};
    active.forEach(function (w) { byId[w.id] = w; });
    var late = overdue.filter(function (t) { return byId[t.wedding_id]; }).slice(0, 8);
    var ol = $("overdue-list");
    ol.textContent = "";
    late.forEach(function (t) {
      ol.appendChild(miniItem("#boda=" + t.wedding_id, t.title,
        ui.coupleName(byId[t.wedding_id]) + " · vencía " + ui.fmtDate(t.due_date)));
    });
    $("overdue-empty").hidden = late.length > 0;

    // Bodas que piden una acción del equipo.
    var attention = [];
    active.forEach(function (w) {
      var d = ui.daysUntil(w.wedding_date);
      if (d != null && d < 0) attention.push([w, "La fecha ya pasó: márcala como celebrada o cancelada."]);
      else if (!w.planner_id) attention.push([w, "Sin planner asignado."]);
      else if (!w.owner_id && !w.contact_email) attention.push([w, "Sin correo de contacto: la pareja no podrá vincular su cuenta."]);
    });
    var al = $("attention-list");
    al.textContent = "";
    attention.slice(0, 8).forEach(function (a) { al.appendChild(miniItem("#boda=" + a[0].id, ui.coupleName(a[0]), a[1])); });
    $("attention-box").hidden = attention.length === 0;
  }

  // ---------- Bodas en curso ----------
  var aStatus = $("a-status");
  ACTIVE.forEach(function (k) { aStatus.appendChild(el("option", { value: k, text: ui.STATUS[k] })); });

  function matches(w, q) {
    return !q || [ui.coupleName(w), w.email, w.contact_email, w.venue, w.reception_venue, w.city, w.full_name, w.planner_name]
      .join(" ").toLowerCase().indexOf(q) !== -1;
  }

  function weddingCard(w) {
    var days = ui.daysUntil(w.wedding_date);
    var taskPct = w.task_count ? Math.round((w.task_done / w.task_count) * 100) : 0;
    var over = w.budget_total != null && Number(w.actual_total) > Number(w.budget_total);
    var bar = el("div", { className: "meter meter--thin" }, [el("span")]);
    bar.firstChild.style.width = taskPct + "%";
    return el("a", { className: "wcard", href: "#boda=" + w.id }, [
      el("div", { className: "wcard__top" }, [
        ui.statusBadge(w.status),
        !w.owner_id ? el("span", { className: "badge badge--pending", text: "Sin cuenta" }) : null,
        days != null && days < 0 ? el("span", { className: "badge badge--late", text: "Fecha pasada" }) : null
      ]),
      el("h3", { text: ui.coupleName(w) }),
      el("p", { className: "wcard__date" }, [
        el("strong", { text: w.wedding_date ? ui.fmtDate(w.wedding_date, true) : "Sin fecha" }),
        w.wedding_date ? el("span", { text: " · " + whenText(w.wedding_date) }) : null
      ]),
      el("p", { className: "wcard__meta", text: [[w.venue, w.city].filter(Boolean).join(", "), w.guests_estimated != null ? w.guests_estimated + " invitados" : ""].filter(Boolean).join(" · ") || "Sin lugar todavía" }),
      el("div", { className: "wcard__row" }, [
        el("span", { text: "Tareas" }),
        el("span", { className: w.task_overdue ? "warn" : null, text: w.task_count ? w.task_done + "/" + w.task_count + (w.task_overdue ? " · " + w.task_overdue + (w.task_overdue === 1 ? " atrasada" : " atrasadas") : "") : "—" })
      ]),
      bar,
      el("div", { className: "wcard__row" }, [
        el("span", { text: "Presupuesto" }),
        el("span", { className: over ? "warn" : null, text: w.item_count ? ui.fmtMoney(w.actual_total, true) + " / " + ui.fmtMoney(w.budget_total, true) : ui.fmtMoney(w.budget_total, true) })
      ]),
      el("p", { className: "wcard__foot", text: "Planner: " + (w.planner_name || w.planner_email || "sin asignar") })
    ]);
  }

  function renderActive() {
    var q = $("a-search").value.trim().toLowerCase();
    var st = aStatus.value;
    var pl = $("a-planner").value;
    var rows = weddings.filter(function (w) {
      if (!isActive(w)) return false;
      if (st && w.status !== st) return false;
      if (pl === "none" && w.planner_id) return false;
      if (pl && pl !== "none" && w.planner_id !== pl) return false;
      return matches(w, q);
    });
    // Con fecha (más cercana primero) y después las que no tienen fecha.
    rows.sort(function (a, b) {
      if (!a.wedding_date !== !b.wedding_date) return a.wedding_date ? -1 : 1;
      if (a.wedding_date && a.wedding_date !== b.wedding_date) return a.wedding_date < b.wedding_date ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    var box = $("active-cards");
    box.textContent = "";
    rows.forEach(function (w) { box.appendChild(weddingCard(w)); });
    $("active-empty").hidden = rows.length > 0;
  }

  $("a-search").addEventListener("input", renderActive);
  aStatus.addEventListener("change", renderActive);
  $("a-planner").addEventListener("change", renderActive);

  function fillPlannerSelects() {
    var list = planners();
    [["a-planner", 2], ["n-planner", 1]].forEach(function (s) {
      var sel = $(s[0]);
      var value = sel.value;
      while (sel.options.length > s[1]) sel.remove(s[1]);
      list.forEach(function (p) { sel.appendChild(el("option", { value: p.id, text: p.name })); });
      sel.value = value;
      if (sel.value !== value) sel.value = "";
    });
    if (!$("n-planner").dataset.touched && me) $("n-planner").value = me.id;
  }

  // ---------- Historial ----------
  function historyRow(w) {
    return el("tr", null, [
      el("td", null, [el("strong", { text: ui.coupleName(w) }), el("small", { text: w.email || "—" })]),
      el("td", null, [el("span", { text: ui.fmtDate(w.wedding_date) }), w.wedding_date ? el("small", { text: whenText(w.wedding_date) }) : null]),
      el("td", { text: [w.venue, w.city].filter(Boolean).join(", ") || "—" }),
      el("td", { className: "num", text: w.guests_estimated != null ? w.guests_estimated : "—" }),
      el("td", { className: "num", text: ui.fmtMoney(w.budget_total, true) }),
      el("td", { className: "num" }, [
        el("span", { text: w.item_count ? ui.fmtMoney(w.actual_total, true) : "—" }),
        el("small", { text: w.item_count ? "pagado " + ui.fmtMoney(w.paid_total, true) : "sin partidas" })
      ]),
      el("td", null, [ui.statusBadge(w.status)]),
      el("td", { className: "data-table__actions" }, [el("a", { className: "btn btn--sm", href: "#boda=" + w.id, text: "Ver" })])
    ]);
  }

  function renderHistory() {
    var q = $("h-search").value.trim().toLowerCase();
    var st = $("h-status").value;
    var rows = weddings.filter(function (w) {
      return !isActive(w) && (!st || w.status === st) && matches(w, q);
    }).sort(function (a, b) { return (a.wedding_date || "") < (b.wedding_date || "") ? 1 : -1; });
    var body = $("history-body");
    body.textContent = "";
    rows.forEach(function (w) { body.appendChild(historyRow(w)); });
    $("history-empty").hidden = rows.length > 0;
  }

  $("h-search").addEventListener("input", renderHistory);
  $("h-status").addEventListener("change", renderHistory);

  // ---------- Nueva boda ----------
  var newForm = $("new-form");
  var nf = newForm.elements;
  Object.keys(ui.CEREMONY).forEach(function (k) { $("n-ctype").appendChild(el("option", { value: k, text: ui.CEREMONY[k] })); });
  ACTIVE.forEach(function (k) { $("n-status").appendChild(el("option", { value: k, text: ui.STATUS[k] })); });
  $("n-planner").addEventListener("change", function () { this.dataset.touched = "1"; });

  function setError(input, msg) {
    var f = input.closest(".field");
    f.classList.toggle("is-invalid", !!msg);
    f.querySelector(".field__error").textContent = msg || "";
    return !msg;
  }
  function amount(input, integer) {
    var v = input.value.trim().replace(",", ".");
    if (v === "") return null;
    var n = Number(v);
    if (!isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) return NaN;
    return integer ? n : Math.round(n * 100) / 100;
  }

  function resetNewForm() {
    newForm.reset();
    newForm.querySelectorAll(".field").forEach(function (f) { f.classList.remove("is-invalid"); });
    var box = newForm.querySelector(".form__message");
    box.className = "form__message";
    delete $("n-planner").dataset.touched;
    if (me) $("n-planner").value = me.id;
  }

  newForm.addEventListener("input", function (e) { if (e.target.closest(".field") && e.target.closest(".field").querySelector(".field__error")) setError(e.target, ""); });

  newForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var box = newForm.querySelector(".form__message");
    var email = nf.contact_email.value.trim().toLowerCase();
    var guests = amount(nf.guests_estimated, true);
    var budget = amount(nf.budget_total, false);
    var valid = [
      setError(nf.partner1_name, nf.partner1_name.value.trim() ? "" : "Indica un nombre."),
      setError(nf.partner2_name, nf.partner2_name.value.trim() ? "" : "Indica un nombre."),
      setError(nf.contact_email, !email ? "Indica un correo: con él la pareja vinculará su cuenta." : !ui.EMAIL_RE.test(email) ? "Correo no válido." : ""),
      setError(nf.guests_estimated, isNaN(guests) ? "Introduce un número entero." : ""),
      setError(nf.budget_total, isNaN(budget) ? "Introduce un importe válido." : "")
    ].every(Boolean);
    if (!valid) {
      var first = newForm.querySelector(".is-invalid input");
      if (first) first.focus();
      return;
    }

    // ¿Ya hay una cuenta o una boda pendiente con ese correo?
    var account = users.filter(function (u) { return u.email === email; })[0];
    var existing = weddings.filter(function (w) {
      return (account && w.owner_id === account.id) || (!w.owner_id && (w.contact_email || "").toLowerCase() === email);
    })[0];
    if (account || existing) {
      box.textContent = "";
      box.appendChild(document.createTextNode(account
        ? "Ya existe una cuenta con ese correo" + (account.role === ROLES.SUPERADMIN ? " (es del equipo)." : ", y su boda ya está creada. ")
        : "Ya hay una boda pendiente con ese correo. "));
      if (existing) box.appendChild(el("a", { href: "#boda=" + existing.id, text: "Ver la boda de " + ui.coupleName(existing) }));
      box.className = "form__message is-visible form__message--error";
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var row = {
      owner_id: null,
      partner1_name: nf.partner1_name.value.trim(),
      partner2_name: nf.partner2_name.value.trim(),
      contact_email: email,
      contact_phone: nf.contact_phone.value.trim(),
      wedding_date: nf.wedding_date.value || null,
      ceremony_time: nf.ceremony_time.value || null,
      ceremony_type: nf.ceremony_type.value,
      venue: nf.venue.value.trim(),
      reception_venue: nf.reception_venue.value.trim(),
      city: nf.city.value.trim(),
      guests_estimated: guests,
      budget_total: budget,
      status: nf.status.value,
      planner_id: nf.planner_id.value || null
    };
    var seedBudget = $("n-seed-budget").checked;
    var seedTasks = $("n-seed-tasks").checked;
    var notes = $("n-notes").value.trim();
    var btn = newForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Creando…";

    sb.from("weddings").insert(row).select().single().then(function (r) {
      if (r.error) throw r.error;
      var w = r.data;
      var extra = [];
      if (seedBudget) extra.push(sb.from("budget_items").insert(ui.budgetTemplate(w.id, budget)));
      if (seedTasks) extra.push(sb.from("wedding_tasks").insert(ui.taskTemplate(w.id, w.wedding_date)));
      if (notes) extra.push(sb.from("wedding_notes").insert({ wedding_id: w.id, notes: notes }));
      return Promise.all(extra).then(function (res) {
        var failed = res.filter(function (x) { return x.error; });
        flash = failed.length
          ? ["Boda creada, pero algo no se guardó: " + auth.friendly(failed[0].error), false]
          : ["Boda de " + ui.coupleName(w) + " creada. Cuando se registren con " + email + " verán su panel.", true];
        resetNewForm();
        location.hash = "#boda=" + w.id;
      });
    }).catch(function (err) {
      ui.showMessage(box, auth.friendly(err), false);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Crear boda";
    });
  });

  // ---------- Usuarios ----------
  function userRow(u) {
    var isMe = u.id === me.id;
    var select = el("select", { "data-role-for": u.id, "aria-label": "Rol de " + (u.full_name || u.email), disabled: isMe }, [
      el("option", { value: ROLES.PAREJA, text: "Pareja" }),
      el("option", { value: ROLES.SUPERADMIN, text: "Superadmin" })
    ]);
    select.value = u.role;
    var wedding = weddings.filter(function (w) { return w.owner_id === u.id; })[0];
    return el("tr", null, [
      el("td", null, [el("strong", { text: (u.full_name || "Sin nombre") + (isMe ? " (tú)" : "") }), el("small", { text: u.email })]),
      el("td", { text: ui.fmtDate(u.created_at) }),
      el("td", null, [select]),
      el("td", { className: "data-table__actions" }, [
        wedding ? el("a", { className: "btn btn--sm btn--ghost", href: "#boda=" + wedding.id, text: "Ver boda" }) : null,
        " ",
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
    if (!u || !confirm("¿Eliminar la cuenta de " + name + "? Se borrarán también su boda, tareas y presupuesto. No se puede deshacer.")) return;
    sb.rpc("admin_delete_user", { target: u.id }).then(function (r) {
      if (r.error) say(auth.friendly(r.error), false);
      else say("Cuenta de " + name + " eliminada.", true);
      reload();
    });
  });

  // ---------- Detalle de una boda ----------
  var notesForm = $("notes-form");
  var current = null; // { id, wedding }

  function selectDetailTab(name) {
    ["datos", "mesas", "tareas", "presupuesto"].forEach(function (t) {
      $("dtab-" + t).setAttribute("aria-selected", String(t === name));
      $("dpanel-" + t).hidden = t !== name;
    });
  }
  ["datos", "mesas", "tareas", "presupuesto"].forEach(function (t) {
    $("dtab-" + t).addEventListener("click", function () { selectDetailTab(t); });
  });

  function detailStat(label, value, sub, warn) {
    return el("div", { className: "stat" + (warn ? " stat--warn" : "") }, [
      el("div", { className: "stat__label", text: label }),
      el("div", { className: "stat__value stat__value--sm", text: value }),
      sub ? el("div", { className: "stat__sub", text: sub }) : null
    ]);
  }

  function renderDetail() {
    var w = current.wedding;
    var t = current.tasks, b = current.items;
    $("d-names").textContent = ui.coupleName(w);

    var meta = $("d-meta");
    meta.textContent = "";
    meta.appendChild(ui.statusBadge(w.status));
    var bits = [
      ui.CEREMONY[w.ceremony_type] && w.ceremony_type ? "Ceremonia " + ui.CEREMONY[w.ceremony_type].toLowerCase() : "",
      [w.venue, w.reception_venue && w.reception_venue !== w.venue ? w.reception_venue : "", w.city].filter(Boolean).join(" · "),
      w.planner_name || w.planner_email ? "Planner: " + (w.planner_name || w.planner_email) : "Sin planner"
    ].filter(Boolean);
    meta.appendChild(document.createTextNode("  " + bits.join(" — ")));

    var acc = $("d-account");
    if (w.owner_id) acc.textContent = "Cuenta de la pareja vinculada: " + (w.email || w.contact_email) + (w.contact_phone ? " · " + w.contact_phone : "");
    else if (w.contact_email) acc.textContent = "Sin cuenta todavía. Se vinculará cuando se registren y confirmen " + w.contact_email + (w.contact_phone ? " · " + w.contact_phone : "") + ".";
    else acc.textContent = "Sin cuenta ni correo de contacto: añade uno en «Datos» para que la pareja pueda acceder.";
    $("d-delete").hidden = !!w.owner_id;

    var days = ui.daysUntil(w.wedding_date);
    var done = t ? t.filter(function (x) { return x.done; }).length : w.task_done;
    var total = t ? t.length : w.task_count;
    var late = t ? t.filter(function (x) { return !x.done && ui.daysUntil(x.due_date) < 0; }).length : w.task_overdue;
    var forecast = b ? b.reduce(function (s, it) { return s + Number(it.actual != null ? it.actual : it.estimated); }, 0) : Number(w.actual_total);
    var paid = b ? b.reduce(function (s, it) { return s + Number(it.paid || 0); }, 0) : Number(w.paid_total);
    var over = w.budget_total != null && forecast > Number(w.budget_total);

    var stats = $("d-stats");
    stats.textContent = "";
    [
      detailStat("Fecha", w.wedding_date ? ui.fmtDate(w.wedding_date, true) : "Sin fecha",
        (w.ceremony_time ? String(w.ceremony_time).slice(0, 5) + " h · " : "") + whenText(w.wedding_date)),
      detailStat("Invitados", w.guests_estimated != null ? String(w.guests_estimated) : "—"),
      detailStat("Tareas", total ? done + " / " + total : "—", late ? late + (late === 1 ? " atrasada" : " atrasadas") : total ? "al día" : "sin checklist", late > 0),
      detailStat("Presupuesto", ui.fmtMoney(w.budget_total, true),
        "previsto " + ui.fmtMoney(forecast, true) + " · pagado " + ui.fmtMoney(paid, true), over)
    ].forEach(function (s) { stats.appendChild(s); });
  }

  function showDetail(id) {
    current = { id: id, wedding: null, tasks: null, items: null };
    $("d-names").textContent = "Cargando…";
    ["d-meta", "d-account", "d-stats", "d-form", "d-budget", "d-tasks", "d-plan"].forEach(function (k) { $(k).textContent = ""; });
    $("d-delete").hidden = true;
    notesForm.notes.value = "";
    notesForm.querySelector(".form__message").className = "form__message";
    selectDetailTab("datos");

    var ready = users.length ? Promise.resolve() : reload();
    ready.then(function () {
      return Promise.all([
        sb.from("wedding_overview").select("*").eq("id", id).maybeSingle(),
        sb.from("wedding_notes").select("notes").eq("wedding_id", id).maybeSingle()
      ]);
    }).then(function (res) {
      if (!current || current.id !== id) return;
      var w = res[0].data;
      if (res[0].error || !w) {
        $("d-names").textContent = "Boda no encontrada";
        if (res[0].error) say(auth.friendly(res[0].error), false);
        return;
      }
      current.wedding = w;
      $("back-link").href = isActive(w) ? "#en-curso" : "#historial";
      show("boda"); // marca en el menú «En curso» o «Historial»
      notesForm.notes.value = (res[1].data && res[1].data.notes) || "";
      renderDetail();

      var budget = ui.budget($("d-budget"), w, {
        onChange: function (items) { current.items = items; renderDetail(); }
      });
      var tasks = ui.tasks($("d-tasks"), w, {
        onChange: function (list) { current.tasks = list; renderDetail(); }
      });
      var plan = window.LAmore.seating.plan($("d-plan"), w);
      ui.weddingForm($("d-form"), w, {
        admin: true,
        planners: planners(),
        onSaved: function (nw) {
          // La fila guardada no trae los campos calculados de la vista: se combinan.
          var pl = userById(nw.planner_id);
          current.wedding = Object.assign({}, current.wedding, nw, {
            planner_name: pl ? pl.full_name : null, planner_email: pl ? pl.email : null
          });
          budget.setWedding(current.wedding);
          tasks.setWedding(current.wedding);
          plan.setWedding(current.wedding);
          renderDetail();
        }
      });
    });
  }

  notesForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var box = notesForm.querySelector(".form__message");
    var btn = notesForm.querySelector("button");
    btn.disabled = true;
    sb.from("wedding_notes").upsert({ wedding_id: current.id, notes: notesForm.notes.value }).then(function (r) {
      btn.disabled = false;
      if (r.error) ui.showMessage(box, auth.friendly(r.error), false);
      else ui.showMessage(box, "Notas guardadas.", true);
    });
  });

  $("d-delete").addEventListener("click", function () {
    var w = current && current.wedding;
    if (!w || w.owner_id) return;
    if (!confirm("¿Eliminar la boda de " + ui.coupleName(w) + "? Se borrarán sus tareas, presupuesto y notas. No se puede deshacer.")) return;
    sb.from("weddings").delete().eq("id", w.id).then(function (r) {
      if (r.error) return say(auth.friendly(r.error), false);
      flash = ["Boda de " + ui.coupleName(w) + " eliminada.", true];
      location.hash = "#en-curso";
    });
  });

  // ---------- Navegación ----------
  function show(view) {
    VIEWS.forEach(function (v) {
      document.querySelector('[data-panel="' + v + '"]').hidden = v !== view;
    });
    var navView = view === "boda" ? (current && current.wedding && !isActive(current.wedding) ? "historial" : "en-curso") : view;
    document.querySelectorAll(".sidebar__link").forEach(function (a) {
      if (a.getAttribute("data-view") === navView) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    closeNav();
    clearMessage();
    if (flash) { say(flash[0], flash[1]); flash = null; }
    window.scrollTo(0, 0);

    var m = location.hash.match(/^#boda=([0-9a-f-]{36})$/i);
    if (m) {
      show("boda");
      showDetail(m[1]);
      return;
    }
    current = null;
    var view = location.hash.slice(1);
    if (VIEWS.indexOf(view) === -1 || view === "boda") view = "resumen";
    show(view);
    reload(); // refresca totales por si se editó algo en el detalle
    if (view === "nueva") setTimeout(function () { $("n-p1").focus(); }, 0);
  }

  // Menú lateral en móvil
  var toggle = document.querySelector(".admin__topbar .nav-toggle");
  function closeNav() {
    document.body.classList.remove("admin-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menú");
  }
  toggle.addEventListener("click", function () {
    var open = document.body.classList.toggle("admin-nav-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  document.querySelector("[data-close-nav]").addEventListener("click", closeNav);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });

  document.querySelector("[data-logout]").addEventListener("click", function () {
    auth.logout().then(function () { location.href = "../index.html"; });
  });

  // ---------- Inicio ----------
  auth.guard(ROLES.SUPERADMIN).then(function (u) {
    if (!u) return;
    me = u;
    $("admin-hello").textContent = me.full_name ? me.full_name + " · " + me.email : me.email;
    $("hello-name").textContent = me.full_name ? ", " + me.full_name.split(" ")[0] : "";
    document.querySelector(".admin").hidden = false;
    window.addEventListener("hashchange", route);
    route();
  });
})();
