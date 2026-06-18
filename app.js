/* Lano Finanças — controle simples de entradas e saídas (localStorage) */
(function () {
  "use strict";

  var STORAGE_KEY = "lano-financas:entries:v1";
  var STORAGE_FIXED = "lano-financas:fixed:v1";

  // Formatadores pt-BR
  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

  // Estado
  var entries = load();
  var fixed = loadFixed(); // despesas fixas (recorrentes, valem para todo mês)
  var current = new Date();
  var viewYear = current.getFullYear();
  var viewMonth = current.getMonth(); // 0-11
  var selectedType = "in";

  // Elementos
  var el = {
    monthLabel: document.getElementById("monthLabel"),
    prevMonth: document.getElementById("prevMonth"),
    nextMonth: document.getElementById("nextMonth"),
    balanceCard: document.getElementById("balanceCard"),
    balanceValue: document.getElementById("balanceValue"),
    balanceStatus: document.getElementById("balanceStatus"),
    totalIn: document.getElementById("totalIn"),
    totalOut: document.getElementById("totalOut"),
    form: document.getElementById("entryForm"),
    btnIn: document.getElementById("btnIn"),
    btnOut: document.getElementById("btnOut"),
    desc: document.getElementById("desc"),
    amount: document.getElementById("amount"),
    date: document.getElementById("date"),
    list: document.getElementById("entriesList"),
    empty: document.getElementById("emptyState"),
    countBadge: document.getElementById("countBadge"),
    // microfone
    micCard: document.querySelector(".mic-card"),
    micLevel: document.getElementById("micLevel"),
    metaPct: document.getElementById("metaPct"),
    metaStatus: document.getElementById("metaStatus"),
    metaDetail: document.getElementById("metaDetail"),
    // despesas fixas
    fixedForm: document.getElementById("fixedForm"),
    fixedName: document.getElementById("fixedName"),
    fixedAmount: document.getElementById("fixedAmount"),
    fixedList: document.getElementById("fixedList"),
    fixedEmpty: document.getElementById("fixedEmpty"),
    fixedTotalBadge: document.getElementById("fixedTotalBadge")
  };

  // ---------- Persistência ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      alert("Não foi possível salvar os dados neste aparelho.");
    }
  }

  function loadFixed() {
    try {
      var raw = localStorage.getItem(STORAGE_FIXED);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveFixed() {
    try {
      localStorage.setItem(STORAGE_FIXED, JSON.stringify(fixed));
    } catch (e) {
      alert("Não foi possível salvar as despesas fixas neste aparelho.");
    }
  }

  // ---------- Helpers ----------
  function todayISO() {
    var d = new Date();
    return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isoFromParts(y, m0, d) {
    return y + "-" + pad(m0 + 1) + "-" + pad(d);
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  // Converte valores digitados no padrão pt-BR para número.
  // Aceita: "1500", "1500,50", "1.500", "1.500,50", "10.50", "1.000.000"
  function parseAmount(str) {
    if (!str) return NaN;
    var s = String(str).trim().replace(/\s/g, "").replace(/r\$/gi, "");
    if (!s) return NaN;

    var hasComma = s.indexOf(",") > -1;
    var hasDot = s.indexOf(".") > -1;

    if (hasComma && hasDot) {
      // padrão pt-BR: ponto = milhar, vírgula = decimal -> "1.500,50"
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      // só vírgula = decimal -> "1500,50"
      s = s.replace(",", ".");
    } else if (hasDot) {
      var parts = s.split(".");
      var last = parts[parts.length - 1];
      // vários pontos, ou 3 dígitos após o ponto = separador de milhar ("1.500", "1.000.000")
      if (parts.length > 2 || last.length === 3) {
        s = parts.join("");
      }
      // senão o ponto é decimal ("10.5", "10.50") -> mantém
    }

    return parseFloat(s);
  }

  function uid() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function inViewMonth(iso) {
    // iso = "YYYY-MM-DD"
    var parts = iso.split("-");
    return Number(parts[0]) === viewYear && Number(parts[1]) === viewMonth + 1;
  }

  function formatEntryDate(iso) {
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  // ---------- Render ----------
  function render() {
    var label = monthFmt.format(new Date(viewYear, viewMonth, 1));
    el.monthLabel.textContent = label;

    var monthEntries = entries
      .filter(function (e) { return inViewMonth(e.date); })
      .sort(function (a, b) {
        if (a.date === b.date) return b.created - a.created;
        return a.date < b.date ? 1 : -1; // mais recentes primeiro
      });

    var totalIn = 0, totalOut = 0;
    monthEntries.forEach(function (e) {
      if (e.type === "in") totalIn += e.amount;
      else totalOut += e.amount;
    });
    var balance = totalIn - totalOut;

    el.totalIn.textContent = brl.format(totalIn);
    el.totalOut.textContent = brl.format(totalOut);
    el.balanceValue.textContent = brl.format(balance);

    el.balanceCard.classList.remove("positive", "negative");
    if (monthEntries.length === 0) {
      el.balanceStatus.textContent = "SEM LANÇAMENTOS";
    } else if (balance >= 0) {
      el.balanceCard.classList.add("positive");
      el.balanceStatus.textContent = "POSITIVO";
    } else {
      el.balanceCard.classList.add("negative");
      el.balanceStatus.textContent = "NEGATIVO";
    }

    el.countBadge.textContent = monthEntries.length;
    el.list.innerHTML = "";
    el.empty.style.display = monthEntries.length === 0 ? "block" : "none";

    monthEntries.forEach(function (e) {
      el.list.appendChild(buildRow(e));
    });

    updateMic(balance);
    renderFixed();
  }

  function totalFixed() {
    return fixed.reduce(function (sum, f) { return sum + f.amount; }, 0);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Atualiza o microfone: enche conforme o saldo cobre o total das contas fixas
  function updateMic(balance) {
    var target = totalFixed();
    el.micCard.classList.remove("covered", "missing");

    if (target <= 0) {
      el.micLevel.style.transform = "scaleY(0)";
      el.metaPct.textContent = "—";
      el.metaStatus.textContent = "Cadastre suas despesas fixas";
      el.metaDetail.textContent = "para acompanhar quanto falta para as contas do mês.";
      return;
    }

    var frac = clamp(balance / target, 0, 1);
    el.micLevel.style.transform = "scaleY(" + frac + ")";
    el.metaPct.textContent = Math.round(frac * 100) + "%";

    var gap = target - balance; // quanto falta para cobrir as contas
    if (gap > 0) {
      el.micCard.classList.add("missing");
      el.metaStatus.textContent = "Faltam " + brl.format(gap);
      el.metaDetail.textContent = "para cobrir " + brl.format(target) + " em contas do mês.";
    } else {
      el.micCard.classList.add("covered");
      el.metaStatus.textContent = "Contas do mês cobertas ✓";
      el.metaDetail.textContent = gap < 0
        ? "Sobra " + brl.format(-gap) + " depois das contas."
        : "Saldo exatamente no valor das contas.";
    }
  }

  function renderFixed() {
    el.fixedTotalBadge.textContent = brl.format(totalFixed());
    el.fixedList.innerHTML = "";
    el.fixedEmpty.style.display = fixed.length === 0 ? "block" : "none";
    fixed.forEach(function (f) {
      el.fixedList.appendChild(buildFixedRow(f));
    });
  }

  function buildFixedRow(f) {
    var li = document.createElement("li");
    li.className = "entry";

    var dot = document.createElement("span");
    dot.className = "entry-dot out";

    var info = document.createElement("div");
    info.className = "entry-info";
    var name = document.createElement("div");
    name.className = "entry-desc";
    name.textContent = f.name;
    info.appendChild(name);

    var amount = document.createElement("div");
    amount.className = "entry-amount";
    amount.textContent = brl.format(f.amount);

    var del = document.createElement("button");
    del.className = "del-btn";
    del.type = "button";
    del.setAttribute("aria-label", "Excluir despesa fixa");
    del.innerHTML = "&times;";
    del.addEventListener("click", function () {
      if (confirm("Excluir a conta fixa \"" + f.name + "\"?")) {
        fixed = fixed.filter(function (x) { return x.id !== f.id; });
        saveFixed();
        render();
      }
    });

    li.appendChild(dot);
    li.appendChild(info);
    li.appendChild(amount);
    li.appendChild(del);
    return li;
  }

  function buildRow(e) {
    var li = document.createElement("li");
    li.className = "entry";

    var dot = document.createElement("span");
    dot.className = "entry-dot " + e.type;

    var info = document.createElement("div");
    info.className = "entry-info";
    var desc = document.createElement("div");
    desc.className = "entry-desc";
    desc.textContent = e.desc;
    var date = document.createElement("div");
    date.className = "entry-date";
    date.textContent = formatEntryDate(e.date);
    info.appendChild(desc);
    info.appendChild(date);

    var amount = document.createElement("div");
    amount.className = "entry-amount " + e.type;
    amount.textContent = (e.type === "in" ? "+ " : "− ") + brl.format(e.amount);

    var del = document.createElement("button");
    del.className = "del-btn";
    del.type = "button";
    del.setAttribute("aria-label", "Excluir lançamento");
    del.innerHTML = "&times;";
    del.addEventListener("click", function () {
      if (confirm("Excluir \"" + e.desc + "\"?")) {
        entries = entries.filter(function (x) { return x.id !== e.id; });
        save();
        render();
      }
    });

    li.appendChild(dot);
    li.appendChild(info);
    li.appendChild(amount);
    li.appendChild(del);
    return li;
  }

  // ---------- Eventos ----------
  el.prevMonth.addEventListener("click", function () {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    render();
  });

  el.nextMonth.addEventListener("click", function () {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    render();
  });

  function setType(type) {
    selectedType = type;
    el.btnIn.classList.toggle("active", type === "in");
    el.btnOut.classList.toggle("active", type === "out");
  }
  el.btnIn.addEventListener("click", function () { setType("in"); });
  el.btnOut.addEventListener("click", function () { setType("out"); });

  el.form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var desc = el.desc.value.trim();
    var amount = parseAmount(el.amount.value);
    var date = el.date.value || todayISO();

    if (!desc) { el.desc.focus(); return; }
    if (!isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero.");
      el.amount.focus();
      return;
    }

    entries.push({
      id: uid(),
      type: selectedType,
      desc: desc,
      amount: Math.round(amount * 100) / 100,
      date: date,
      created: Date.now()
    });
    save();

    // Pula para o mês do lançamento, caso seja diferente do mês em exibição
    var p = date.split("-");
    viewYear = Number(p[0]);
    viewMonth = Number(p[1]) - 1;

    el.desc.value = "";
    el.amount.value = "";
    el.date.value = todayISO();
    el.desc.focus();
    render();
  });

  el.fixedForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = el.fixedName.value.trim();
    var amount = parseAmount(el.fixedAmount.value);

    if (!name) { el.fixedName.focus(); return; }
    if (!isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero.");
      el.fixedAmount.focus();
      return;
    }

    fixed.push({
      id: uid(),
      name: name,
      amount: Math.round(amount * 100) / 100
    });
    saveFixed();

    el.fixedName.value = "";
    el.fixedAmount.value = "";
    el.fixedName.focus();
    render();
  });

  // ---------- Init ----------
  el.date.value = todayISO();
  setType("in");
  render();

  // Service worker (PWA — funciona offline e permite instalar)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
