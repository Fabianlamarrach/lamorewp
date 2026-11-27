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

  // ---------- Formulario de la boda ----------
  // opts: { admin: bool, onSaved(wedding) }
  function weddingForm(container, wedding, opts) {
    opts = opts || {};
    var id = uid("w");
    function input(name, type, extra) {
      var props = { id: id + "-" + name, name: name, type: type || "text" };
      for (var k in extra || {}) props[k] = extra[k];
      return el("input", props);
    }

    var i = {
      partner1_name: input("partner1_name", "text", { maxlength: 120, required: true }),
      partner2_name: input("partner2_name", "text", { maxlength: 120, required: true }),
      wedding_date: input("wedding_date", "date"),
      venue: input("venue", "text", { maxlength: 200, placeholder: "Finca, restaurante…" }),
      city: input("city", "text", { maxlength: 120 }),
      guests_estimated: input("guests_estimated", "number", { min: 0, step: 1, inputmode: "numeric" }),
      budget_total: input("budget_total", "number", { min: 0, step: 100, inputmode: "decimal" })
    };
    var statusSel = null;
    if (opts.admin) {
      statusSel = el("select", { id: id + "-status", name: "status" }, Object.keys(STATUS).map(function (k) {
        return el("option", { value: k, text: STATUS[k] });
      }));
    }

    var msg = el("div", { className: "form__message", role: "status" });
    var btn = el("button", { className: "btn", type: "submit", text: "Guardar cambios" });
    var form = el("form", { className: "form", novalidate: true }, [
      msg,
      el("div", { className: "form__row" }, [
        field(opts.admin ? "Nombre (1)" : "Tu nombre", i.partner1_name),
        field(opts.admin ? "Nombre (2)" : "Nombre de tu pareja", i.partner2_name)
      ]),
      el("div", { className: "form__row" }, [field("Fecha de la boda", i.wedding_date), field("Ciudad", i.city)]),
      field("Lugar", i.venue),
      el("div", { className: "form__row" }, [field("Invitados previstos", i.guests_estimated), field("Presupuesto total (€)", i.budget_total)]),
      statusSel ? field("Estado", statusSel) : null,
      el("div", null, [btn])
    ]);

    function fill(w) {
      Object.keys(i).forEach(function (k) { i[k].value = w[k] == null ? "" : w[k]; });
      if (statusSel) statusSel.value = w.status;
    }
    fill(wedding);

    form.addEventListener("input", function (e) { if (e.target.closest(".field")) setError(e.target, ""); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var guests = readAmount(i.guests_estimated, true);
      var budget = readAmount(i.budget_total, false);
      var valid = [
        setError(i.partner1_name, i.partner1_name.value.trim() ? "" : "Indica un nombre."),
        setError(i.partner2_name, i.partner2_name.value.trim() ? "" : "Indica un nombre."),
        setError(i.guests_estimated, isNaN(guests) ? "Introduce un número entero." : ""),
        setError(i.budget_total, isNaN(budget) ? "Introduce un importe válido." : "")
      ].every(Boolean);
      if (!valid) return;

      var patch = {
        partner1_name: i.partner1_name.value.trim(),
        partner2_name: i.partner2_name.value.trim(),
        wedding_date: i.wedding_date.value || null,
        venue: i.venue.value.trim(),
        city: i.city.value.trim(),
        guests_estimated: guests,
        budget_total: budget
      };
      if (statusSel) patch.status = statusSel.value;

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

  window.LAmore.ui = {
    STATUS: STATUS,
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
