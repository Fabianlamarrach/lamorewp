/* ==========================================================
   Plan de mesas de una boda (panel de pareja y de superadmin).
   - Salón visto desde arriba (suelo de madera): lienzo lógico de
     1000 x 625 que se escala al ancho disponible. Mesas y elementos
     (pista, barra…) se arrastran para colocarlos; la posición se
     guarda en wedding_tables.
   - Bandeja inferior con dos pestañas: «Invitados» (agrupados por
     familia / grupo, con su color) y «Elementos» (añadir al salón).
   - Invitados: se arrastran a una mesa o a una silla concreta
     (en móvil: tocar invitado y después mesa o silla).
   - Al tocar una mesa o un invitado se abre su ficha flotante.
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
  // Colores de grupo: oscuros para que las iniciales blancas se lean sobre la madera.
  var PALETTE = ["#8e3b52", "#3f5a7a", "#4f7a5a", "#a0652f", "#6b4f8a", "#2f7880", "#a34b3b", "#5d6b2f", "#7a4f6a", "#4a6b9a"];
  var SIDE_COLORS = { p1: "#a8586a", p2: "#4f6f8a", comun: "#94743a" };

  function isTable(t) { return t.kind === "redonda" || t.kind === "rectangular"; }

  function size(t) {
    if (t.kind === "redonda") { var d = 64 + t.seats * 4; return { w: d, h: d }; }
    if (t.kind === "rectangular") return { w: Math.max(2, Math.ceil(t.seats / 2)) * 34 + 16, h: 54 };
    return { w: KINDS[t.kind].w, h: KINDS[t.kind].h };
  }

  // Posición de la silla i respecto al centro de la mesa (y giro para mirar a la mesa).
  function seatPos(t, i) {
    var s = size(t);
    if (t.kind === "redonda") {
      var a = (i / t.seats) * Math.PI * 2 - Math.PI / 2, r = s.w / 2 + 15;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: a * 180 / Math.PI + 90 };
    }
    var n = Math.ceil(t.seats / 2), top = i < n, j = top ? i : i - n;
    return { x: -s.w / 2 + 25 + j * 34, y: top ? -s.h / 2 - 15 : s.h / 2 + 15, rot: top ? 0 : 180 };
  }
  // Plato (cubierto) de la silla i, sobre el mantel.
  function platePos(t, i) {
    var s = size(t);
    if (t.kind === "redonda") {
      var a = (i / t.seats) * Math.PI * 2 - Math.PI / 2, r = s.w / 2 - 12;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }
    var p = seatPos(t, i);
    return { x: p.x, y: p.y < 0 ? -s.h / 2 + 12 : s.h / 2 - 12 };
  }

  // Caja que ocupa (con sillas) para que no se salga del salón.
  function extent(t) {
    var s = size(t), pad = isTable(t) ? 30 : 0;
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
  function firstName(name) { return name.trim().split(/\s+/)[0]; }
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Lo que se ve en el centro de la mesa: el número si se llama «Mesa 7», si no el nombre.
  function badgeText(t) {
    var name = (t.name || "").trim();
    var m = name.match(/^mesa\s*(\d{1,3})$/i) || name.match(/^(\d{1,3})$/);
    return m ? { text: m[1], num: true } : { text: name || "Mesa", num: false };
  }

  function seatingPlan(container, wedding) {
    var tables = [], guests = [];
    var selGuest = null, selTable = null;
    var filter = "pending", query = "", tab = "invitados";
    var hasGroup = false; // la columna group_name existe (migración aplicada)

    function sides() {
      return {
        p1: "Invitados de " + (wedding.partner1_name || "la pareja (1)"),
        p2: "Invitados de " + (wedding.partner2_name || "la pareja (2)"),
        comun: "Comunes"
      };
    }
    function groupOf(g) {
      var name = hasGroup && g.group_name ? g.group_name.trim() : "";
      if (name) return { key: "g:" + name.toLowerCase(), label: name, color: PALETTE[hash(name.toLowerCase()) % PALETTE.length], named: true };
      return { key: "s:" + g.side, label: sides()[g.side] || "Invitados", color: SIDE_COLORS[g.side] || SIDE_COLORS.comun, named: false };
    }
    function groupNames() {
      var seen = {}, out = [];
      guests.forEach(function (g) {
        var n = (g.group_name || "").trim();
        if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); }
      });
      return out.sort(function (a, b) { return a.localeCompare(b, "es"); });
    }
    function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
    function seatedAt(tid) { return guests.filter(function (g) { return g.table_id === tid; }); }
    function guestAt(tid, i) { return guests.filter(function (g) { return g.table_id === tid && g.seat === i; })[0]; }
    function tableName(t) { return t.name || KINDS[t.kind].label; }
    function fail(err) { toast(auth.friendly(err), true); load(); }

    // ---------- Estructura ----------
    var stats = el("p", { className: "plan__stats" });
    var printBtn = el("button", { type: "button", className: "btn btn--sm btn--ghost", text: "Imprimir plano" });
    var toolbar = el("div", { className: "plan__toolbar" }, [stats, el("div", { className: "plan__tools" }, [printBtn])]);

    var stage = el("div", { className: "plan__stage" });
    var floor = el("div", { className: "plan__floor", "aria-label": "Plano del salón" }, [stage]);
    var inspector = el("div", { className: "plan__inspector" });
    var hint = el("p", { className: "plan__hint", role: "status" });
    var room = el("div", { className: "plan__room" }, [floor, hint, inspector]);

    // Bandeja inferior
    var tabGuests = el("button", { type: "button", className: "plan__tab", role: "tab", "data-tab": "invitados", text: "Invitados" });
    var tabElems = el("button", { type: "button", className: "plan__tab", role: "tab", "data-tab": "elementos", text: "Elementos" });
    var search = el("input", { type: "search", placeholder: "Buscar", "aria-label": "Buscar invitado o grupo" });
    var filterSel = el("select", { "aria-label": "Mostrar" }, [
      el("option", { value: "pending", text: "Sin mesa" }), el("option", { value: "all", text: "Todos" })
    ]);
    var trayHead = el("div", { className: "plan__tray-head" }, [
      el("div", { className: "plan__tabs", role: "tablist", "aria-label": "Bandeja" }, [tabGuests, tabElems]),
      el("label", { className: "plan__search" }, [search]),
      filterSel
    ]);
    var list = el("div", { className: "plan__groups", "aria-label": "Invitados" });

    var groupList = el("datalist", { id: "plan-groups-" + Math.random().toString(36).slice(2, 8) });
    var addName = el("input", { type: "text", maxlength: 120, placeholder: "Nombre y apellido", "aria-label": "Nombre del invitado" });
    var addGroup = el("input", { type: "text", maxlength: 60, placeholder: "Grupo / familia (opcional)", "aria-label": "Grupo o familia", list: groupList.id });
    var addSide = el("select", { "aria-label": "Lado" });
    var addMenu = el("select", { "aria-label": "Menú" }, Object.keys(MENUS).map(function (k) { return el("option", { value: k, text: MENUS[k][0] }); }));
    var addForm = el("form", { className: "plan__add", novalidate: true }, [
      addName, addGroup, addSide, addMenu,
      el("button", { type: "submit", className: "btn btn--sm", text: "Añadir" })
    ]);
    var bulkText = el("textarea", { rows: 4, placeholder: "Un invitado por línea", "aria-label": "Lista de invitados" });
    var bulkGroup = el("input", { type: "text", maxlength: 60, placeholder: "Grupo / familia (opcional)", "aria-label": "Grupo de la lista", list: groupList.id });
    var bulkSide = el("select", { "aria-label": "Lado de la lista" });
    var bulk = el("details", { className: "plan__bulk" }, [
      el("summary", { text: "Añadir una lista de golpe" }),
      el("form", { novalidate: true }, [bulkText, el("div", { className: "plan__bulk-row" }, [bulkGroup, bulkSide,
        el("button", { type: "submit", className: "btn btn--sm btn--ghost", text: "Añadir todos" })])])
    ]);
    var paneGuests = el("div", { className: "plan__pane", role: "tabpanel" }, [list, addForm, bulk, groupList]);

    var paneElems = el("div", { className: "plan__pane plan__elements", role: "tabpanel" }, Object.keys(KINDS).map(function (k) {
      return el("button", { type: "button", className: "plan__tile", "data-add": k }, [
        el("span", { className: "plan__tile-pic plan__tile-pic--" + k, "aria-hidden": "true" }),
        el("span", { text: KINDS[k].label })
      ]);
    }));

    var tray = el("div", { className: "plan__tray" }, [trayHead, paneGuests, paneElems]);
    var legend = el("p", { className: "plan__legend" }, [
      "Arrastra las mesas para colocarlas y a los invitados hasta su silla (en móvil: toca al invitado y después la mesa). Letras junto a la silla: ",
      el("b", { text: "V" }), " vegetariano · ", el("b", { text: "VG" }), " vegano · ", el("b", { text: "SG" }), " sin gluten · ",
      el("b", { text: "N" }), " infantil · ", el("b", { text: "!" }), " alergias."
    ]);
    var toastBox = el("div", { className: "plan__toast", role: "status" });
    var printList = el("div", { className: "plan__print" });

    var root = el("div", { className: "plan" }, [toolbar, room, tray, legend, toastBox, printList]);
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
    function showGroupInputs() {
      addGroup.hidden = !hasGroup;
      bulkGroup.hidden = !hasGroup;
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
    function avatar(g) {
      var m = MENUS[g.menu] || MENUS.normal, gr = groupOf(g);
      var b = el("button", {
        type: "button",
        className: "gav" + (selGuest === g.id ? " is-selected" : "") + (g.table_id ? " is-seated" : "") + (g.rsvp === "rechazado" ? " is-declined" : ""),
        draggable: "true", "data-guest": g.id,
        title: g.name + (m[1] ? " · " + m[0] : "") + (g.table_id ? " · sentado" : "") + (g.rsvp === "rechazado" ? " · no viene" : "")
      }, [
        el("span", { className: "gav__circle" }, [initials(g.name), m[1] ? el("span", { className: "gav__menu", text: m[1] }) : null]),
        el("span", { className: "gav__name", text: firstName(g.name) })
      ]);
      b.style.setProperty("--c", gr.color);
      return b;
    }

    function renderList() {
      var q = query.toLowerCase();
      var shown = guests.filter(function (g) {
        if (filter === "pending" && (g.table_id || g.rsvp === "rechazado")) return false;
        return !q || g.name.toLowerCase().indexOf(q) !== -1 || (g.group_name || "").toLowerCase().indexOf(q) !== -1;
      });
      var groups = {}, order = [];
      shown.forEach(function (g) {
        var gr = groupOf(g);
        if (!groups[gr.key]) { groups[gr.key] = { info: gr, items: [] }; order.push(gr.key); }
        groups[gr.key].items.push(g);
      });
      var sideOrder = ["s:p1", "s:p2", "s:comun"];
      order.sort(function (a, b) {
        var A = groups[a].info, B = groups[b].info;
        if (A.named !== B.named) return A.named ? -1 : 1;
        if (A.named) return A.label.localeCompare(B.label, "es");
        return sideOrder.indexOf(a) - sideOrder.indexOf(b);
      });

      list.textContent = "";
      order.forEach(function (k) {
        var gr = groups[k];
        var card = el("div", { className: "gcard" }, [
          el("p", { className: "gcard__title" }, [
            el("span", { className: "gcard__icon", "aria-hidden": "true" }),
            el("span", { className: "gcard__label", text: gr.info.label }),
            el("span", { className: "gcard__count", text: " · " + gr.items.length })
          ]),
          el("div", { className: "gcard__people" }, gr.items.map(avatar))
        ]);
        card.style.setProperty("--c", gr.info.color);
        list.appendChild(card);
      });
      if (!shown.length) {
        list.appendChild(el("p", { className: "plan__empty", text: !guests.length
          ? "Aún no hay invitados. Añádelos aquí debajo."
          : filter === "pending" && !q ? "¡Todos tienen mesa! 🥂" : "Nadie coincide." }));
      }

      groupList.textContent = "";
      groupNames().forEach(function (n) { groupList.appendChild(el("option", { value: n })); });
    }

    function tableNode(t) {
      var s = size(t), seated = seatedAt(t.id), full = isTable(t) && seated.length >= t.seats;
      var node = el("div", {
        className: "ptable ptable--" + t.kind + (selTable === t.id ? " is-selected" : "") + (selGuest && isTable(t) ? " is-target" : "") +
          (full ? " is-full" : ""),
        "data-table": t.id, tabindex: "0", role: "button",
        "aria-label": tableName(t) + (isTable(t) ? ", " + seated.length + " de " + t.seats + " plazas" : "")
      });
      node.style.left = t.x - s.w / 2 + "px";
      node.style.top = t.y - s.h / 2 + "px";
      node.style.width = s.w + "px";
      node.style.height = s.h + "px";

      if (isTable(t)) {
        var i, p;
        // Sillas (debajo del mantel) con el invitado sentado encima.
        for (i = 0; i < t.seats; i++) {
          p = seatPos(t, i);
          var g = guestAt(t.id, i), gr = g && groupOf(g), m = g && (MENUS[g.menu] || MENUS.normal);
          var seat = el("div", {
            className: "pseat" + (g ? " is-taken" + (g.menu !== "normal" ? " has-menu" : "") + (selGuest === g.id ? " is-selected" : "") : ""),
            "data-seat": i, title: g ? g.name + (m[1] ? " · " + m[0] : "") : "Silla " + (i + 1) + " libre"
          }, [
            el("span", { className: "pseat__chair", "aria-hidden": "true" }),
            g ? el("span", { className: "pseat__av" }, [initials(g.name), m[1] ? el("span", { className: "pseat__menu", text: m[1] }) : null]) : null
          ]);
          if (g) { seat.setAttribute("data-guest", g.id); seat.draggable = true; seat.style.setProperty("--c", gr.color); }
          seat.style.left = s.w / 2 + p.x + "px";
          seat.style.top = s.h / 2 + p.y + "px";
          seat.style.setProperty("--r", p.rot + "deg");
          node.appendChild(seat);
        }
        node.appendChild(el("div", { className: "ptable__cloth", "aria-hidden": "true" }));
        for (i = 0; i < t.seats; i++) {
          p = platePos(t, i);
          var plate = el("span", { className: "pplate" + (guestAt(t.id, i) ? " is-set" : ""), "aria-hidden": "true" });
          plate.style.left = s.w / 2 + p.x + "px";
          plate.style.top = s.h / 2 + p.y + "px";
          node.appendChild(plate);
        }
        var b = badgeText(t);
        node.appendChild(el("div", { className: "ptable__badge" + (b.num ? "" : " ptable__badge--name") }, [el("span", { text: b.text })]));
        node.appendChild(el("div", { className: "ptable__label" }, [
          el("strong", { text: tableName(t) }), el("span", { text: seated.length + "/" + t.seats })
        ]));
      } else {
        node.appendChild(el("div", { className: "ptable__top" }, [el("strong", { text: tableName(t) })]));
      }
      return node;
    }

    function renderFloor() {
      stage.textContent = "";
      tables.forEach(function (t) { stage.appendChild(tableNode(t)); });
      if (!tables.length) {
        stage.appendChild(el("p", { className: "plan__floor-empty" }, [
          el("span", { text: "El salón está vacío" }),
          el("small", { text: "Añade mesas desde la pestaña «Elementos» de abajo." })
        ]));
      }
      floor.classList.toggle("is-picking", !!selGuest);
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
      hint.textContent = g ? "Toca una mesa o una silla libre para sentar a " + g.name + "." : "";
      hint.classList.toggle("is-visible", !!g);
    }

    function renderTabs() {
      [tabGuests, tabElems].forEach(function (b) {
        var on = b.getAttribute("data-tab") === tab;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.classList.toggle("is-active", on);
      });
      paneGuests.hidden = tab !== "invitados";
      paneElems.hidden = tab !== "elementos";
      search.parentNode.hidden = tab !== "invitados";
      filterSel.hidden = tab !== "invitados";
    }

    function renderPrint() {
      printList.textContent = "";
      printList.appendChild(el("h3", { text: "Mesas · " + ui.coupleName(wedding) }));
      tables.filter(isTable).forEach(function (t) {
        var seated = seatedAt(t.id).sort(function (a, b) { return a.seat - b.seat; });
        printList.appendChild(el("div", { className: "plan__print-table" }, [
          el("h4", { text: tableName(t) + " (" + seated.length + "/" + t.seats + ")" }),
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
    function cardHead(title, sub, color) {
      var dot = color ? el("span", { className: "plan__card-dot", "aria-hidden": "true" }) : null;
      if (dot) dot.style.background = color;
      return [
        el("div", { className: "plan__card-head" }, [
          el("h3", null, [dot, title]),
          el("button", { type: "button", className: "plan__close", "data-close": "1", "aria-label": "Cerrar", text: "×" })
        ]),
        el("p", { className: "plan__card-sub", text: sub })
      ];
    }

    function renderInspector() {
      inspector.textContent = "";
      var t = selTable && byId(tables, selTable);
      var g = selGuest && byId(guests, selGuest);
      room.classList.toggle("has-card", !!(t || g));

      if (g) {
        var name = el("input", { type: "text", maxlength: 120, value: g.name });
        var group = hasGroup ? el("input", { type: "text", maxlength: 60, value: g.group_name || "", placeholder: "Familia, amigos de…", list: groupList.id }) : null;
        var sideSel = select(sides(), g.side), menu = select(MENUS, g.menu), rsvp = select(RSVP, g.rsvp);
        var notes = el("input", { type: "text", maxlength: 300, value: g.notes, placeholder: "Alergias, silla de bebé, movilidad…" });
        var at = g.table_id && byId(tables, g.table_id);
        inspector.appendChild(el("form", { className: "plan__card", novalidate: true }, cardHead(g.name,
          at ? "Sentado en " + tableName(at) + ", silla " + (g.seat + 1) : "Sin mesa todavía", groupOf(g).color).concat([
          field("Nombre", name),
          group ? field("Grupo / familia", group) : null,
          el("div", { className: "plan__card-row" }, [field("Lado", sideSel), field("Asistencia", rsvp)]),
          field("Menú", menu),
          field("Notas", notes),
          el("div", { className: "plan__card-actions" }, [
            el("button", { type: "submit", className: "btn btn--sm", text: "Guardar" }),
            at ? el("button", { type: "button", className: "btn btn--sm btn--ghost", "data-unseat": g.id, text: "Quitar de la mesa" }) : null,
            el("button", { type: "button", className: "btn btn--sm btn--danger", "data-delguest": g.id, text: "Eliminar" })
          ])
        ])));
        inspector.lastChild.addEventListener("submit", function (e) {
          e.preventDefault();
          if (!name.value.trim()) return name.focus();
          var patch = { name: name.value.trim(), side: sideSel.value, menu: menu.value, rsvp: rsvp.value, notes: notes.value.trim() };
          if (group) patch.group_name = group.value.trim();
          update("wedding_guests", g, patch, "Invitado guardado.");
        });
        return;
      }

      if (t) {
        var tname = el("input", { type: "text", maxlength: 60, value: t.name, placeholder: KINDS[t.kind].label });
        var seats = isTable(t) ? el("input", { type: "number", min: 2, max: 30, step: 1, value: t.seats }) : null;
        var seated = seatedAt(t.id).sort(function (a, b) { return a.seat - b.seat; });
        inspector.appendChild(el("form", { className: "plan__card", novalidate: true }, cardHead(tableName(t),
          KINDS[t.kind].label + (isTable(t) ? " · " + seated.length + " de " + t.seats + " plazas" : "")).concat([
          el("div", { className: "plan__card-row" + (seats ? " plan__card-row--table" : " plan__card-row--one") }, [field("Nombre", tname), seats ? field("Plazas", seats) : null]),
          seated.length ? el("ol", { className: "plan__seated" }, seated.map(function (x) {
            var dot = el("span", { className: "plan__card-dot", "aria-hidden": "true" });
            dot.style.background = groupOf(x).color;
            return el("li", null, [
              dot,
              el("button", { type: "button", className: "plan__link", "data-pick": x.id, text: x.name }),
              x.menu !== "normal" ? el("small", { text: MENUS[x.menu][0] }) : null,
              el("button", { type: "button", className: "plan__close", "data-unseat": x.id, "aria-label": "Quitar a " + x.name, text: "×" })
            ]);
          })) : isTable(t) ? el("p", { className: "plan__card-sub", text: "Mesa vacía: arrastra invitados hasta ella." }) : null,
          el("div", { className: "plan__card-actions" }, [
            el("button", { type: "submit", className: "btn btn--sm", text: "Guardar" }),
            el("button", { type: "button", className: "btn btn--sm btn--danger", "data-deltable": t.id, text: "Eliminar" })
          ])
        ])));
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
      }
    }

    function render() {
      renderStats();
      renderTabs();
      renderList();
      renderFloor();
      renderInspector();
      renderPrint();
    }

    // ---------- Datos ----------
    function load() {
      return Promise.all([
        sb.from("wedding_tables").select("*").eq("wedding_id", wedding.id).order("created_at"),
        sb.from("wedding_guests").select("*").eq("wedding_id", wedding.id).order("created_at"),
        // ¿Está ya la columna de grupo? (si la migración aún no se ha aplicado, el plan funciona sin grupos)
        sb.from("wedding_guests").select("group_name").limit(1)
      ]).then(function (res) {
        if (res[0].error || res[1].error) return toast(auth.friendly(res[0].error || res[1].error), true);
        tables = res[0].data;
        guests = res[1].data;
        hasGroup = !res[2].error;
        showGroupInputs();
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
      if (!isTable(t)) return toast("En «" + tableName(t) + "» no se sienta nadie.", true);
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

    function addGuests(names, sideKey, menu, group) {
      var rows = names.map(function (n) {
        var r = { wedding_id: wedding.id, name: n.slice(0, 120), side: sideKey, menu: menu || "normal" };
        if (hasGroup && group) r.group_name = group.slice(0, 60);
        return r;
      });
      return sb.from("wedding_guests").insert(rows).select().then(function (r) {
        if (r.error) return fail(r.error), false;
        guests = guests.concat(r.data);
        render();
        toast(rows.length === 1 ? rows[0].name + " añadido." : rows.length + " invitados añadidos.");
        return true;
      });
    }

    // ---------- Eventos ----------
    trayHead.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab]");
      if (b) { tab = b.getAttribute("data-tab"); renderTabs(); }
    });
    paneElems.addEventListener("click", function (e) {
      var b = e.target.closest("[data-add]");
      if (b) addElement(b.getAttribute("data-add"));
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
      addGuests([n], addSide.value, addMenu.value, addGroup.value.trim()).then(function (ok) {
        if (ok) { addName.value = ""; addMenu.value = "normal"; addName.focus(); } // el grupo se mantiene para añadir a toda la familia
      });
    });
    bulk.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var names = bulkText.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) return bulkText.focus();
      if (names.length > 300) return toast("Como mucho 300 de una vez.", true);
      addGuests(names, bulkSide.value, null, bulkGroup.value.trim()).then(function (ok) { if (ok) bulkText.value = ""; });
    });

    // Tocar un invitado de la bandeja: seleccionarlo (para sentarle y ver su ficha).
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
        if (!t || !confirm("¿Eliminar «" + tableName(t) + "»?" + (n ? " Sus " + n + " invitados volverán a la lista." : ""))) return;
        tables = tables.filter(function (x) { return x !== t; });
        guests.forEach(function (x) { if (x.table_id === t.id) { x.table_id = null; x.seat = null; } });
        selTable = null;
        render();
        sb.from("wedding_tables").delete().eq("id", t.id).then(function (r) { if (r.error) fail(r.error); });
      }
    });

    // Arrastrar invitados (escritorio): desde la bandeja o desde una silla ocupada.
    root.addEventListener("dragstart", function (e) {
      var c = e.target.closest && e.target.closest("[data-guest]");
      if (!c) return;
      e.dataTransfer.setData("text/plain", c.getAttribute("data-guest"));
      e.dataTransfer.effectAllowed = "move";
      floor.classList.add("is-picking");
    });
    root.addEventListener("dragend", function () { floor.classList.toggle("is-picking", !!selGuest); });
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
    tray.addEventListener("dragover", function (e) { e.preventDefault(); tray.classList.add("is-over"); });
    tray.addEventListener("dragleave", function (e) { if (!tray.contains(e.relatedTarget)) tray.classList.remove("is-over"); });
    tray.addEventListener("drop", function (e) {
      e.preventDefault();
      tray.classList.remove("is-over");
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
    showGroupInputs();
    render();
    load();

    return {
      setWedding: function (w) { wedding = w; fillSideSelects(); render(); }
    };
  }

  window.LAmore.seating = { plan: seatingPlan };
})();
