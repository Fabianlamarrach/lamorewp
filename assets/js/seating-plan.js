/* ==========================================================
   Plan de mesas de una boda (panel de pareja y de superadmin).
   - Salón: lienzo lógico de 1000 x 625 que se escala al ancho
     disponible. Mesas y elementos (pista, barra…) se arrastran
     para colocarlos; la posición se guarda en wedding_tables.
   - Invitados: se arrastran a una mesa o a una silla concreta
     (en móvil: tocar invitado y después mesa o silla).
   - Al tocar una mesa o un invitado se abre su ficha a la derecha.
   Necesita session.js y wedding-ui.js. Textos de usuario siempre
   con textContent.
   ========================================================== */
(function () {
  var auth = window.LAmore.auth;
  var ui = window.LAmore.ui;
  var sb = auth.client;
  var el = ui.el;

  var STAGE_W = 1000, STAGE_H = 625, MARGIN = 8;
  var KINDS = {
    redonda: { label: "Mesa redonda", seats: 10 },
    rectangular: { label: "Mesa rectangular", seats: 12 },
    pista: { label: "Pista de baile", w: 220, h: 150 },
    barra: { label: "Barra", w: 180, h: 44 },
    escenario: { label: "Música / DJ", w: 130, h: 70 },
    entrada: { label: "Entrada", w: 120, h: 28 }
  };
  var MENUS = {
    normal: ["Menú normal", ""], vegetariano: ["Vegetariano", "V"], vegano: ["Vegano", "VG"],
    sin_gluten: ["Sin gluten", "SG"], infantil: ["Infantil", "N"], alergias: ["Alergias (ver notas)", "!"]
  };
  var RSVP = { pendiente: "Pendiente", confirmado: "Confirmado", rechazado: "No viene" };

  function isTable(t) { return t.kind === "redonda" || t.kind === "rectangular"; }

  function size(t) {
    if (t.kind === "redonda") { var d = 64 + t.seats * 4; return { w: d, h: d }; }
    if (t.kind === "rectangular") return { w: Math.max(2, Math.ceil(t.seats / 2)) * 34 + 16, h: 54 };
    return { w: KINDS[t.kind].w, h: KINDS[t.kind].h };
  }

  // Posición de la silla i respecto al centro de la mesa.
  function seatPos(t, i) {
    var s = size(t);
    if (t.kind === "redonda") {
      var a = (i / t.seats) * Math.PI * 2 - Math.PI / 2, r = s.w / 2 + 16;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }
    var n = Math.ceil(t.seats / 2), top = i < n, j = top ? i : i - n;
    return { x: -s.w / 2 + 25 + j * 34, y: top ? -s.h / 2 - 16 : s.h / 2 + 16 };
  }

  // Caja que ocupa (con sillas) para que no se salga del salón.
  function extent(t) {
    var s = size(t), pad = isTable(t) ? 32 : 0;
    return { w: s.w / 2 + pad, h: s.h / 2 + pad };
  }
  function clamp(t, x, y) {
    var e = extent(t);
    return {
      x: Math.round(Math.min(STAGE_W - e.w - MARGIN, Math.max(e.w + MARGIN, x))),
      y: Math.round(Math.min(STAGE_H - e.h - MARGIN, Math.max(e.h + MARGIN, y)))
    };
  }

  function initials(name) {
    return name.trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function seatingPlan(container, wedding) {
    var tables = [], guests = [];
    var selGuest = null, selTable = null;
    var filter = "pending", query = "";

    function sides() {
      return {
        p1: "Invitados de " + (wedding.partner1_name || "la pareja (1)"),
        p2: "Invitados de " + (wedding.partner2_name || "la pareja (2)"),
        comun: "Comunes"
      };
    }
    function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
    function seatedAt(tid) { return guests.filter(function (g) { return g.table_id === tid; }); }
    function guestAt(tid, i) { return guests.filter(function (g) { return g.table_id === tid && g.seat === i; })[0]; }
    function fail(err) { toast(auth.friendly(err), true); load(); }

    // ---------- Estructura ----------
    var stats = el("p", { className: "plan__stats" });
    var addSelect = el("select", { "aria-label": "Añadir al salón" }, [el("option", { value: "", text: "+ Añadir al salón…" })]
      .concat(Object.keys(KINDS).map(function (k) { return el("option", { value: k, text: KINDS[k].label }); })));
    var printBtn = el("button", { type: "button", className: "btn btn--sm btn--ghost", text: "Imprimir plano" });
    var toolbar = el("div", { className: "plan__toolbar" }, [
      stats,
      el("div", { className: "plan__tools" }, [
        el("button", { type: "button", className: "btn btn--sm", "data-add": "redonda", text: "+ Mesa redonda" }),
        el("button", { type: "button", className: "btn btn--sm", "data-add": "rectangular", text: "+ Mesa rectangular" }),
        addSelect, printBtn
      ])
    ]);

    var hint = el("p", { className: "plan__hint" });
    var search = el("input", { type: "search", placeholder: "Buscar invitado", "aria-label": "Buscar invitado" });
    var filterSel = el("select", { "aria-label": "Mostrar" }, [
      el("option", { value: "pending", text: "Sin mesa" }), el("option", { value: "all", text: "Todos" })
    ]);
    var list = el("div", { className: "plan__guests", "aria-label": "Invitados" });

    var addName = el("input", { type: "text", maxlength: 120, placeholder: "Nombre y apellido", "aria-label": "Nombre del invitado" });
    var addSide = el("select", { "aria-label": "Lado" });
    var addMenu = el("select", { "aria-label": "Menú" }, Object.keys(MENUS).map(function (k) { return el("option", { value: k, text: MENUS[k][0] }); }));
    var addForm = el("form", { className: "plan__add", novalidate: true }, [
      addName, el("div", { className: "plan__add-row" }, [addSide, addMenu]),
      el("button", { type: "submit", className: "btn btn--sm", text: "Añadir invitado" })
    ]);
    var bulkText = el("textarea", { rows: 5, placeholder: "Un invitado por línea", "aria-label": "Lista de invitados" });
    var bulkSide = el("select", { "aria-label": "Lado de la lista" });
    var bulk = el("details", { className: "plan__bulk" }, [
      el("summary", { text: "Añadir una lista de golpe" }),
      el("form", { novalidate: true }, [bulkText, bulkSide, el("button", { type: "submit", className: "btn btn--sm btn--ghost", text: "Añadir todos" })])
    ]);

    var inspector = el("div", { className: "plan__inspector" });
    var side = el("aside", { className: "plan__side" }, [
      inspector, hint, el("div", { className: "plan__filter" }, [search, filterSel]), list, addForm, bulk
    ]);

    var stage = el("div", { className: "plan__stage" });
    var floor = el("div", { className: "plan__floor", "aria-label": "Plano del salón" }, [stage]);
    var legend = el("p", { className: "plan__legend" }, [
      "Arrastra las mesas para colocarlas; tócalas para editarlas. Letras en las sillas: ",
      el("b", { text: "V" }), " vegetariano · ", el("b", { text: "VG" }), " vegano · ", el("b", { text: "SG" }), " sin gluten · ",
      el("b", { text: "N" }), " infantil · ", el("b", { text: "!" }), " alergias (borde dorado = menú especial)."
    ]);
    var main = el("div", { className: "plan__main" }, [floor, legend]);
    var toastBox = el("div", { className: "plan__toast", role: "status" });
    var printList = el("div", { className: "plan__print" });

    var root = el("div", { className: "plan" }, [toolbar, el("div", { className: "plan__layout" }, [side, main]), toastBox, printList]);
    container.textContent = "";
    container.appendChild(root);

    function fillSideSelects() {
      var s = sides();
      [addSide, bulkSide].forEach(function (sel) {
        var v = sel.value || "comun";
        sel.textContent = "";
        Object.keys(s).forEach(function (k) { sel.appendChild(el("option", { value: k, text: s[k] })); });
        sel.value = v;
      });
    }

    // ---------- Escala del salón ----------
    function rescale() {
      var w = floor.clientWidth;
      if (w) stage.style.transform = "scale(" + w / STAGE_W + ")";
    }
    if (window.ResizeObserver) new ResizeObserver(rescale).observe(floor);
    else window.addEventListener("resize", rescale);

    var toastTimer;
    function toast(msg, bad) {
      toastBox.textContent = msg;
      toastBox.className = "plan__toast is-visible" + (bad ? " is-bad" : "");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastBox.className = "plan__toast"; }, 2600);
    }

    // ---------- Pintado ----------
    function chip(g) {
      var m = MENUS[g.menu] || MENUS.normal;
      var c = el("button", {
        type: "button", className: "guest guest--" + g.side + (selGuest === g.id ? " is-selected" : "") + (g.table_id ? " is-seated" : "") + (g.rsvp === "rechazado" ? " is-declined" : ""),
        draggable: "true", "data-guest": g.id, title: m[1] ? g.name + " · " + m[0] : g.name
      }, [g.name, m[1] ? el("span", { className: "guest__menu", text: m[1] }) : null]);
      return c;
    }

    function renderList() {
      var s = sides();
      var q = query.toLowerCase();
      var shown = guests.filter(function (g) {
        if (filter === "pending" && (g.table_id || g.rsvp === "rechazado")) return false;
        return !q || g.name.toLowerCase().indexOf(q) !== -1;
      });
      list.textContent = "";
      Object.keys(s).forEach(function (k) {
        var inGroup = shown.filter(function (g) { return g.side === k; });
        if (!inGroup.length) return;
        list.appendChild(el("div", { className: "guest-group" }, [
          el("p", { className: "guest-group__title guest-group__title--" + k, text: s[k] + " (" + inGroup.length + ")" }),
          el("div", { className: "guest-group__chips" }, inGroup.map(chip))
        ]));
      });
      if (!shown.length) {
        list.appendChild(el("p", { className: "plan__empty", text: !guests.length
          ? "Aún no hay invitados. Añádelos abajo."
          : filter === "pending" && !q ? "¡Todos tienen mesa! 🥂" : "Nadie coincide." }));
      }
    }

    function tableNode(t) {
      var s = size(t), seated = seatedAt(t.id);
      var node = el("div", {
        className: "ptable ptable--" + t.kind + (selTable === t.id ? " is-selected" : "") + (selGuest && isTable(t) ? " is-target" : "") +
          (isTable(t) && seated.length >= t.seats ? " is-full" : ""),
        "data-table": t.id, tabindex: "0", role: "button",
        "aria-label": (t.name || KINDS[t.kind].label) + (isTable(t) ? ", " + seated.length + " de " + t.seats + " plazas" : "")
      });
      node.style.left = t.x - s.w / 2 + "px";
      node.style.top = t.y - s.h / 2 + "px";
      node.style.width = s.w + "px";
      node.style.height = s.h + "px";

      node.appendChild(el("div", { className: "ptable__top" }, [
        el("strong", { text: t.name || KINDS[t.kind].label }),
        isTable(t) ? el("span", { text: seated.length + "/" + t.seats }) : null
      ]));

      if (isTable(t)) {
        for (var i = 0; i < t.seats; i++) {
          var p = seatPos(t, i), g = guestAt(t.id, i);
          var seat = el("div", {
            className: "pseat" + (g ? " is-taken pseat--" + g.side + (g.menu !== "normal" ? " has-menu" : "") + (selGuest === g.id ? " is-selected" : "") : ""),
            "data-seat": i, title: g ? g.name + (g.menu !== "normal" ? " · " + MENUS[g.menu][0] : "") : "Silla libre"
          }, [g ? initials(g.name) : ""]);
          if (g) { seat.setAttribute("data-guest", g.id); seat.draggable = true; }
          seat.style.left = s.w / 2 + p.x + "px";
          seat.style.top = s.h / 2 + p.y + "px";
          node.appendChild(seat);
        }
      }
      return node;
    }

    function renderFloor() {
      stage.textContent = "";
      tables.forEach(function (t) { stage.appendChild(tableNode(t)); });
      if (!tables.length) {
        stage.appendChild(el("p", { className: "plan__floor-empty", text: "El salón está vacío. Empieza añadiendo una mesa redonda o rectangular." }));
      }
      rescale();
    }

    function renderStats() {
      var coming = guests.filter(function (g) { return g.rsvp !== "rechazado"; });
      var seated = coming.filter(function (g) { return g.table_id; }).length;
      var tablesOnly = tables.filter(isTable);
      var places = tablesOnly.reduce(function (s, t) { return s + t.seats; }, 0);
      var special = coming.filter(function (g) { return g.menu !== "normal"; }).length;
      var confirmed = coming.filter(function (g) { return g.rsvp === "confirmado"; }).length;
      stats.textContent = "";
      [
        [coming.length, coming.length === 1 ? "invitado" : "invitados"],
        [seated, "sentados"],
        [coming.length - seated, "sin mesa"],
        [tablesOnly.length, tablesOnly.length === 1 ? "mesa" : "mesas"],
        [Math.max(0, places - seated), "plazas libres"],
        [confirmed, "confirmados"],
        [special, "menús especiales"]
      ].forEach(function (s) { stats.appendChild(el("span", null, [el("strong", { text: String(s[0]) }), " " + s[1]])); });

      var g = selGuest && byId(guests, selGuest);
      hint.textContent = g
        ? "Toca una mesa o una silla libre para sentar a " + g.name + ". Vuelve a tocarle para soltarle."
        : "Arrastra un invitado a una mesa o a una silla. En móvil: tócalo y después toca la mesa.";
    }

    function renderPrint() {
      printList.textContent = "";
      printList.appendChild(el("h3", { text: "Mesas · " + ui.coupleName(wedding) }));
      tables.filter(isTable).forEach(function (t) {
        var seated = seatedAt(t.id).sort(function (a, b) { return a.seat - b.seat; });
        printList.appendChild(el("div", { className: "plan__print-table" }, [
          el("h4", { text: (t.name || KINDS[t.kind].label) + " (" + seated.length + "/" + t.seats + ")" }),
          el("ol", null, seated.map(function (g) {
            return el("li", { text: g.name + (g.menu !== "normal" ? " — " + MENUS[g.menu][0] : "") + (g.notes ? " (" + g.notes + ")" : "") });
          }))
        ]));
      });
    }

    function field(label, input) { return el("label", { className: "plan__field" }, [el("span", { text: label }), input]); }
    function select(options, value) {
      var s = el("select", null, Object.keys(options).map(function (k) {
        return el("option", { value: k, text: Array.isArray(options[k]) ? options[k][0] : options[k] });
      }));
      s.value = value;
      return s;
    }

    function renderInspector() {
      inspector.textContent = "";
      var t = selTable && byId(tables, selTable);
      var g = selGuest && byId(guests, selGuest);

      if (g) {
        var name = el("input", { type: "text", maxlength: 120, value: g.name });
        var sideSel = select(sides(), g.side), menu = select(MENUS, g.menu), rsvp = select(RSVP, g.rsvp);
        var notes = el("input", { type: "text", maxlength: 300, value: g.notes, placeholder: "Alergias, silla de bebé, movilidad…" });
        var at = g.table_id && byId(tables, g.table_id);
        inspector.appendChild(el("form", { className: "plan__card", "data-form": "guest", novalidate: true }, [
          el("div", { className: "plan__card-head" }, [
            el("h3", { text: g.name }),
            el("button", { type: "button", className: "plan__close", "data-close": "1", "aria-label": "Cerrar", text: "×" })
          ]),
          el("p", { className: "plan__card-sub", text: at ? "Sentado en " + (at.name || KINDS[at.kind].label) + ", silla " + (g.seat + 1) : "Sin mesa todavía" }),
          field("Nombre", name),
          el("div", { className: "plan__card-row" }, [field("Lado", sideSel), field("Asistencia", rsvp)]),
          field("Menú", menu),
          field("Notas", notes),
          el("div", { className: "plan__card-actions" }, [
            el("button", { type: "submit", className: "btn btn--sm", text: "Guardar" }),
            at ? el("button", { type: "button", className: "btn btn--sm btn--ghost", "data-unseat": g.id, text: "Quitar de la mesa" }) : null,
            el("button", { type: "button", className: "btn btn--sm btn--danger", "data-delguest": g.id, text: "Eliminar" })
          ])
        ]));
        inspector.lastChild.addEventListener("submit", function (e) {
          e.preventDefault();
          if (!name.value.trim()) return name.focus();
          update("wedding_guests", g, { name: name.value.trim(), side: sideSel.value, menu: menu.value, rsvp: rsvp.value, notes: notes.value.trim() }, "Invitado guardado.");
        });
        return;
      }

      if (t) {
        var tname = el("input", { type: "text", maxlength: 60, value: t.name, placeholder: KINDS[t.kind].label });
        var seats = isTable(t) ? el("input", { type: "number", min: 2, max: 30, step: 1, value: t.seats }) : null;
        var seated = seatedAt(t.id).sort(function (a, b) { return a.seat - b.seat; });
        inspector.appendChild(el("form", { className: "plan__card", novalidate: true }, [
          el("div", { className: "plan__card-head" }, [
            el("h3", { text: t.name || KINDS[t.kind].label }),
            el("button", { type: "button", className: "plan__close", "data-close": "1", "aria-label": "Cerrar", text: "×" })
          ]),
          el("p", { className: "plan__card-sub", text: KINDS[t.kind].label + (isTable(t) ? " · " + seated.length + " de " + t.seats + " plazas" : "") }),
          el("div", { className: "plan__card-row" + (seats ? " plan__card-row--table" : " plan__card-row--one") }, [field("Nombre", tname), seats ? field("Plazas", seats) : null]),
          seated.length ? el("ol", { className: "plan__seated" }, seated.map(function (x) {
            return el("li", null, [
              el("button", { type: "button", className: "plan__link", "data-pick": x.id, text: x.name }),
              x.menu !== "normal" ? el("small", { text: MENUS[x.menu][0] }) : null,
              el("button", { type: "button", className: "plan__close", "data-unseat": x.id, "aria-label": "Quitar a " + x.name, text: "×" })
            ]);
          })) : isTable(t) ? el("p", { className: "plan__card-sub", text: "Mesa vacía: arrastra invitados hasta ella." }) : null,
          el("div", { className: "plan__card-actions" }, [
            el("button", { type: "submit", className: "btn btn--sm", text: "Guardar" }),
            el("button", { type: "button", className: "btn btn--sm btn--danger", "data-deltable": t.id, text: "Eliminar" })
          ])
        ]));
        inspector.lastChild.addEventListener("submit", function (e) {
          e.preventDefault();
          var patch = { name: tname.value.trim() };
          if (seats) {
            var n = Number(seats.value);
            if (!Number.isInteger(n) || n < 2 || n > 30) { toast("Entre 2 y 30 plazas.", true); return seats.focus(); }
            patch.seats = n;
            var out = seated.filter(function (x) { return x.seat >= n; });
            if (out.length && !confirm(out.length + " invitado(s) se quedarán sin silla. ¿Continuar?")) return;
            if (out.length) {
              out.forEach(function (x) { x.table_id = null; x.seat = null; });
              sb.from("wedding_guests").update({ table_id: null, seat: null }).eq("table_id", t.id).gte("seat", n)
                .then(function (r) { if (r.error) fail(r.error); });
            }
            var c = clamp(Object.assign({}, t, { seats: n }), t.x, t.y);
            patch.x = c.x; patch.y = c.y;
          }
          update("wedding_tables", t, patch, "Mesa guardada.");
        });
        return;
      }

    }

    function render() {
      renderStats();
      renderList();
      renderFloor();
      renderInspector();
      renderPrint();
    }

    // ---------- Datos ----------
    function load() {
      return Promise.all([
        sb.from("wedding_tables").select("*").eq("wedding_id", wedding.id).order("created_at"),
        sb.from("wedding_guests").select("*").eq("wedding_id", wedding.id).order("created_at")
      ]).then(function (res) {
        if (res[0].error || res[1].error) return toast(auth.friendly(res[0].error || res[1].error), true);
        tables = res[0].data;
        guests = res[1].data;
        if (selGuest && !byId(guests, selGuest)) selGuest = null;
        if (selTable && !byId(tables, selTable)) selTable = null;
        render();
      });
    }

    function update(table, row, patch, okMsg) {
      Object.assign(row, patch);
      render();
      return sb.from(table).update(patch).eq("id", row.id).then(function (r) {
        if (r.error) return fail(r.error);
        if (okMsg) toast(okMsg);
      });
    }

    function seatGuest(gid, tid, seatIdx) {
      var g = byId(guests, gid), t = byId(tables, tid);
      if (!g || !t) return;
      if (!isTable(t)) return toast("En «" + (t.name || KINDS[t.kind].label) + "» no se sienta nadie.", true);
      if (seatIdx == null || guestAt(tid, seatIdx)) {
        if (g.table_id === tid && seatIdx == null) return;
        seatIdx = null;
        for (var i = 0; i < t.seats; i++) if (!guestAt(tid, i)) { seatIdx = i; break; }
        if (seatIdx == null) return toast("«" + (t.name || "La mesa") + "» ya está completa (" + t.seats + " plazas).", true);
      }
      selGuest = null;
      update("wedding_guests", g, { table_id: tid, seat: seatIdx });
    }

    function unseat(gid) {
      var g = byId(guests, gid);
      if (g) update("wedding_guests", g, { table_id: null, seat: null });
    }

    function addElement(kind) {
      var k = KINDS[kind];
      var count = tables.filter(function (t) { return t.kind === kind; }).length;
      var n = tables.length;
      var row = {
        wedding_id: wedding.id, kind: kind, seats: k.seats || 0,
        name: kind === "redonda" || kind === "rectangular"
          ? "Mesa " + (tables.filter(isTable).length + 1)
          : count ? k.label + " " + (count + 1) : k.label
      };
      var c = clamp(row, 140 + (n % 5) * 180, 130 + (Math.floor(n / 5) % 3) * 180);
      row.x = c.x; row.y = c.y;
      sb.from("wedding_tables").insert(row).select().single().then(function (r) {
        if (r.error) return fail(r.error);
        tables.push(r.data);
        selGuest = null;
        selTable = r.data.id;
        render();
        toast(row.name + " añadida. Arrástrala a su sitio.");
      });
    }

    function addGuests(names, sideKey, menu) {
      var rows = names.map(function (n) { return { wedding_id: wedding.id, name: n.slice(0, 120), side: sideKey, menu: menu || "normal" }; });
      return sb.from("wedding_guests").insert(rows).select().then(function (r) {
        if (r.error) return fail(r.error), false;
        guests = guests.concat(r.data);
        render();
        toast(rows.length === 1 ? rows[0].name + " añadido." : rows.length + " invitados añadidos.");
        return true;
      });
    }

    // ---------- Eventos ----------
    toolbar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-add]");
      if (b) addElement(b.getAttribute("data-add"));
    });
    addSelect.addEventListener("change", function () {
      if (addSelect.value) addElement(addSelect.value);
      addSelect.value = "";
    });
    printBtn.addEventListener("click", function () {
      document.body.classList.add("printing-plan");
      window.print();
      setTimeout(function () { document.body.classList.remove("printing-plan"); }, 500);
    });

    search.addEventListener("input", function () { query = search.value.trim(); renderList(); });
    filterSel.addEventListener("change", function () { filter = filterSel.value; renderList(); });

    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = addName.value.trim();
      if (!n) return addName.focus();
      addGuests([n], addSide.value, addMenu.value).then(function (ok) {
        if (ok) { addName.value = ""; addMenu.value = "normal"; addName.focus(); }
      });
    });
    bulk.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var names = bulkText.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) return bulkText.focus();
      if (names.length > 300) return toast("Como mucho 300 de una vez.", true);
      addGuests(names, bulkSide.value).then(function (ok) { if (ok) bulkText.value = ""; });
    });

    // Tocar un invitado de la lista: seleccionarlo (para sentarle y ver su ficha).
    list.addEventListener("click", function (e) {
      var c = e.target.closest("[data-guest]");
      if (!c) return;
      var id = c.getAttribute("data-guest");
      selGuest = selGuest === id ? null : id;
      selTable = null;
      render();
    });

    inspector.addEventListener("click", function (e) {
      var b;
      if (e.target.closest("[data-close]")) { selGuest = null; selTable = null; return render(); }
      if ((b = e.target.closest("[data-unseat]"))) return unseat(b.getAttribute("data-unseat"));
      if ((b = e.target.closest("[data-pick]"))) { selGuest = b.getAttribute("data-pick"); selTable = null; return render(); }
      if ((b = e.target.closest("[data-delguest]"))) {
        var g = byId(guests, b.getAttribute("data-delguest"));
        if (!g || !confirm("¿Eliminar a " + g.name + " de la lista de invitados?")) return;
        guests = guests.filter(function (x) { return x !== g; });
        selGuest = null;
        render();
        sb.from("wedding_guests").delete().eq("id", g.id).then(function (r) { if (r.error) fail(r.error); });
      }
      if ((b = e.target.closest("[data-deltable]"))) {
        var t = byId(tables, b.getAttribute("data-deltable"));
        var n = t ? seatedAt(t.id).length : 0;
        if (!t || !confirm("¿Eliminar «" + (t.name || KINDS[t.kind].label) + "»?" + (n ? " Sus " + n + " invitados volverán a la lista." : ""))) return;
        tables = tables.filter(function (x) { return x !== t; });
        guests.forEach(function (x) { if (x.table_id === t.id) { x.table_id = null; x.seat = null; } });
        selTable = null;
        render();
        sb.from("wedding_tables").delete().eq("id", t.id).then(function (r) { if (r.error) fail(r.error); });
      }
    });

    // Arrastrar invitados (escritorio): desde la lista o desde una silla ocupada.
    root.addEventListener("dragstart", function (e) {
      var c = e.target.closest && e.target.closest("[data-guest]");
      if (!c) return;
      e.dataTransfer.setData("text/plain", c.getAttribute("data-guest"));
      e.dataTransfer.effectAllowed = "move";
    });
    stage.addEventListener("dragover", function (e) {
      var t = e.target.closest("[data-table]");
      stage.querySelectorAll(".is-over").forEach(function (n) { if (n !== t) n.classList.remove("is-over"); });
      if (t) { e.preventDefault(); t.classList.add("is-over"); }
    });
    stage.addEventListener("dragleave", function (e) {
      var t = e.target.closest("[data-table]");
      if (t && !t.contains(e.relatedTarget)) t.classList.remove("is-over");
    });
    stage.addEventListener("drop", function (e) {
      var t = e.target.closest("[data-table]");
      if (!t) return;
      e.preventDefault();
      var s = e.target.closest("[data-seat]");
      seatGuest(e.dataTransfer.getData("text/plain"), t.getAttribute("data-table"), s && !s.classList.contains("is-taken") ? Number(s.getAttribute("data-seat")) : null);
    });
    list.addEventListener("dragover", function (e) { e.preventDefault(); list.classList.add("is-over"); });
    list.addEventListener("dragleave", function () { list.classList.remove("is-over"); });
    list.addEventListener("drop", function (e) {
      e.preventDefault();
      list.classList.remove("is-over");
      var g = byId(guests, e.dataTransfer.getData("text/plain"));
      if (g && g.table_id) unseat(g.id);
    });

    // Mover mesas con el puntero (ratón y táctil) y tocar mesas/sillas.
    var drag = null;
    stage.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var node = e.target.closest("[data-table]");
      if (!node || e.target.closest(".pseat.is-taken")) return;
      var t = byId(tables, node.getAttribute("data-table"));
      var scale = floor.clientWidth / STAGE_W;
      drag = { t: t, node: node, sx: e.clientX, sy: e.clientY, x: t.x, y: t.y, scale: scale, moved: false, target: e.target };
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* sin captura también funciona */ }
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.sx) / drag.scale, dy = (e.clientY - drag.sy) / drag.scale;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;
      drag.node.classList.add("is-dragging");
      var c = clamp(drag.t, drag.x + dx, drag.y + dy), s = size(drag.t);
      drag.t.x = c.x; drag.t.y = c.y;
      drag.node.style.left = c.x - s.w / 2 + "px";
      drag.node.style.top = c.y - s.h / 2 + "px";
    });
    function endDrag() {
      if (!drag) return;
      var d = drag;
      drag = null;
      d.node.classList.remove("is-dragging");
      if (d.moved) {
        if (d.t.x !== d.x || d.t.y !== d.y) update("wedding_tables", d.t, { x: d.t.x, y: d.t.y });
        return;
      }
      // Ha sido un toque, no un arrastre.
      var s = d.target.closest("[data-seat]");
      if (selGuest) return seatGuest(selGuest, d.t.id, s ? Number(s.getAttribute("data-seat")) : null);
      selTable = selTable === d.t.id ? null : d.t.id;
      render();
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", function () {
      if (drag) { drag.t.x = drag.x; drag.t.y = drag.y; drag = null; renderFloor(); }
    });

    // Tocar a un invitado ya sentado: abrir su ficha.
    stage.addEventListener("click", function (e) {
      var s = e.target.closest(".pseat.is-taken");
      if (!s) return;
      var id = s.getAttribute("data-guest");
      // Con otra persona seleccionada: sentarla en esa mesa (en la primera silla libre).
      if (selGuest && selGuest !== id) return seatGuest(selGuest, s.closest("[data-table]").getAttribute("data-table"), null);
      selGuest = selGuest === id ? null : id;
      selTable = null;
      render();
    });
    stage.addEventListener("keydown", function (e) {
      var node = e.target.closest("[data-table]");
      if (!node || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      var id = node.getAttribute("data-table");
      if (selGuest) return seatGuest(selGuest, id, null);
      selTable = selTable === id ? null : id;
      render();
    });

    fillSideSelects();
    render();
    load();

    return {
      setWedding: function (w) { wedding = w; fillSideSelects(); render(); }
    };
  }

  window.LAmore.seating = { plan: seatingPlan };
})();
