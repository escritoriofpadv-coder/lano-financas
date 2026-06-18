/* Lano Finanças — controle simples de entradas e saídas (localStorage) */
(function () {
  "use strict";

  var STORAGE_KEY = "lano-financas:entries:v1";
  var STORAGE_FIXED = "lano-financas:fixed:v1";

  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

  // Estado
  var entries = load();
  var fixed = loadFixed();
  var current = new Date();
  var viewYear = current.getFullYear();
  var viewMonth = current.getMonth(); // 0-11
  var selectedType = "in";
  var selectedCat = "essencial";
  var fixedRep = "always";
  var editingId = null;

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
    formTitle: document.getElementById("formTitle"),
    btnIn: document.getElementById("btnIn"),
    btnOut: document.getElementById("btnOut"),
    catToggle: document.getElementById("catToggle"),
    catEss: document.getElementById("catEss"),
    catLaz: document.getElementById("catLaz"),
    desc: document.getElementById("desc"),
    amount: document.getElementById("amount"),
    date: document.getElementById("date"),
    submitBtn: document.getElementById("submitBtn"),
    cancelEdit: document.getElementById("cancelEdit"),
    list: document.getElementById("entriesList"),
    empty: document.getElementById("emptyState"),
    countBadge: document.getElementById("countBadge"),
    // símbolo $
    micCard: document.querySelector(".mic-card"),
    dollarLevel: document.getElementById("dollarLevel"),
    dollarOutline: document.getElementById("dollarOutline"),
    metaPct: document.getElementById("metaPct"),
    metaStatus: document.getElementById("metaStatus"),
    metaDetail: document.getElementById("metaDetail"),
    // despesas fixas
    fixedForm: document.getElementById("fixedForm"),
    fixedName: document.getElementById("fixedName"),
    fixedAmount: document.getElementById("fixedAmount"),
    fixedList: document.getElementById("fixedList"),
    fixedEmpty: document.getElementById("fixedEmpty"),
    fixedTotalBadge: document.getElementById("fixedTotalBadge"),
    repAlways: document.getElementById("repAlways"),
    repCount: document.getElementById("repCount"),
    repMonthsField: document.getElementById("repMonthsField"),
    fixedMonths: document.getElementById("fixedMonths"),
    // relatório
    reportBars: document.getElementById("reportBars"),
    reportEmpty: document.getElementById("reportEmpty"),
    reportTotalBadge: document.getElementById("reportTotalBadge"),
    reportPaid: document.getElementById("reportPaid"),
    // backup
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    pdfBtn: document.getElementById("pdfBtn")
  };

  // ---------- Persistência ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    catch (e) { alert("Não foi possível salvar os dados neste aparelho."); }
  }
  function loadFixed() {
    try {
      var raw = localStorage.getItem(STORAGE_FIXED);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function saveFixed() {
    try { localStorage.setItem(STORAGE_FIXED, JSON.stringify(fixed)); }
    catch (e) { alert("Não foi possível salvar as despesas fixas neste aparelho."); }
  }

  // ---------- Helpers ----------
  function todayISO() {
    var d = new Date();
    return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function isoFromParts(y, m0, d) { return y + "-" + pad(m0 + 1) + "-" + pad(d); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function monthKey() { return viewYear + "-" + pad(viewMonth + 1); }

  // Converte valores pt-BR para número: "1500", "1500,50", "1.500", "1.500,50", "10.50", "1.000.000"
  function parseAmount(str) {
    if (!str) return NaN;
    var s = String(str).trim().replace(/\s/g, "").replace(/r\$/gi, "");
    if (!s) return NaN;
    var hasComma = s.indexOf(",") > -1;
    var hasDot = s.indexOf(".") > -1;
    if (hasComma && hasDot) { s = s.replace(/\./g, "").replace(",", "."); }
    else if (hasComma) { s = s.replace(",", "."); }
    else if (hasDot) {
      var parts = s.split(".");
      var last = parts[parts.length - 1];
      if (parts.length > 2 || last.length === 3) { s = parts.join(""); }
    }
    return parseFloat(s);
  }
  // número -> texto editável no campo ("1500.5" -> "1500,5")
  function amountToInput(n) { return String(n).replace(".", ","); }

  function uid() { return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  function inViewMonth(iso) {
    var p = iso.split("-");
    return Number(p[0]) === viewYear && Number(p[1]) === viewMonth + 1;
  }
  function formatEntryDate(iso) {
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  // índice numérico de um mês "YYYY-MM" para comparar períodos
  function mkIndex(mk) { var p = mk.split("-"); return Number(p[0]) * 12 + (Number(p[1]) - 1); }

  // a conta fixa está ativa no mês em exibição?
  function fixedActiveIn(f, mk) {
    var start = f.startMonth || "2000-01"; // legado (sem início) = sempre
    var si = mkIndex(start), ci = mkIndex(mk);
    if (ci < si) return false;
    if (f.months == null) return true; // indeterminado
    return ci < si + f.months;
  }
  function activeFixed() {
    var mk = monthKey();
    return fixed.filter(function (f) { return fixedActiveIn(f, mk); });
  }
  function totalFixed() {
    return activeFixed().reduce(function (sum, f) { return sum + f.amount; }, 0);
  }

  // Cor do saldo: vermelho (negativo) -> amarelo (perto de zero) -> verde (positivo, mais forte quanto maior)
  function balanceColor(v, target) {
    var base = target > 0 ? target : (Math.abs(v) > 0 ? Math.abs(v) : 100);
    var s = v / base; // tipicamente -1 .. +1
    var hue, light = 47, sat = 70;
    if (s <= 0) {
      hue = clamp((s + 0.5) / 0.5, 0, 1) * 50; // s<=-0.5 vermelho(0), s=0 amarelo(50)
    } else {
      hue = 50 + clamp(s / 0.6, 0, 1) * (140 - 50); // s=0 amarelo, s>=0.6 verde(140)
    }
    if (s > 0.6) { light = 47 - clamp((s - 0.6) / 1.4, 0, 1) * 15; } // verde mais forte
    return "hsl(" + Math.round(hue) + "," + sat + "%," + Math.round(light) + "%)";
  }

  // ---------- Render ----------
  function render() {
    el.monthLabel.textContent = monthFmt.format(new Date(viewYear, viewMonth, 1));

    var monthEntries = entries
      .filter(function (e) { return inViewMonth(e.date); })
      .sort(function (a, b) {
        if (a.date === b.date) return b.created - a.created;
        return a.date < b.date ? 1 : -1;
      });

    var totalIn = 0, totalOut = 0;
    monthEntries.forEach(function (e) {
      if (e.type === "in") totalIn += e.amount; else totalOut += e.amount;
    });
    var totalFix = totalFixed();
    var saldoBruto = totalIn - totalOut;
    var saldoReal = saldoBruto - totalFix; // saldo já considerando as contas fixas

    el.totalIn.textContent = brl.format(totalIn);
    el.totalOut.textContent = brl.format(totalOut + totalFix); // saídas incluem contas fixas
    el.balanceValue.textContent = brl.format(saldoReal);

    if (monthEntries.length === 0 && totalFix === 0) {
      el.balanceValue.style.color = "var(--muted)";
      el.balanceStatus.textContent = "SEM LANÇAMENTOS";
      el.balanceStatus.style.color = "";
      el.balanceStatus.style.background = "";
    } else {
      el.balanceValue.style.color = balanceColor(saldoReal, totalFix);
      var st = saldoReal > 0.005 ? "POSITIVO" : (saldoReal < -0.005 ? "NEGATIVO" : "NO ZERO");
      el.balanceStatus.textContent = st;
      var c = balanceColor(saldoReal, totalFix);
      el.balanceStatus.style.color = c;
      el.balanceStatus.style.background = "color-mix(in srgb, " + c + " 18%, transparent)";
    }

    updateMic(saldoBruto);

    el.countBadge.textContent = monthEntries.length;
    el.list.innerHTML = "";
    el.empty.style.display = monthEntries.length === 0 ? "block" : "none";
    monthEntries.forEach(function (e) { el.list.appendChild(buildRow(e)); });

    renderFixed();
    renderReport(monthEntries, totalFix);
  }

  function updateMic(saldoBruto) {
    var target = totalFixed();
    el.micCard.classList.remove("covered", "missing");
    if (target <= 0) {
      el.dollarLevel.style.transform = "scaleY(0)";
      el.dollarOutline.style.stroke = "#93a0b4";
      el.dollarLevel.style.fill = "#93a0b4";
      el.metaPct.textContent = "—";
      el.metaStatus.textContent = "Cadastre suas despesas fixas";
      el.metaDetail.textContent = "para acompanhar quanto falta para as contas do mês.";
      return;
    }
    var frac = clamp(saldoBruto / target, 0, 1);
    var cor = balanceColor(saldoBruto - target, target); // mesma cor do saldo (vermelho/amarelo/verde)
    el.dollarLevel.style.transform = "scaleY(" + frac + ")";
    el.dollarLevel.style.fill = cor;
    el.dollarOutline.style.stroke = cor;
    el.metaPct.textContent = Math.round(frac * 100) + "%";
    var gap = target - saldoBruto;
    if (gap > 0.005) {
      el.micCard.classList.add("missing");
      el.metaStatus.textContent = "Faltam " + brl.format(gap);
      el.metaDetail.textContent = "para cobrir " + brl.format(target) + " em contas do mês.";
    } else {
      el.micCard.classList.add("covered");
      el.metaStatus.textContent = "Contas do mês cobertas ✓";
      el.metaDetail.textContent = gap < -0.005
        ? "Sobra " + brl.format(-gap) + " depois das contas."
        : "Saldo exatamente no valor das contas.";
    }
  }

  // ---------- Relatório ----------
  function renderReport(monthEntries, totalFix) {
    var essencial = 0, lazer = 0;
    monthEntries.forEach(function (e) {
      if (e.type !== "out") return;
      if (e.cat === "lazer") lazer += e.amount;
      else essencial += e.amount; // sem categoria = essencial
    });
    var rows = [
      { key: "fixo", label: "Fixo (contas)", value: totalFix },
      { key: "essencial", label: "Essencial", value: essencial },
      { key: "lazer", label: "Lazer", value: lazer }
    ];
    var total = totalFix + essencial + lazer;
    var maxv = Math.max(totalFix, essencial, lazer, 1);

    el.reportTotalBadge.textContent = brl.format(total);
    el.reportBars.innerHTML = "";
    el.reportEmpty.style.display = total === 0 ? "block" : "none";

    if (total > 0) {
      rows.forEach(function (r) {
        var pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        var w = Math.round((r.value / maxv) * 100);
        var div = document.createElement("div");
        div.className = "report-row";
        var top = document.createElement("div");
        top.className = "report-top";
        var name = document.createElement("span");
        name.className = "report-name";
        name.textContent = r.label;
        var val = document.createElement("span");
        val.className = "report-val";
        val.textContent = brl.format(r.value) + " · " + pct + "%";
        top.appendChild(name); top.appendChild(val);
        var track = document.createElement("div");
        track.className = "report-track";
        var fill = document.createElement("div");
        fill.className = "report-fill " + r.key;
        fill.style.width = w + "%";
        track.appendChild(fill);
        div.appendChild(top); div.appendChild(track);
        el.reportBars.appendChild(div);
      });
    }

    // contas fixas pagas no mês
    var mk = monthKey();
    var paid = fixed.filter(function (f) { return f.paid && f.paid[mk]; }).length;
    el.reportPaid.textContent = fixed.length
      ? "Contas fixas pagas: " + paid + " de " + fixed.length
      : "";
  }

  // ---------- Despesas fixas ----------
  function renderFixed() {
    var ativas = activeFixed();
    el.fixedTotalBadge.textContent = brl.format(totalFixed());
    el.fixedList.innerHTML = "";
    el.fixedEmpty.style.display = ativas.length === 0 ? "block" : "none";
    el.fixedEmpty.textContent = fixed.length === 0
      ? "Nenhuma conta fixa cadastrada ainda."
      : "Nenhuma conta fixa neste mês.";
    ativas.forEach(function (f) { el.fixedList.appendChild(buildFixedRow(f)); });
  }

  function fixedPeriodText(f) {
    if (f.months == null) return "todo mês";
    var si = mkIndex(f.startMonth || "2000-01");
    var ci = mkIndex(monthKey());
    return "mês " + (ci - si + 1) + " de " + f.months;
  }

  function buildFixedRow(f) {
    var mk = monthKey();
    var isPaid = !!(f.paid && f.paid[mk]);
    var li = document.createElement("li");
    li.className = "entry" + (isPaid ? " paid" : "");

    var chk = document.createElement("button");
    chk.type = "button";
    chk.className = "paid-check" + (isPaid ? " on" : "");
    chk.setAttribute("aria-label", isPaid ? "Marcar como não paga" : "Marcar como paga");
    chk.innerHTML = "&#10003;";
    chk.addEventListener("click", function () {
      if (!f.paid) f.paid = {};
      if (f.paid[mk]) delete f.paid[mk]; else f.paid[mk] = true;
      saveFixed(); render();
    });

    var info = document.createElement("div");
    info.className = "entry-info";
    var name = document.createElement("div");
    name.className = "entry-desc";
    name.textContent = f.name;
    var sub = document.createElement("div");
    sub.className = "entry-sub";
    var tag = document.createElement("span");
    tag.className = "cat-tag essencial";
    tag.style.background = "rgba(240,162,58,0.18)";
    tag.style.color = "#f0a23a";
    tag.textContent = "FIXO";
    sub.appendChild(tag);
    var per = document.createElement("span");
    per.textContent = fixedPeriodText(f);
    sub.appendChild(per);
    if (isPaid) { var p = document.createElement("span"); p.textContent = "· paga"; sub.appendChild(p); }
    info.appendChild(name); info.appendChild(sub);

    var amount = document.createElement("div");
    amount.className = "entry-amount";
    amount.textContent = brl.format(f.amount);

    var actions = document.createElement("div");
    actions.className = "entry-actions";
    var del = document.createElement("button");
    del.className = "icon-act del";
    del.type = "button";
    del.setAttribute("aria-label", "Excluir despesa fixa");
    del.innerHTML = "&times;";
    del.addEventListener("click", function () {
      if (confirm("Excluir a conta fixa \"" + f.name + "\"?")) {
        fixed = fixed.filter(function (x) { return x.id !== f.id; });
        saveFixed(); render();
      }
    });
    actions.appendChild(del);

    li.appendChild(chk); li.appendChild(info); li.appendChild(amount); li.appendChild(actions);
    return li;
  }

  // ---------- Lançamentos ----------
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
    var sub = document.createElement("div");
    sub.className = "entry-sub";
    var dt = document.createElement("span");
    dt.textContent = formatEntryDate(e.date);
    sub.appendChild(dt);
    if (e.type === "out") {
      var cat = e.cat === "lazer" ? "lazer" : "essencial";
      var tag = document.createElement("span");
      tag.className = "cat-tag " + cat;
      tag.textContent = cat === "lazer" ? "Lazer" : "Essencial";
      sub.appendChild(tag);
    }
    info.appendChild(desc); info.appendChild(sub);

    var amount = document.createElement("div");
    amount.className = "entry-amount " + e.type;
    amount.textContent = (e.type === "in" ? "+ " : "− ") + brl.format(e.amount);

    var actions = document.createElement("div");
    actions.className = "entry-actions";
    var edit = document.createElement("button");
    edit.className = "icon-act";
    edit.type = "button";
    edit.setAttribute("aria-label", "Editar lançamento");
    edit.innerHTML = "&#9998;"; // lápis
    edit.addEventListener("click", function () { startEdit(e); });
    var del = document.createElement("button");
    del.className = "icon-act del";
    del.type = "button";
    del.setAttribute("aria-label", "Excluir lançamento");
    del.innerHTML = "&times;";
    del.addEventListener("click", function () {
      if (confirm("Excluir \"" + e.desc + "\"?")) {
        entries = entries.filter(function (x) { return x.id !== e.id; });
        if (editingId === e.id) resetForm();
        save(); render();
      }
    });
    actions.appendChild(edit); actions.appendChild(del);

    li.appendChild(dot); li.appendChild(info); li.appendChild(amount); li.appendChild(actions);
    return li;
  }

  // ---------- Edição ----------
  function startEdit(e) {
    editingId = e.id;
    setType(e.type);
    if (e.type === "out") setCat(e.cat === "lazer" ? "lazer" : "essencial");
    el.desc.value = e.desc;
    el.amount.value = amountToInput(e.amount);
    el.date.value = e.date;
    el.formTitle.textContent = "Editar lançamento";
    el.submitBtn.textContent = "Salvar alteração";
    el.cancelEdit.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    el.desc.focus();
  }
  function resetForm() {
    editingId = null;
    el.desc.value = "";
    el.amount.value = "";
    el.date.value = todayISO();
    el.formTitle.textContent = "Novo lançamento";
    el.submitBtn.textContent = "Adicionar";
    el.cancelEdit.hidden = true;
  }

  // ---------- Tipo / categoria ----------
  function setType(type) {
    selectedType = type;
    el.btnIn.classList.toggle("active", type === "in");
    el.btnOut.classList.toggle("active", type === "out");
    el.catToggle.classList.toggle("show", type === "out");
  }
  function setCat(cat) {
    selectedCat = cat;
    el.catEss.classList.toggle("active", cat === "essencial");
    el.catLaz.classList.toggle("active", cat === "lazer");
  }

  // ---------- Eventos ----------
  el.prevMonth.addEventListener("click", function () {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render();
  });
  el.nextMonth.addEventListener("click", function () {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render();
  });
  el.btnIn.addEventListener("click", function () { setType("in"); });
  el.btnOut.addEventListener("click", function () { setType("out"); });
  el.catEss.addEventListener("click", function () { setCat("essencial"); });
  el.catLaz.addEventListener("click", function () { setCat("lazer"); });
  el.cancelEdit.addEventListener("click", function () { resetForm(); });

  el.form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var desc = el.desc.value.trim();
    var amount = parseAmount(el.amount.value);
    var date = el.date.value || todayISO();
    if (!desc) { el.desc.focus(); return; }
    if (!isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero."); el.amount.focus(); return;
    }
    amount = Math.round(amount * 100) / 100;

    if (editingId) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === editingId) {
          entries[i].type = selectedType;
          entries[i].desc = desc;
          entries[i].amount = amount;
          entries[i].date = date;
          entries[i].cat = selectedType === "out" ? selectedCat : undefined;
          break;
        }
      }
    } else {
      entries.push({
        id: uid(), type: selectedType, desc: desc, amount: amount, date: date,
        cat: selectedType === "out" ? selectedCat : undefined, created: Date.now()
      });
    }
    save();

    var p = date.split("-");
    viewYear = Number(p[0]); viewMonth = Number(p[1]) - 1;
    resetForm();
    el.desc.focus();
    render();
  });

  el.fixedForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = el.fixedName.value.trim();
    var amount = parseAmount(el.fixedAmount.value);
    if (!name) { el.fixedName.focus(); return; }
    if (!isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero."); el.fixedAmount.focus(); return;
    }
    var months = null;
    if (fixedRep === "count") {
      months = parseInt(el.fixedMonths.value, 10);
      if (!months || months < 1) {
        alert("Informe por quantos meses essa conta se repete (1 ou mais)."); el.fixedMonths.focus(); return;
      }
    }
    fixed.push({
      id: uid(), name: name, amount: Math.round(amount * 100) / 100,
      startMonth: monthKey(), months: months, paid: {}
    });
    saveFixed();
    el.fixedName.value = ""; el.fixedAmount.value = ""; el.fixedMonths.value = "";
    setRep("always");
    el.fixedName.focus();
    render();
  });

  function setRep(r) {
    fixedRep = r;
    el.repAlways.classList.toggle("active", r === "always");
    el.repCount.classList.toggle("active", r === "count");
    el.repMonthsField.style.display = r === "count" ? "flex" : "none";
  }
  el.repAlways.addEventListener("click", function () { setRep("always"); });
  el.repCount.addEventListener("click", function () { setRep("count"); });

  // ---------- Backup ----------
  el.exportBtn.addEventListener("click", function () {
    var payload = { app: "lano-financas", version: 2, exportedAt: new Date().toISOString(), entries: entries, fixed: fixed };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var d = new Date();
    a.href = url;
    a.download = "lano-financas-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  el.importBtn.addEventListener("click", function () { el.importFile.click(); });
  el.importFile.addEventListener("change", function () {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var newEntries = Array.isArray(data.entries) ? data.entries : null;
        var newFixed = Array.isArray(data.fixed) ? data.fixed : null;
        if (!newEntries && !newFixed) { alert("Arquivo de backup inválido."); return; }
        if (!confirm("Isto vai SUBSTITUIR os dados atuais pelos do backup. Continuar?")) return;
        entries = newEntries || [];
        fixed = newFixed || [];
        save(); saveFixed(); resetForm(); render();
        alert("Backup restaurado com sucesso!");
      } catch (e) { alert("Não foi possível ler o arquivo de backup."); }
      el.importFile.value = "";
    };
    reader.readAsText(file);
  });

  // ---------- Relatório em PDF (gerador próprio, sem bibliotecas) ----------
  function monthDataForPdf() {
    var me = entries.filter(function (e) { return inViewMonth(e.date); });
    var totalIn = 0, totalOut = 0, ess = 0, laz = 0;
    me.forEach(function (e) {
      if (e.type === "in") totalIn += e.amount;
      else { totalOut += e.amount; if (e.cat === "lazer") laz += e.amount; else ess += e.amount; }
    });
    var fix = totalFixed();
    return { me: me, totalIn: totalIn, totalOut: totalOut, ess: ess, laz: laz, fix: fix, saldoReal: totalIn - totalOut - fix, fixedList: activeFixed() };
  }

  function buildReportLines() {
    var d = monthDataForPdf();
    var L = [];
    function add(t, b, s) { L.push({ t: t, b: !!b, s: s || 11 }); }
    add("Lano Finanças", true, 20);
    add("Relatório de " + monthFmt.format(new Date(viewYear, viewMonth, 1)), false, 12);
    add("", false, 11);
    add("RESUMO", true, 13);
    add("Entradas:  " + brl.format(d.totalIn));
    add("Saídas (com contas fixas):  " + brl.format(d.totalOut + d.fix));
    add("   sendo contas fixas:  " + brl.format(d.fix));
    var st = d.saldoReal > 0.005 ? "POSITIVO" : (d.saldoReal < -0.005 ? "NEGATIVO" : "NO ZERO");
    add("Saldo total (entradas - saídas - contas fixas): " + brl.format(d.saldoReal) + "  [" + st + "]", true);
    add("", false, 11);
    add("PARA ONDE FOI O DINHEIRO", true, 13);
    var tot = d.fix + d.ess + d.laz;
    function pc(v) { return tot > 0 ? Math.round((v / tot) * 100) + "%" : "0%"; }
    add("Fixo (contas):  " + brl.format(d.fix) + "  (" + pc(d.fix) + ")");
    add("Essencial:  " + brl.format(d.ess) + "  (" + pc(d.ess) + ")");
    add("Lazer:  " + brl.format(d.laz) + "  (" + pc(d.laz) + ")");
    var mk = monthKey();
    if (d.fixedList.length) {
      add("", false, 11);
      add("CONTAS FIXAS DO MÊS", true, 13);
      var paid = 0;
      d.fixedList.forEach(function (f) {
        var pg = f.paid && f.paid[mk];
        if (pg) paid++;
        add(f.name + ":  " + brl.format(f.amount) + "   (" + (pg ? "paga" : "pendente") + ")");
      });
      add("Pagas: " + paid + " de " + d.fixedList.length);
    }
    add("", false, 11);
    add("LANÇAMENTOS DO MÊS", true, 13);
    if (!d.me.length) add("(nenhum lançamento)");
    d.me.slice().sort(function (a, b) {
      if (a.date === b.date) return a.created - b.created;
      return a.date < b.date ? -1 : 1;
    }).forEach(function (e) {
      var p = e.date.split("-");
      var sign = e.type === "in" ? "+" : "-";
      var cat = e.type === "out" ? (e.cat === "lazer" ? " [Lazer]" : " [Essencial]") : "";
      var desc = e.desc.length > 32 ? e.desc.slice(0, 31) + "..." : e.desc;
      add(p[2] + "/" + p[1] + "   " + sign + brl.format(e.amount) + "   " + desc + cat);
    });
    add("", false, 11);
    add("Gerado em " + new Date().toLocaleString("pt-BR") + " - Lano Finanças", false, 9);
    return L;
  }

  function pdfSan(s) {
    return String(s)
      .replace(/[—–−]/g, "-").replace(/✓/g, "OK").replace(/[•·]/g, "-")
      .replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "?");
  }
  function pdfEsc(s) {
    return pdfSan(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }
  function pad10(n) { var s = "" + n; while (s.length < 10) s = "0" + s; return s; }

  function generatePdfBlob() {
    var lines = buildReportLines();
    var ML = 50, MT = 792, MIN_Y = 56;
    // paginação
    var pages = [], cur = [], y = MT;
    lines.forEach(function (ln) {
      var lh = ln.s >= 16 ? 26 : (ln.s >= 13 ? 20 : 16);
      if (y - lh < MIN_Y) { pages.push(cur); cur = []; y = MT; }
      cur.push({ ln: ln, y: y });
      y -= lh;
    });
    if (cur.length) pages.push(cur);

    function buildCS(page) {
      var cs = "";
      page.forEach(function (it) {
        if (it.ln.t === "") return;
        var f = it.ln.b ? "F2" : "F1";
        cs += "BT /" + f + " " + it.ln.s + " Tf 1 0 0 1 " + ML + " " + it.y + " Tm (" + pdfEsc(it.ln.t) + ") Tj ET\n";
      });
      return cs;
    }

    var numPages = pages.length || 1;
    var fontReg = 3, fontBold = 4, firstPage = 5;
    var kids = [];
    for (var i = 0; i < numPages; i++) kids.push((firstPage + i * 2) + " 0 R");
    var objs = [];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + numPages +
      " /MediaBox [0 0 595 842] /Resources << /Font << /F1 " + fontReg + " 0 R /F2 " + fontBold + " 0 R >> >> >>";
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    for (i = 0; i < numPages; i++) {
      var content = buildCS(pages[i] || []);
      var pageNum = firstPage + i * 2, contNum = pageNum + 1;
      objs[pageNum] = "<< /Type /Page /Parent 2 0 R /Contents " + contNum + " 0 R >>";
      objs[contNum] = "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream";
    }

    var totalObjs = 4 + numPages * 2;
    var pdf = "%PDF-1.4\n", offsets = [];
    for (var n = 1; n <= totalObjs; n++) {
      offsets[n] = pdf.length;
      pdf += n + " 0 obj\n" + objs[n] + "\nendobj\n";
    }
    var xref = pdf.length;
    pdf += "xref\n0 " + (totalObjs + 1) + "\n0000000000 65535 f \n";
    for (n = 1; n <= totalObjs; n++) pdf += pad10(offsets[n]) + " 00000 n \n";
    pdf += "trailer\n<< /Size " + (totalObjs + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";

    var bytes = new Uint8Array(pdf.length);
    for (i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: "application/pdf" });
  }

  el.pdfBtn.addEventListener("click", function () {
    try {
      var blob = generatePdfBlob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "lano-financas-relatorio-" + monthKey() + ".pdf";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (e) {
      alert("Não foi possível gerar o PDF.");
    }
  });

  // ---------- Init ----------
  resetForm();
  setType("in");
  setCat("essencial");
  setRep("always");
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
