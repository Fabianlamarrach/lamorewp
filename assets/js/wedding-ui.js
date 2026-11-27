/* ==========================================================
   Componentes compartidos por el panel de la pareja y el de
   administración: formulario de datos de la boda y presupuesto
   por partidas. Todo lo que escribe el usuario se pinta con
   textContent (nunca innerHTML).
   ========================================================== */
(function () {
  var sb = window.LAmore.auth.client;

  var STATUS = {
    consulta: "Consulta",
    presupuestada: "Presupuestada",
    confirmada: "Confirmada",
    celebrada: "Celebrada",
    cancelada: "Cancelada"
  };
  var CATEGORIES = [
    "Lugar", "Catering", "Fotografía y vídeo", "Música", "Flores y decoración",
    "Vestuario", "Belleza", "Invitaciones", "Transporte", "Alojamiento", "Luna de miel", "Otros"
  ];
  var CEREMONY = { "": "Sin decidir", civil: "Civil", religiosa: "Religiosa", simbolica: "Simbólica" };

  // Reparto orientativo del presupuesto al crear una boda (suma 100 %).
  var BUDGET_TEMPLATE = [
    ["Lugar", "Alquiler del espacio", 15],
    ["Catering", "Menú, bebida y servicio", 35],
    ["Fotografía y vídeo", "Fotógrafo y vídeo", 10],
    ["Música", "Ceremonia y fiesta (DJ / banda)", 5],
    ["Flores y decoración", "Flores, centros y ambientación", 8],
    ["Vestuario", "Vestido, traje y complementos", 10],
    ["Belleza", "Peluquería y maquillaje", 2],
    ["Invitaciones", "Save the date, invitaciones y papelería", 2],
    ["Transporte", "Coches y traslados de invitados", 3],
    ["Otros", "Imprevistos y detalles", 10]
  ];

  // Checklist base: [tarea, días antes de la boda].
  var TASK_TEMPLATE = [
    ["Definir presupuesto y número de invitados", 365],
    ["Reservar lugar de ceremonia y banquete", 330],
    ["Contratar fotógrafo y vídeo", 300],
    ["Cerrar catering y prueba de menú", 270],
    ["Contratar música (ceremonia y fiesta)", 240],
    ["Enviar el «save the date»", 240],
    ["Elegir vestido y traje", 180],
    ["Flores y decoración", 180],
    ["Alojamiento y transporte de invitados", 150],
    ["Diseñar y encargar invitaciones", 120],
    ["Enviar invitaciones", 90],
    ["Trámites y documentación de la ceremonia", 60],
    ["Confirmar asistencia y plan de mesas", 30],
    ["Prueba de peluquería y maquillaje", 30],
    ["Pagos finales a proveedores", 14],
    ["Enviar el cronograma del día a proveedores", 7]
  ];

  var money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  var money0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  // ---------- Utilidades ----------
  function el(tag, props, children) {
    var node = document.createElement(tag);
    for (var k in props || {}) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "text") node.textContent = v;
      else if (k === "className") node.className = v;
      else if (k === "value") node.value = v;
      else if (k === "hidden" || k === "disabled" || k === "selected") node[k] = !!v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function parseDate(str) {
    if (!str) return null;
    var p = String(str).slice(0, 10).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function fmtDate(str, long) {
    var d = parseDate(str);
    return d ? d.toLocaleDateString("es-ES", { day: "numeric", month: long ? "long" : "short", year: "numeric" }) : "—";
  }

  function daysUntil(str) {
    var d = parseDate(str);
    if (!d) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function fmtMoney(n, whole) {
    return n == null || n === "" ? "—" : (whole ? money0 : money).format(Number(n));
  }

  function coupleName(w) {
    var a = (w.partner1_name || "").trim(), b = (w.partner2_name || "").trim();
    return a && b ? a + " & " + b : a || b || w.full_name || w.email || "Sin nombre";
  }

  function showMessage(box, text, ok) {
    box.textContent = text;
    box.className = "form__message is-visible " + (ok ? "form__message--ok" : "form__message--error");
  }

  function statusBadge(status) {
    return el("span", { className: "badge badge--" + status, text: STATUS[status] || status });
  }

  function field(label, input, wide) {
    return el("div", { className: "field" + (wide ? " field--wide" : "") }, [
      el("label", { for: input.id, text: label }),
      input,
      el("span", { className: "field__error" })
    ]);
  }

  function setError(input, msg) {
    var f = input.closest(".field");
    f.classList.toggle("is-invalid", !!msg);
    f.querySelector(".field__error").textContent = msg || "";
    return !msg;
  }

  // "" -> null; número válido >= 0 -> número; inválido -> NaN
  function readAmount(input, integer) {
    var v = input.value.trim().replace(",", ".");
    if (v === "") return null;
    var n = Number(v);
    if (!isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) return NaN;
    return integer ? n : Math.round(n * 100) / 100;
  }

  function uid(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 8); }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Filas de budget_items según el reparto orientativo (importes a 0 si no hay presupuesto).
  function budgetTemplate(weddingId, total) {
    return BUDGET_TEMPLATE.map(function (t) {
      return {
        wedding_id: weddingId, category: t[0], concept: t[1],
        estimated: total ? Math.round(total * t[2]) / 100 : 0
      };
    });
  }

  // Filas de wedding_tasks con la fecha límite calculada (nunca antes de hoy).
  function taskTemplate(weddingId, weddingDate) {
    var wd = parseDate(weddingDate);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return TASK_TEMPLATE.map(function (t) {
      var due = null;
      if (wd) {
        var d = new Date(wd);
        d.setDate(d.getDate() - t[1]);
        due = isoDate(d < today ? today : d);
      }
      return { wedding_id: weddingId, title: t[0], due_date: due };
    });
  }

  // ---------- Formulario de la boda ----------
  // opts: { admin: bool, planners: [{ id, name }], onSaved(wedding) }
  function weddingForm(container, wedding, opts) {
    opts = opts || {};
    var id = uid("w");
    function input(name, type, extra) {
      var props = { id: id + "-" + name, name: name, type: type || "text" };
      for (var k in extra || {}) props[k] = extra[k];
      return el("input", props);
    }
    function select(name, options) {
      return el("select", { id: id + "-" + name, name: name }, Object.keys(options).map(function (k) {
        return el("option", { value: k, text: options[k] });
      }));
    }

    var i = {
      partner1_name: input("partner1_name", "text", { maxlength: 120, required: true }),
      partner2_name: input("partner2_name", "text", { maxlength: 120, required: true }),
      wedding_date: input("wedding_date", "date"),
      ceremony_time: input("ceremony_time", "time"),
      ceremony_type: select("ceremony_type", CEREMONY),
      city: input("city", "text", { maxlength: 120 }),
      venue: input("venue", "text", { maxlength: 200, placeholder: "Iglesia, juzgado, finca…" }),
      reception_venue: input("reception_venue", "text", { maxlength: 200, placeholder: "Si es distinto del de la ceremonia" }),
      guests_estimated: input("guests_estimated", "number", { min: 0, step: 1, inputmode: "numeric" }),
      budget_total: input("budget_total", "number", { min: 0, step: 100, inputmode: "decimal" })
    };
    if (opts.admin) {
      i.contact_email = input("contact_email", "email", { maxlength: 254, autocomplete: "off" });
      i.contact_phone = input("contact_phone", "tel", { maxlength: 40, autocomplete: "off" });
      i.status = select("status", STATUS);
      var planners = { "": "Sin asignar" };
      (opts.planners || []).forEach(function (p) { planners[p.id] = p.name; });
      i.planner_id = select("planner_id", planners);
    }

    var msg = el("div", { className: "form__message", role: "status" });
    var btn = el("button", { className: "btn", type: "submit", text: "Guardar cambios" });
    var form = el("form", { className: "form", novalidate: true }, [
      msg,
      el("div", { className: "form__row" }, [
        field(opts.admin ? "Nombre (1)" : "Tu nombre", i.partner1_name),
        field(opts.admin ? "Nombre (2)" : "Nombre de tu pareja", i.partner2_name)
      ]),
      opts.admin ? el("div", { className: "form__row" }, [field("Correo de contacto", i.contact_email), field("Teléfono", i.contact_phone)]) : null,
      el("div", { className: "form__row form__row--3" }, [
        field("Fecha de la boda", i.wedding_date), field("Hora", i.ceremony_time), field("Ceremonia", i.ceremony_type)
      ]),
      el("div", { className: "form__row" }, [field("Lugar de la ceremonia", i.venue), field("Lugar del banquete", i.reception_venue)]),
      el("div", { className: "form__row form__row--3" }, [
        field("Ciudad", i.city), field("Invitados previstos", i.guests_estimated), field("Presupuesto total (€)", i.budget_total)
      ]),
      opts.admin ? el("div", { className: "form__row" }, [field("Estado", i.status), field("Planner", i.planner_id)]) : null,
      el("div", null, [btn])
    ]);

    function fill(w) {
      Object.keys(i).forEach(function (k) { i[k].value = w[k] == null ? "" : w[k]; });
      i.ceremony_time.value = w.ceremony_time ? String(w.ceremony_time).slice(0, 5) : "";
      if (i.planner_id && w.planner_id && !i.planner_id.querySelector('option[value="' + w.planner_id + '"]')) {
        i.planner_id.appendChild(el("option", { value: w.planner_id, text: w.planner_name || "Planner" }));
        i.planner_id.value = w.planner_id;
      }
    }
    fill(wedding);

    form.addEventListener("input", function (e) { if (e.target.closest(".field")) setError(e.target, ""); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var guests = readAmount(i.guests_estimated, true);
      var budget = readAmount(i.budget_total, false);
      var email = i.contact_email ? i.contact_email.value.trim().toLowerCase() : "";
      var valid = [
        setError(i.partner1_name, i.partner1_name.value.trim() ? "" : "Indica un nombre."),
        setError(i.partner2_name, i.partner2_name.value.trim() ? "" : "Indica un nombre."),
        setError(i.guests_estimated, isNaN(guests) ? "Introduce un número entero." : ""),
        setError(i.budget_total, isNaN(budget) ? "Introduce un importe válido." : ""),
        i.contact_email ? setError(i.contact_email, email && !EMAIL_RE.test(email) ? "Correo no válido." : "") : true
      ].every(Boolean);
      if (!valid) return;

      var patch = {
        partner1_name: i.partner1_name.value.trim(),
        partner2_name: i.partner2_name.value.trim(),
        wedding_date: i.wedding_date.value || null,
        ceremony_time: i.ceremony_time.value || null,
        ceremony_type: i.ceremony_type.value,
        venue: i.venue.value.trim(),
        reception_venue: i.reception_venue.value.trim(),
        city: i.city.value.trim(),
        guests_estimated: guests,
        budget_total: budget
      };
      if (opts.admin) {
        patch.contact_email = email;
        patch.contact_phone = i.contact_phone.value.trim();
        patch.status = i.status.value;
        patch.planner_id = i.planner_id.value || null;
      }

      btn.disabled = true;
      sb.from("weddings").update(patch).eq("id", wedding.id).select().single().then(function (r) {
        btn.disabled = false;
        if (r.error) return showMessage(msg, window.LAmore.auth.friendly(r.error), false);
        wedding = r.data;
        fill(wedding);
        showMessage(msg, "Cambios guardados.", true);
        if (opts.onSaved) opts.onSaved(wedding);
      });
    });

    container.textContent = "";
    container.appendChild(form);
  }

  // ---------- Presupuesto por partidas ----------
  // opts: { onChange(items) }
  function budget(container, wedding, opts) {
    opts = opts || {};
    var items = [];
    var editing = null; // id de la partida en edición
    var id = uid("b");

    var summary = el("div", { className: "budget-summary" });
    var tbody = el("tbody");
    var empty = el("p", { className: "empty", text: "Todavía no hay partidas. Añade la primera abajo.", hidden: true });
    var table = el("div", { className: "data-table-wrap" }, [
      el("table", { className: "data-table" }, [
        el("thead", null, [el("tr", null, [
          el("th", { text: "Partida" }),
          el("th", { text: "Proveedor" }),
          el("th", { className: "num", text: "Estimado" }),
          el("th", { className: "num", text: "Real" }),
          el("th", { className: "num", text: "Pagado" }),
          el("th", { text: "Vence" }),
          el("th", null, [el("span", { className: "visually-hidden", text: "Acciones" })])
        ])]),
        tbody
      ])
    ]);

    // Formulario de alta / edición
    function input(name, type, extra) {
      var props = { id: id + "-" + name, name: name, type: type || "text" };
      for (var k in extra || {}) props[k] = extra[k];
      return el("input", props);
    }
    var f = {
      category: el("select", { id: id + "-category", name: "category" }, CATEGORIES.map(function (c) { return el("option", { value: c, text: c }); })),
      concept: input("concept", "text", { maxlength: 200, required: true, placeholder: "Ej.: menú, fotógrafo, DJ…" }),
      vendor: input("vendor", "text", { maxlength: 200 }),
      estimated: input("estimated", "number", { min: 0, step: "0.01", inputmode: "decimal", required: true }),
      actual: input("actual", "number", { min: 0, step: "0.01", inputmode: "decimal" }),
      paid: input("paid", "number", { min: 0, step: "0.01", inputmode: "decimal" }),
      due_date: input("due_date", "date"),
      notes: input("notes", "text", { maxlength: 2000 })
    };
    var msg = el("div", { className: "form__message", role: "status" });
    var title = el("h3", { text: "Añadir partida" });
    var submit = el("button", { className: "btn", type: "submit", text: "Añadir" });
    var cancel = el("button", { className: "btn btn--ghost", type: "button", text: "Cancelar", hidden: true });
    var form = el("form", { className: "form budget-form", novalidate: true }, [
      title,
      msg,
      el("div", { className: "form__row" }, [field("Categoría", f.category), field("Concepto", f.concept)]),
      el("div", { className: "form__row" }, [field("Proveedor", f.vendor), field("Fecha de pago", f.due_date)]),
      el("div", { className: "form__row form__row--3" }, [
        field("Estimado (€)", f.estimated), field("Coste real (€)", f.actual), field("Pagado (€)", f.paid)
      ]),
      field("Notas", f.notes),
      el("div", { className: "form__actions" }, [submit, cancel])
    ]);

    function total(key) {
      return items.reduce(function (s, it) { return s + Number(key === "actual" ? (it.actual != null ? it.actual : it.estimated) : it[key] || 0); }, 0);
    }

    function renderSummary() {
      var planned = wedding.budget_total != null ? Number(wedding.budget_total) : null;
      var forecast = total("actual");
      var paid = total("paid");
      var left = planned != null ? planned - forecast : null;
      var pct = planned ? Math.min(100, Math.round((forecast / planned) * 100)) : 0;
      summary.textContent = "";
      summary.appendChild(el("div", { className: "stats stats--compact" }, [
        stat("Presupuesto", fmtMoney(planned, true)),
        stat("Previsto (real o estimado)", fmtMoney(forecast, true)),
        stat("Pagado", fmtMoney(paid, true)),
        stat(left != null && left < 0 ? "Por encima del presupuesto" : "Margen disponible", fmtMoney(left != null ? Math.abs(left) : null, true), left != null && left < 0)
      ]));
      if (planned) {
        var bar = el("div", { className: "meter" + (forecast > planned ? " meter--over" : ""), role: "img", "aria-label": pct + "% del presupuesto comprometido" }, [el("span")]);
        bar.firstChild.style.width = pct + "%";
        summary.appendChild(bar);
      }
    }

    function stat(label, value, warn) {
      return el("div", { className: "stat" + (warn ? " stat--warn" : "") }, [
        el("div", { className: "stat__label", text: label }),
        el("div", { className: "stat__value stat__value--sm", text: value })
      ]);
    }

    function renderTable() {
      tbody.textContent = "";
      items.forEach(function (it) {
        var pending = (it.actual != null ? Number(it.actual) : Number(it.estimated)) - Number(it.paid);
        tbody.appendChild(el("tr", { className: it.id === editing ? "is-editing" : null }, [
          el("td", null, [el("strong", { text: it.concept }), el("small", { text: it.category + (it.notes ? " · " + it.notes : "") })]),
          el("td", { text: it.vendor || "—" }),
          el("td", { className: "num", text: fmtMoney(it.estimated) }),
          el("td", { className: "num", text: fmtMoney(it.actual) }),
          el("td", { className: "num" }, [
            el("span", { text: fmtMoney(it.paid) }),
            pending > 0 ? el("small", { text: "Falta " + fmtMoney(pending) }) : el("small", { className: "ok", text: "Pagado" })
          ]),
          el("td", { text: fmtDate(it.due_date) }),
          el("td", { className: "data-table__actions" }, [
            el("button", { type: "button", className: "btn btn--sm btn--ghost", "data-edit": it.id, text: "Editar" }),
            " ",
            el("button", { type: "button", className: "btn btn--sm btn--danger", "data-del": it.id, text: "Eliminar" })
          ])
        ]));
      });
      empty.hidden = items.length > 0;
      table.hidden = items.length === 0;
    }

    function render() {
      renderSummary();
      renderTable();
      if (opts.onChange) opts.onChange(items);
    }

    function resetForm() {
      editing = null;
      form.reset();
      title.textContent = "Añadir partida";
      submit.textContent = "Añadir";
      cancel.hidden = true;
      form.querySelectorAll(".field").forEach(function (fl) { fl.classList.remove("is-invalid"); });
      renderTable();
    }

    function load() {
      return sb.from("budget_items").select("*").eq("wedding_id", wedding.id)
        .order("category").order("created_at")
        .then(function (r) {
          if (r.error) return showMessage(msg, window.LAmore.auth.friendly(r.error), false);
          items = r.data;
          render();
        });
    }

    form.addEventListener("input", function (e) { if (e.target.closest(".field")) setError(e.target, ""); });
    cancel.addEventListener("click", resetForm);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var est = readAmount(f.estimated), act = readAmount(f.actual), paid = readAmount(f.paid);
      var valid = [
        setError(f.concept, f.concept.value.trim() ? "" : "Indica el concepto."),
        setError(f.estimated, est == null ? "Indica un importe (puede ser 0)." : isNaN(est) ? "Importe no válido." : ""),
        setError(f.actual, isNaN(act) ? "Importe no válido." : ""),
        setError(f.paid, isNaN(paid) ? "Importe no válido." : "")
      ].every(Boolean);
      if (!valid) return;

      var row = {
        category: f.category.value,
        concept: f.concept.value.trim(),
        vendor: f.vendor.value.trim(),
        estimated: est,
        actual: act,
        paid: paid || 0,
        due_date: f.due_date.value || null,
        notes: f.notes.value.trim()
      };
      var req = editing
        ? sb.from("budget_items").update(row).eq("id", editing)
        : sb.from("budget_items").insert(Object.assign({ wedding_id: wedding.id }, row));
      var wasEditing = !!editing;
      submit.disabled = true;
      req.then(function (r) {
        submit.disabled = false;
        if (r.error) return showMessage(msg, window.LAmore.auth.friendly(r.error), false);
        resetForm();
        showMessage(msg, wasEditing ? "Partida actualizada." : "Partida añadida.", true);
        load();
      });
    });

    tbody.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit]");
      var del = e.target.closest("[data-del]");
      if (edit) {
        var it = items.filter(function (x) { return x.id === edit.getAttribute("data-edit"); })[0];
        if (!it) return;
        editing = it.id;
        Object.keys(f).forEach(function (k) { f[k].value = it[k] == null ? "" : it[k]; });
        if (CATEGORIES.indexOf(it.category) === -1) f.category.appendChild(el("option", { value: it.category, text: it.category }));
        f.category.value = it.category;
        title.textContent = "Editar partida";
        submit.textContent = "Guardar";
        cancel.hidden = false;
        renderTable();
        form.scrollIntoView({ behavior: "smooth", block: "nearest" });
        f.concept.focus();
      }
      if (del) {
        var item = items.filter(function (x) { return x.id === del.getAttribute("data-del"); })[0];
        if (!item || !confirm("¿Eliminar la partida «" + item.concept + "»?")) return;
        sb.from("budget_items").delete().eq("id", item.id).then(function (r) {
          if (r.error) return showMessage(msg, window.LAmore.auth.friendly(r.error), false);
          if (editing === item.id) resetForm();
          showMessage(msg, "Partida eliminada.", true);
          load();
        });
      }
    });

    container.textContent = "";
    [summary, table, empty, form].forEach(function (n) { container.appendChild(n); });
    load();

    return {
      // Para refrescar el resumen cuando cambia el presupuesto total de la boda.
      setWedding: function (w) { wedding = w; renderSummary(); }
    };
  }

  // ---------- Checklist de tareas ----------
  // opts: { onChange(tasks) }
  function tasks(container, wedding, opts) {
    opts = opts || {};
    var list = [];
    var id = uid("t");

    var progress = el("p", { className: "tasks__progress" });
    var meter = el("div", { className: "meter", role: "img" }, [el("span")]);
    var ul = el("ul", { className: "tasks" });
    var empty = el("p", { className: "empty", text: "Sin tareas todavía. Añade la primera o genera el checklist base.", hidden: true });
    var seed = el("button", { type: "button", className: "btn btn--sm btn--ghost", text: "Generar checklist base", hidden: true });
    var msg = el("div", { className: "form__message", role: "status" });

    var title = el("input", { id: id + "-title", type: "text", maxlength: 200, required: true, placeholder: "Ej.: reservar autobús de invitados" });
    var due = el("input", { id: id + "-due", type: "date" });
    var form = el("form", { className: "form tasks__form", novalidate: true }, [
      el("div", { className: "tasks__add" }, [field("Nueva tarea", title), field("Fecha límite", due),
        el("div", { className: "tasks__submit" }, [el("button", { className: "btn", type: "submit", text: "Añadir" })])])
    ]);

    function sorted() {
      return list.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
        if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
        return a.created_at < b.created_at ? -1 : 1;
      });
    }

    function render() {
      var done = list.filter(function (t) { return t.done; }).length;
      var pct = list.length ? Math.round((done / list.length) * 100) : 0;
      progress.textContent = list.length ? done + " de " + list.length + " tareas hechas (" + pct + " %)" : "";
      meter.hidden = !list.length;
      meter.setAttribute("aria-label", pct + "% de tareas hechas");
      meter.firstChild.style.width = pct + "%";
      empty.hidden = list.length > 0;
      seed.hidden = list.length > 0;

      ul.textContent = "";
      sorted().forEach(function (t) {
        var days = daysUntil(t.due_date);
        var late = !t.done && days != null && days < 0;
        var cb = el("input", { type: "checkbox", id: id + "-" + t.id, "data-toggle": t.id });
        cb.checked = t.done;
        ul.appendChild(el("li", { className: "tasks__item" + (t.done ? " is-done" : "") + (late ? " is-late" : "") }, [
          cb,
          el("label", { for: cb.id }, [
            el("span", { text: t.title }),
            el("small", { text: t.due_date ? fmtDate(t.due_date) + (late ? " · atrasada" : !t.done && days <= 14 ? " · en " + days + " días" : "") : "Sin fecha" })
          ]),
          el("button", { type: "button", className: "btn btn--sm btn--danger", "data-del": t.id, "aria-label": "Eliminar tarea " + t.title, text: "×" })
        ]));
      });
      if (opts.onChange) opts.onChange(list);
    }

    function fail(r) { showMessage(msg, window.LAmore.auth.friendly(r.error), false); }

    function load() {
      return sb.from("wedding_tasks").select("*").eq("wedding_id", wedding.id).then(function (r) {
        if (r.error) return fail(r);
        list = r.data;
        render();
      });
    }

    ul.addEventListener("change", function (e) {
      var tid = e.target.getAttribute("data-toggle");
      if (!tid) return;
      var t = list.filter(function (x) { return x.id === tid; })[0];
      var value = e.target.checked;
      sb.from("wedding_tasks").update({ done: value }).eq("id", tid).then(function (r) {
        if (r.error) { e.target.checked = !value; return fail(r); }
        t.done = value;
        render();
      });
    });

    ul.addEventListener("click", function (e) {
      var b = e.target.closest("[data-del]");
      if (!b) return;
      var t = list.filter(function (x) { return x.id === b.getAttribute("data-del"); })[0];
      if (!t || !confirm("¿Eliminar la tarea «" + t.title + "»?")) return;
      sb.from("wedding_tasks").delete().eq("id", t.id).then(function (r) {
        if (r.error) return fail(r);
        list = list.filter(function (x) { return x !== t; });
        render();
      });
    });

    seed.addEventListener("click", function () {
      seed.disabled = true;
      sb.from("wedding_tasks").insert(taskTemplate(wedding.id, wedding.wedding_date)).then(function (r) {
        seed.disabled = false;
        if (r.error) return fail(r);
        load();
      });
    });

    form.addEventListener("input", function () { setError(title, ""); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!setError(title, title.value.trim() ? "" : "Escribe la tarea.")) return;
      var btn = form.querySelector("button");
      btn.disabled = true;
      sb.from("wedding_tasks").insert({ wedding_id: wedding.id, title: title.value.trim(), due_date: due.value || null }).then(function (r) {
        btn.disabled = false;
        if (r.error) return fail(r);
        form.reset();
        load();
      });
    });

    container.textContent = "";
    [msg, progress, meter, ul, empty, seed, form].forEach(function (n) { container.appendChild(n); });
    load();

    return { setWedding: function (w) { wedding = w; } };
  }

  window.LAmore.ui = {
    STATUS: STATUS,
    CEREMONY: CEREMONY,
    EMAIL_RE: EMAIL_RE,
    budgetTemplate: budgetTemplate,
    taskTemplate: taskTemplate,
    tasks: tasks,
    el: el,
    parseDate: parseDate,
    fmtDate: fmtDate,
    fmtMoney: fmtMoney,
    daysUntil: daysUntil,
    coupleName: coupleName,
    showMessage: showMessage,
    statusBadge: statusBadge,
    weddingForm: weddingForm,
    budget: budget
  };
})();
