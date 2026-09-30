import * as L from "./logic.js?v=8";
import { firebaseStore, memoryStore } from "./store.js?v=8";
import { seedConfig, syncAccess, SEED_ISSUES, newIssueDoc } from "./seed.js?v=8";

const DEMO = new URLSearchParams(location.search).has("demo");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- État ---------- */
const S = {
  store: null, user: null, config: null, access: null, issues: {}, cards: {}, tab: "", error: "", seeding: false, subs: [],
  modal: null, drag: null, d: null,
  f: {
    chapter: "", lateOnly: false,
    desk: { q: "", issue: "", rub: "", person: "", state: "" },
    plan: { person: "", issue: "", phase: "", open: true, view: "list", month: "" },
  },
};
const PH = L.PHASE_KEYS;
const STATE_LABEL = { done: "terminée", late: "en retard", imminent: "imminente", todo: "à faire", unplanned: "à planifier", off: "sans objet" };

/* ---------- Accès aux données ---------- */
const people = () => S.config?.people || [];
const person = (id) => people().find((p) => p.id === id);
const pn = (id) => person(id)?.name || (id ? "Personne supprimée" : "Non attribué");
const ini = (id) => (person(id)?.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
const rubOf = (id) => S.config.rubriques.find((r) => r.id === id);
const chapOf = (id) => S.config.chapters.find((c) => c.id === id);
const colorOf = (id) => S.config.colors.find((c) => c.id === id);
const issueList = () => Object.values(S.issues).sort((a, b) => a.number - b.number);
const cardsArr = () => Object.values(S.cards);
const me = () => people().find((p) => (p.emails || []).map((e) => e.toLowerCase()).includes(S.user?.email));
const isAdmin = () => !!(me()?.admin || S.access?.adminEmails?.includes(S.user?.email));
const imminentDays = () => S.config?.settings?.imminentDays ?? L.IMMINENT_DEFAULT;

function pageColor(p) {
  let id = null;
  if (p.type === "rub") id = rubOf(p.rubId)?.color;
  else if (p.type !== "empty") id = S.config.pageTypeColors?.[p.type];
  const c = id && colorOf(id);
  return c ? { hex: c.hex, text: L.textOn(c.hex), name: c.name } : null;
}
const pageTitle = (p) => (p.type === "rub" ? rubOf(p.rubId)?.name || "Rubrique ?" : p.type === "empty" ? "À attribuer" : L.PAGE_TYPES[p.type]);

function derive() {
  const today = L.todayIso();
  const arr = cardsArr();
  S.d = { today, imminent: imminentDays(), arr, alerts: L.collectAlerts(arr, S.issues, today, imminentDays()) };
}

/* ---------- Démarrage ---------- */
(async function boot() {
  try {
    S.store = DEMO ? memoryStore((await import("./demo.js?v=8")).demoData()) : await firebaseStore();
  } catch (e) { $("#app").innerHTML = `<div class="boot">Impossible de charger l'outil : ${esc(e.message)}</div>`; return; }
  S.store.onAuth(onUser);
})();

function unsubAll() { S.subs.forEach((u) => u && u()); S.subs = []; }
function onUser(u) {
  unsubAll();
  S.user = u; S.error = ""; S.issuesLoaded = false; S.config = null; S.access = null; S.issues = {}; S.cards = {};
  if (!u) return render();
  const fail = (e) => { if (!S.error) { S.error = e?.code === "permission-denied" ? "denied" : "err:" + (e?.message || e); render(); } };
  S.subs.push(S.store.watchDoc("magConfig/main", (c) => {
    if (c === null) { if (!S.seeding) { S.seeding = true; bootstrap().catch(fail); } return; }
    S.config = c; render();
  }, fail));
  S.subs.push(S.store.watchDoc("magConfig/access", (a) => { S.access = a; render(); }, () => {}));
  S.subs.push(S.store.watchCol("magIssues", (m) => { S.issues = m; S.issuesLoaded = true; render(); }, fail));
  S.subs.push(S.store.watchCol("magCards", (m) => { S.cards = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, L.normCard(v)])); render(); }, fail));
  render();
}
async function bootstrap() {
  const cfg = seedConfig(S.user.email);
  await S.store.setDoc("magConfig/main", cfg);
  await S.store.setDoc("magConfig/access", syncAccess(cfg, S.user.email));
  for (const i of SEED_ISSUES) await S.store.setDoc(`magIssues/${i.id}`, newIssueDoc(i));
}
async function saveConfig(cfg, { access = false } = {}) {
  await S.store.setDoc("magConfig/main", cfg);
  if (access) await S.store.setDoc("magConfig/access", syncAccess(cfg));
}
const toastEl = () => $("#toast");
let toastT;
function toast(msg) { const t = toastEl(); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
const fail = (e) => { console.error(e); toast("Échec de l'enregistrement : " + (e?.code === "permission-denied" ? "droits insuffisants" : e?.message || e)); };
const run = (p) => Promise.resolve(p).catch(fail);

/* ---------- Rendu principal ---------- */
function render() {
  const root = $("#app");
  if (!S.user) {
    root.innerHTML = `<div class="gate"><div class="gate-box"><h1>MAGAZINE · SUIVI DE PROD</h1><p>Groupama-FDJ UNITED — chemin de fer, desk et planning de production du magazine trimestriel.</p><button class="btn" data-act="signin">Se connecter avec Google</button></div></div>`;
    return;
  }
  if (S.error) {
    const denied = S.error === "denied";
    root.innerHTML = `<div class="gate"><div class="gate-box"><h1>${denied ? "ACCÈS NON AUTORISÉ" : "ERREUR"}</h1><p>${denied ? `L'adresse <b>${esc(S.user.email)}</b> n'est pas encore autorisée. Demande à un admin de l'ajouter (Admin → Personnes).` : esc(S.error.replace(/^err:/, ""))}</p><button class="btn" data-act="signout">Changer de compte</button></div></div>`;
    return;
  }
  if (!S.config) { root.innerHTML = `<div class="boot">${S.seeding ? "Initialisation de l'outil…" : "Chargement…"}</div>`; return; }
  derive();
  if (!S.tab || (S.tab.startsWith("i:") && !S.issues[S.tab.slice(2)])) {
    const list = issueList();
    const next = list.find((i) => i.releaseDate >= S.d.today) || list[0];
    S.tab = next ? "i:" + next.id : S.issuesLoaded ? "desk" : "";
  }
  if (S.tab === "admin" && !isAdmin()) S.tab = "desk";
  root.innerHTML = headerHtml() + `<main>${viewHtml()}</main>`;
  if (S.modal?.live) renderModal(true);
}

function headerHtml() {
  const a = S.d.alerts;
  const bad = (issueId) => a.late.filter((t) => t.issueId === issueId).length + a.conflicts.filter((c) => c.issueId === issueId).length;
  const tab = (id, label, badge) => `<button class="${S.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${label}${badge ? `<span class="nav-badge">${badge}</span>` : ""}</button>`;
  const m = me(), u = S.user, who = m?.name || u.name || u.email;
  const avatar = `<button class="avatar" data-act="signout" title="Se déconnecter (${esc(u.email)})${DEMO ? " — mode démo" : ""}">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc((who || "?")[0].toUpperCase())}</button>`;
  let sub = "";
  if (S.tab.startsWith("i:") && S.issues[S.tab.slice(2)]) {
    const stx = L.issueStats(S.issues[S.tab.slice(2)], S.cards), pct = Math.round(stx.pct * 100);
    sub = `<div class="toolbar sub"><div class="pct"><span class="lbl">Avancement de production</span><span class="num">${pct} %</span><div class="bar"><i style="width:${pct}%"></i></div><span class="lbl" style="margin-left:6px">${stx.validated}/${stx.total} pages validées</span></div>${DEMO ? `<span class="pill warn push">Mode démo · rien n'est enregistré</span>` : ""}</div>`;
  } else if (S.tab === "desk") {
    sub = `<div class="toolbar sub">${DEMO ? `<span class="pill warn">Mode démo · rien n'est enregistré</span>` : ""}<button class="btn blue push" data-act="new-card">Nouvelle idée</button></div>`;
  }
  return `<div class="hdr"><header class="top"><div class="brand"><img src="logo-blanc.png" alt="Groupama-FDJ UNITED"><b>MAGAZINE</b></div>
    <nav>${issueList().map((i) => tab("i:" + i.id, `N°${i.number}`, bad(i.id))).join("")}${tab("desk", "DESK")}${tab("plan", "PLANNING")}${isAdmin() ? tab("admin", "ADMIN") : ""}</nav>
    <div class="top-actions">${avatar}</div></header>${sub}</div>`;
}
function viewHtml() {
  if (S.tab.startsWith("i:")) return issueView(S.issues[S.tab.slice(2)]);
  if (S.tab === "desk") return deskView();
  if (S.tab === "plan") return planView();
  if (S.tab === "admin") return adminView();
  return "";
}

/* ---------- Composants ---------- */
const peopleOpts = (sel, { photo = false, none = "— Non attribué —" } = {}) => {
  const opt = (p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`;
  let h = `<option value="">${none}</option>`;
  if (sel && !person(sel)) h += `<option value="${esc(sel)}" selected>Personne supprimée</option>`;
  if (photo) h += `<optgroup label="Photographes">${people().filter((p) => p.photographer).map(opt).join("")}</optgroup><optgroup label="Autres (dépannage)">${people().filter((p) => !p.photographer).map(opt).join("")}</optgroup>`;
  else h += people().map(opt).join("");
  return h;
};
const rubOpts = (sel, empty) => (empty ? `<option value="">${empty}</option>` : "") +
  S.config.chapters.map((ch) => `<optgroup label="${esc(ch.name)}">${S.config.rubriques.filter((r) => r.chapterId === ch.id).map((r) => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>`).join("") +
  (S.config.rubriques.some((r) => !chapOf(r.chapterId)) ? `<optgroup label="Sans chapitre">${S.config.rubriques.filter((r) => !chapOf(r.chapterId)).map((r) => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>` : "");
const issueOpts = (sel, empty) => (empty ? `<option value="">${empty}</option>` : "") + issueList().map((i) => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>N°${i.number}${i.title ? " · " + esc(i.title) : ""}</option>`).join("");
const segs = (card) => PH.map((ph) => { const st = L.phaseStatus(card, ph, S.d.today, S.d.imminent); return `<i class="seg st-${st}" title="${L.PHASE_NAMES[ph]} · ${L.PHASE_TITLES[ph]} : ${STATE_LABEL[st]}">${L.PHASE_NAMES[ph]}</i>`; }).join("");

function taskBadge(t) {
  if (t.milestone) return `<span class="pill grey">Jalon</span>`;
  if (t.done) return `<span class="pill ok">Fait</span>`;
  if (!t.date) return `<span class="pill grey">Sans date</span>`;
  const d = L.diffDays(S.d.today, t.date);
  if (d < 0) return `<span class="pill bad">Retard ${-d} j</span>`;
  if (d === 0) return `<span class="pill warn">Aujourd'hui</span>`;
  if (d <= S.d.imminent) return `<span class="pill warn">Dans ${d} j</span>`;
  return `<span class="pill">Dans ${d} j</span>`;
}
const taskAttrs = (t) => `data-card="${t.cardId}" data-phase="${t.phase}" data-key="${t.key}" data-sub="${t.sub || ""}"`;
const tickBtn = (t) => (t.closable ? `<button class="tick ${t.done ? "on" : ""}" data-act="tick" ${taskAttrs(t)} title="${t.done ? "Rouvrir" : "Marquer comme fait"}">${t.done ? "✓" : ""}</button>` : "");

/* ---------- Vue d'un numéro ---------- */
function issueView(issue) {
  if (!issue) return "";
  const st = L.issueStats(issue, S.cards);
  const days = issue.releaseDate ? L.diffDays(S.d.today, issue.releaseDate) : null;
  const pages = L.resolvedPages(issue, S.cards);
  const sp = L.spreads(pages);
  const lateCards = new Set(S.d.alerts.late.map((t) => t.cardId));
  const pct = Math.round(st.pct * 100);
  const ph = (k) => (st.byPhase[k].total ? `${L.PHASE_NAMES[k]} ${st.byPhase[k].closed}/${st.byPhase[k].total}` : `${L.PHASE_NAMES[k]} –`);
  return `
  <div class="head"><div>
      <h2>N°${issue.number}${issue.title ? " — " + esc(issue.title) : ""}</h2>
      <div class="meta">
        <span class="pill ${issue.releaseFinal ? "ok" : "warn"}">Sortie ${issue.releaseDate ? L.fmtDate(issue.releaseDate) : "à définir"} · ${issue.releaseFinal ? "date définitive" : "date provisoire"}</span>
        ${days !== null ? `<span class="pill grey">${days > 0 ? "J-" + days : days === 0 ? "Sortie aujourd'hui" : "Sortie passée"}</span>` : ""}
        ${st.total !== L.PAGES_TOTAL ? `<span class="pill bad">${st.total} pages au lieu de ${L.PAGES_TOTAL}</span>` : ""}
        <button class="btn small" data-act="edit-issue" data-id="${issue.id}">Modifier la date de sortie</button></div></div>
    <div class="progress"><div class="muted small" style="font-weight:700;text-transform:uppercase">Détail de l'avancement</div>
      <div class="stats" style="margin-top:4px"><span>${st.prod} pages de rubrique</span><span>${st.noCard} sans card</span></div>
      <div class="stats" style="margin-top:2px"><span>${ph("a")} · ${ph("b")} · ${ph("c")} <span class="muted">(pages closes)</span></span></div>
      <div class="stats" style="margin-top:2px"><span>${st.total - st.empty}/${st.total} pages attribuées</span><span>Ajustement : ${st.adjust.inter} interc. · ${st.adjust.publi} publi · ${st.adjust.pub} pub</span></div></div></div>
  ${alertsPanel(issue)}
  <div class="tools"><label class="c">Mettre en avant un chapitre&nbsp;<select data-chg="f-chapter"><option value="">Tous</option>${S.config.chapters.map((c) => `<option value="${c.id}" ${S.f.chapter === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label class="c"><input type="checkbox" data-chg="f-late" ${S.f.lateOnly ? "checked" : ""}> Seulement les pages en retard</label>
    <span class="legend">${S.config.colors.map((c) => `<span><i style="background:${c.hex}"></i>${esc(c.name)}</span>`).join("")}</span></div>
  <div class="spreads">${sp.map((pair, idx) => `<div class="spread ${idx === 0 ? "first" : ""}">${pair.map((p) => tile(p, lateCards)).join("")}</div>`).join("")}</div>
  <p class="muted small">Cliquer sur une page pour l'attribuer ou clôturer une phase · glisser-déposer une page sur une autre pour les échanger.</p>`;
}

function tile(p, lateCards) {
  const col = pageColor(p);
  const card = p.type === "rub" && p.cardId ? S.cards[p.cardId] : null;
  const chap = p.type === "rub" ? rubOf(p.rubId)?.chapterId : "";
  let dim = S.f.chapter && chap !== S.f.chapter;
  if (S.f.lateOnly && !(card && lateCards.has(card.id))) dim = true;
  const conflict = card && L.cardAlerts(card, S.issues[card.issueId], S.d.today, S.d.imminent).conflicts.length;
  const body = p.type === "rub" ? (card ? `<div class="t">${esc(card.title)}</div>` : `<div class="k">Sans card</div>`) : p.type === "empty" ? "" : `<div class="k">${esc(p.label || "")}</div>`;
  return `<div class="pg ${dim ? "dim" : ""} ${card && lateCards.has(card.id) ? "late" : ""}" role="button" tabindex="0" draggable="true" data-act="page" data-id="${p.id}" data-drop="${p.id}"
      style="${col ? `--c:${col.hex};--t:${col.text}` : ""}" title="${esc(pageTitle(p))}${p.auto ? " · card liée automatiquement" : ""}">
    <div class="pg-top"><b>${p.pos}</b><span>${esc(pageTitle(p))}</span></div>
    <div class="pg-body">${body}</div>
    <div class="pg-foot">${card ? segs(card) : ""}</div>${conflict ? `<span class="warn-flag" title="Conflit de dates">!</span>` : p.celebrated && card && L.isPageComplete(card) ? `<span class="ok-flag" title="Page validée">✓</span>` : ""}</div>`;
}

function taskLine(t) {
  return `<li><a data-act="open-card" data-id="${t.cardId}"><b>${esc(t.label)}</b> — « ${esc(t.cardTitle)} »</a> · échéance ${L.fmtDate(t.date)}${t.daysLate ? ` (<b>${t.daysLate} j de retard</b>)` : ""}</li>`;
}
function alertsPanel(issue) {
  const a = S.d.alerts;
  const late = a.late.filter((t) => t.issueId === issue.id), soon = a.soon.filter((t) => t.issueId === issue.id), conf = a.conflicts.filter((c) => c.issueId === issue.id);
  if (!late.length && !soon.length && !conf.length) return `<div class="panel"><span class="pill ok">Aucun retard ni conflit de dates sur ce numéro</span></div>`;
  const groups = [...L.groupBy(late, (t) => t.assignee)].sort((x, y) => y[1].length - x[1].length);
  return `<div class="panel">${late.length ? `<h3>Retards · alerte nominative</h3>${groups.map(([id, ts]) => `<div class="alert-person"><b class="who">${esc(pn(id))}</b> — ${ts.length} tâche${ts.length > 1 ? "s" : ""} en retard${id ? "" : " (personne à désigner)"}<ul class="alert-list">${ts.map(taskLine).join("")}</ul></div>`).join("")}` : ""}
    ${conf.length ? `<div class="box-bad" style="margin-top:${late.length ? 10 : 0}px"><b>Conflits de dates à corriger (${conf.length})</b><ul class="alert-list">${conf.map((c) => `<li><a data-act="open-card" data-id="${c.cardId}">« ${esc(c.cardTitle)} »</a> — ${esc(c.msg)}${c.assignee ? ` · concerne ${esc(pn(c.assignee))}` : ""}</li>`).join("")}</ul></div>` : ""}
    ${soon.length ? `<div class="box-warn"><b>Échéances imminentes (${soon.length})</b><ul class="alert-list">${soon.map((t) => `<li><a data-act="open-card" data-id="${t.cardId}"><b>${esc(t.label)}</b> — « ${esc(t.cardTitle)} »</a> · ${esc(pn(t.assignee))} · ${t.inDays === 0 ? "aujourd'hui" : "dans " + t.inDays + " j"} (${L.fmtDate(t.date)})</li>`).join("")}</ul></div>` : ""}</div>`;
}

/* ---------- Desk ---------- */
function cardState(c) {
  const al = L.cardAlerts(c, S.issues[c.issueId], S.d.today, S.d.imminent);
  const pr = L.cardProgress(c);
  const on = PH.filter((p) => c.phases[p] !== false);
  return { al, pr, done: pr === 1, unplanned: on.every((p) => L.phaseStatus(c, p, S.d.today) === "unplanned") };
}
function cardInvolves(c, pid) {
  return L.cardTasks(c).some((t) => t.assignee === pid) || c.c.vdef.validator === pid;
}
function filteredCards() {
  const f = S.f.desk, q = f.q.trim().toLowerCase();
  return S.d.arr.filter((c) => {
    if (q && !(c.title.toLowerCase().includes(q) || (rubOf(c.rubId)?.name || "").toLowerCase().includes(q))) return false;
    if (f.issue === "none" ? c.issueId : f.issue && c.issueId !== f.issue) return false;
    if (f.rub && c.rubId !== f.rub) return false;
    if (f.person && !cardInvolves(c, f.person)) return false;
    if (f.state) {
      const s = cardState(c);
      if (f.state === "late" && !s.al.late.length) return false;
      if (f.state === "conflict" && !s.al.conflicts.length) return false;
      if (f.state === "done" && !s.done) return false;
      if (f.state === "wip" && (s.done || s.unplanned)) return false;
      if (f.state === "unplanned" && !s.unplanned) return false;
    }
    return true;
  }).sort((a, b) => (S.issues[a.issueId]?.number ?? 99) - (S.issues[b.issueId]?.number ?? 99) || (a.createdAt || 0) - (b.createdAt || 0));
}
function cardFace(c) {
  const rub = rubOf(c.rubId), col = rub && colorOf(rub.color), s = cardState(c), issue = S.issues[c.issueId];
  const pages = issue ? L.fmtPages(L.cardPagePositions(issue, c.id, S.cards)) : "";
  const next = L.cardTasks(c).filter((t) => t.closable && !t.done && t.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  const late = s.al.late[0];
  return `<div class="card ${s.al.conflicts.length ? "conflict" : ""}" role="button" tabindex="0" data-act="open-card" data-id="${c.id}" style="--c:${col?.hex || "#8494A8"}">
    <div class="chips">${issue ? `<span class="pill grey">N°${issue.number}</span>` : `<span class="pill warn">Sans numéro</span>`}<span class="pill grey"><i class="swatch" style="background:${col?.hex || "#ccc"}"></i>${esc(rub?.name || "Sans rubrique")}</span>${pages ? `<span class="pill">${pages}</span>` : ""}</div>
    <h4>${esc(c.title)}</h4>
    <div class="segs">${segs(c)}</div>
    <div class="next">${Math.round(s.pr * 100)} % · ${next ? `Prochaine : ${L.fmtShort(next.date)} ${esc(next.label)} (${esc(ini(next.assignee))})` : s.done ? "Terminée" : "Échéances à planifier"}</div>
    ${late ? `<div class="msg">Retard : ${esc(pn(late.assignee))} — ${esc(late.label)} (${late.daysLate} j)</div>` : ""}
    ${s.al.conflicts.length ? `<div class="msg">Conflit de dates (${s.al.conflicts.length})</div>` : ""}</div>`;
}
function deskView() {
  const f = S.f.desk;
  return `<div class="head" style="grid-template-columns:1fr"><div><h2>DESK ÉDITORIAL</h2><div class="muted">Les idées d'angle, rattachées à une rubrique et à un numéro, avec leurs trois phases de production.</div></div></div>
  <div class="tools"><input type="search" placeholder="Rechercher un angle…" value="${esc(f.q)}" data-inp="desk-q">
    <select data-chg="desk-issue">${issueOpts(f.issue, "Tous les numéros")}<option value="none" ${f.issue === "none" ? "selected" : ""}>Sans numéro</option></select>
    <select data-chg="desk-rub">${rubOpts(f.rub, "Toutes les rubriques")}</select>
    <select data-chg="desk-person">${peopleOpts(f.person, { none: "Toutes les personnes" })}</select>
    <select data-chg="desk-state">${[["", "Tous les états"], ["late", "En retard"], ["conflict", "Conflit de dates"], ["wip", "En cours"], ["unplanned", "Non planifiées"], ["done", "Terminées"]].map(([v, l]) => `<option value="${v}" ${f.state === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
  <div class="cards" id="desk-list">${deskCards()}</div>`;
}
function deskCards() {
  const l = filteredCards();
  return l.length ? l.map(cardFace).join("") : `<div class="muted">Aucune card ne correspond.</div>`;
}

/* ---------- Planning de prod ---------- */
function planTasks() {
  const f = S.f.plan;
  return S.d.arr.filter((c) => c.issueId && S.issues[c.issueId]).flatMap((c) => L.cardTasks(c)).filter((t) => {
    if (f.person && t.assignee !== f.person) return false;
    if (f.issue && t.issueId !== f.issue) return false;
    if (f.phase && t.phase !== f.phase) return false;
    if (f.open && (t.done || (t.milestone && t.date && t.date < S.d.today))) return false;
    return true;
  }).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "").localeCompare(b.time || ""));
}
function planView() {
  const f = S.f.plan, m = me();
  return `<div class="head" style="grid-template-columns:1fr"><div><h2>PLANNING</h2><div class="muted">Toutes les échéances des cards, filtrables par personne, numéro et phase.</div></div></div>
  <div class="tools"><select data-chg="plan-person">${peopleOpts(f.person, { none: "Toute l'équipe" })}</select>
    ${m ? `<button class="btn small" data-act="plan-me">Mes tâches</button>` : ""}
    <select data-chg="plan-issue">${issueOpts(f.issue, "Tous les numéros")}</select>
    <select data-chg="plan-phase"><option value="">Toutes les phases</option>${PH.map((p) => `<option value="${p}" ${f.phase === p ? "selected" : ""}>${L.PHASE_NAMES[p]} · ${L.PHASE_TITLES[p]}</option>`).join("")}</select>
    <label class="c"><input type="checkbox" data-chg="plan-open" ${f.open ? "checked" : ""}> Masquer ce qui est fait</label>
    <span style="margin-left:auto" class="tools"><button class="btn small ${f.view === "list" ? "primary" : ""}" data-act="plan-view" data-v="list">Liste</button><button class="btn small ${f.view === "cal" ? "primary" : ""}" data-act="plan-view" data-v="cal">Calendrier</button></span></div>
  ${f.view === "cal" ? calendar(planTasks()) : planList(planTasks())}`;
}
function planList(tasks) {
  if (!tasks.length) return `<div class="muted">Aucune échéance pour ces filtres.</div>`;
  const groups = [...L.groupBy(tasks, (t) => t.date)];
  return groups.map(([date, ts]) => `<div class="day ${date === S.d.today ? "today" : ""}"><h3>${date ? L.fmtDay(date).replace(/^./, (c) => c.toUpperCase()) + (date === S.d.today ? " · aujourd'hui" : "") : "Sans date (à planifier)"}</h3>
    ${ts.map((t) => `<div class="row ${t.done ? "done" : ""}"><span class="muted">${esc(t.time || "")}</span>
      <span class="chips"><span class="pill grey">N°${S.issues[t.issueId].number}</span><span class="pill">${L.PHASE_NAMES[t.phase]}</span></span>
      <span><span class="ttl">${esc(t.label)}</span> — <a data-act="open-card" data-id="${t.cardId}">${esc(t.cardTitle)}</a></span>
      <span>${esc(pn(t.assignee))}</span><span style="display:flex;gap:8px;align-items:center">${tickBtn(t)}${taskBadge(t)}</span></div>`).join("")}</div>`).join("");
}
function calendar(tasks) {
  const f = S.f.plan;
  const month = f.month || S.d.today.slice(0, 8) + "01";
  const first = L.parse(month); const startDow = (first.getDay() + 6) % 7;
  const start = L.addDays(month, -startDow);
  const by = L.groupBy(tasks.filter((t) => t.date), (t) => t.date);
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = L.addDays(start, i), out = d.slice(0, 7) !== month.slice(0, 7), evs = by.get(d) || [];
    const cls = (t) => (t.done ? "done" : !t.milestone && t.date < S.d.today ? "late" : L.diffDays(S.d.today, t.date) <= S.d.imminent && !t.milestone ? "imminent" : "");
    cells += `<div class="d ${out ? "out" : ""} ${d === S.d.today ? "today" : ""}"><div class="n">${+d.slice(8)}</div>${evs.slice(0, 4).map((t) => { const col = colorOf(rubOf(t.rubId)?.color)?.hex || "#8494A8"; return `<button class="ev ${cls(t)}" style="--rc:${col}" data-act="open-card" data-id="${t.cardId}" title="${esc(t.cardTitle + "\n" + t.label + " · " + L.PHASE_NAMES[t.phase] + " · " + pn(t.assignee) + (rubOf(t.rubId) ? "\n" + rubOf(t.rubId).name : "") + " · N°" + (S.issues[t.issueId]?.number ?? "?"))}"><span class="t">${esc(t.cardTitle)}</span><span class="s">N°${S.issues[t.issueId]?.number ?? "?"} · ${L.PHASE_NAMES[t.phase]} ${esc(t.label)} · ${esc(ini(t.assignee))}</span></button>`; }).join("")}${evs.length > 4 ? `<div class="muted small">+${evs.length - 4}</div>` : ""}</div>`;
  }
  return `<div class="tools"><button class="btn small" data-act="month" data-d="-1">←</button><b style="text-transform:capitalize;min-width:150px;text-align:center">${first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</b><button class="btn small" data-act="month" data-d="1">→</button><button class="btn small" data-act="month" data-d="0">Aujourd'hui</button></div>
    <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="h">${d}</div>`).join("")}${cells}</div>`;
}

/* ---------- Fenêtres ---------- */
function openModal(m) { S.modal = m; renderModal(); }
function closeModal() { S.modal = null; $("#modal-root").innerHTML = ""; }
function renderModal(keepScroll) {
  const m = S.modal; if (!m) return;
  const veil = $("#modal-root .veil"); const sc = veil ? veil.scrollTop : 0;
  let html = "";
  if (m.kind === "card") html = cardModalHtml();
  else if (m.kind === "page") html = pageModalHtml();
  else if (m.kind === "issue") html = issueModalHtml();
  else if (m.kind === "newissue") html = newIssueModalHtml();
  if (!html) return closeModal();
  $("#modal-root").innerHTML = `<div class="veil" data-veil>${html}</div>`;
  if (keepScroll && $("#modal-root .veil")) $("#modal-root .veil").scrollTop = sc;
}

/* --- Date de sortie --- */
function issueModalHtml() {
  const i = S.issues[S.modal.id]; if (!i) return "";
  return `<div class="modal narrow"><header><h3>N°${i.number} · DATE DE SORTIE</h3><button class="x" data-act="close">✕</button></header>
    <div class="body grid"><label class="f"><span>Titre du numéro (facultatif)</span><input type="text" id="iss-title" value="${esc(i.title)}"></label>
      <label class="f"><span>Date de sortie</span><input type="date" id="iss-date" value="${esc(i.releaseDate)}"></label>
      <label class="c"><input type="checkbox" id="iss-final" ${i.releaseFinal ? "checked" : ""}> Date définitive (décocher = provisoire)</label>
      <div class="muted small">Toute échéance de card postérieure à cette date est signalée en rouge comme erreur de saisie.</div></div>
    <footer><button class="btn" data-act="close">Annuler</button><button class="btn primary" data-act="issue-save">Enregistrer</button></footer></div>`;
}

/* --- Page du chemin de fer (mise à jour en direct, sans brouillon) --- */
function pageModalHtml() {
  const issue = S.issues[S.modal.issueId], raw = issue?.pages?.[S.modal.slotId];
  if (!raw) return "";
  const p = { id: S.modal.slotId, ...raw };
  const res = L.resolvedPages(issue, S.cards).find((x) => x.id === p.id);
  const card = res?.cardId ? S.cards[res.cardId] : null;
  const same = cardsArr().filter((c) => c.issueId === issue.id && c.rubId === p.rubId);
  const cands = cardsArr().filter((c) => c.issueId === issue.id || !c.issueId).sort((a, b) => (b.rubId === p.rubId) - (a.rubId === p.rubId) || a.title.localeCompare(b.title));
  const autoNote = res?.auto ? `<div class="muted small" style="margin-top:4px">Card liée automatiquement : c'est la seule card de « ${esc(rubOf(p.rubId)?.name || "")} » dans ce numéro (elle s'applique à toutes les pages de la rubrique).</div>` : p.type === "rub" && p.rubId && !p.cardId && same.length > 1 ? `<div class="box-warn" style="margin-top:6px">${same.length} cards existent pour cette rubrique dans ce numéro : choisis laquelle va sur cette page.</div>` : "";
  const cardSel = p.type === "rub" ? `<label class="f"><span>Card du desk</span><select data-chg="pg-card"><option value="" ${!p.cardId ? "selected" : ""}>Automatique (card de la rubrique dans ce numéro)</option><option value="-" ${p.cardId === "-" ? "selected" : ""}>Aucune card sur cette page</option>${cands.map((c) => `<option value="${c.id}" ${c.id === p.cardId ? "selected" : ""}>${esc(c.title)} · ${esc(rubOf(c.rubId)?.name || "?")}${c.issueId ? "" : " (sans numéro)"}</option>`).join("")}<option value="__new">+ Créer une nouvelle card pour cette page…</option></select></label>${autoNote}` : "";
  return `<div class="modal"><header><h3>PAGE ${p.pos} · N°${issue.number}</h3><button class="x" data-act="close">✕</button></header><div class="body">
    <div class="grid g2"><label class="f"><span>Type de page</span><select data-chg="pg-type">${Object.entries(L.PAGE_TYPES).map(([k, v]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${p.type === "rub" ? `<label class="f"><span>Rubrique</span><select data-chg="pg-rub">${rubOpts(p.rubId, "— Choisir —")}</select></label>` : p.type !== "empty" ? `<label class="f"><span>Mention (annonceur, thème…)</span><input type="text" data-chg="pg-label" value="${esc(p.label)}"></label>` : "<div></div>"}</div>
    ${p.type === "rub" ? `<div style="margin-top:10px">${cardSel}</div>` : ""}
    ${celebrateBlock(p, card)}
    ${p.type !== "empty" ? `<div class="panel" style="margin:12px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Appliquer aussi aux</b><input type="number" id="pg-count" min="1" max="${L.pagesSorted(issue).length - p.pos}" value="1" style="width:74px"><b>pages suivantes</b>${p.type === "rub" && p.cardId ? `<label class="c"><input type="checkbox" id="pg-count-card" checked> même card</label>` : ""}<button class="btn small primary" data-act="pg-apply">Appliquer</button><span class="muted small">Recopie le type${p.type === "rub" ? ", la rubrique" : " et la mention"} sur les pages ${p.pos + 1} à …</span></div>` : ""}
    ${p.type === "rub" && p.rubId ? `<div class="muted small" style="margin-top:6px">Chapitre : ${esc(chapOf(rubOf(p.rubId)?.chapterId)?.name || "—")}</div>` : ""}
    ${["inter", "publi", "pub"].includes(p.type) ? `<div class="box-warn">Page d'ajustement hors chemin de fer : elle aide à atteindre ${L.PAGES_TOTAL} pages et n'entre pas dans le calcul d'avancement.</div>` : ""}
    ${card ? pageCardPanel(card) : ""}</div>
    <footer><button class="btn" data-act="pg-insert">Insérer une page avant</button><button class="btn danger" data-act="pg-remove">Retirer cette page</button><span style="flex:1"></span><button class="btn primary" data-act="close">Fermer</button></footer></div>`;
}
function celebrateBlock(p, card) {
  if (p.type !== "rub") return "";
  if (!card) return `<div class="celebrate"><div class="bigbtn off"><img src="celebration-still.jpg" alt=""><span>Bouton de validation de la page<br><b>Rattache une card à cette page</b> puis clôture ses phases pour pouvoir le presser.</span></div></div>`;
  if (!L.isPageComplete(card)) {
    const left = PH.reduce((n, ph) => { const pr = L.phaseProgress(card, ph); return n + (pr.enabled ? pr.total - pr.done : 0); }, 0);
    return `<div class="celebrate"><div class="bigbtn off"><img src="celebration-still.jpg" alt=""><span>Bouton de validation de la page<br><b>Encore ${left} étape${left > 1 ? "s" : ""} à clôturer</b> avant de pouvoir le presser.</span></div></div>`;
  }
  if (p.celebrated) return `<div class="celebrate done"><span class="pill ok">Page validée</span><button class="btn small" data-act="celebrate-play">Rejouer la célébration</button><button class="btn small ghost" data-act="celebrate-undo">Annuler la validation</button></div>`;
  return `<div class="celebrate"><button class="bigbtn" data-act="celebrate" title="Valider la page et célébrer"><img src="celebration-still.jpg" alt=""><span>Toutes les phases sont closes.<br><b>Appuie sur le bouton pour valider la page !</b></span></button></div>`;
}
let gifBytes = null;
async function playCelebration() {
  try {
    if (!gifBytes) gifBytes = await (await fetch("celebration.gif?v=8")).arrayBuffer();
    const url = URL.createObjectURL(new Blob([gifBytes], { type: "image/gif" })); // nouvelle URL à chaque fois : l'animation repart du début
    $("#celebrate")?.remove();
    const el = document.createElement("div"); el.id = "celebrate";
    el.innerHTML = `<img src="${url}" alt="Page validée !">`;
    const end = () => { el.remove(); URL.revokeObjectURL(url); };
    el.addEventListener("click", end); document.body.appendChild(el); setTimeout(end, 3600);
  } catch (e) { toast("Page validée !"); }
}
function pageCardPanel(card) {
  const issue = S.issues[card.issueId], al = L.cardAlerts(card, issue, S.d.today, S.d.imminent);
  const tasks = L.cardTasks(card);
  const phaseBlock = (ph) => {
    const pr = L.phaseProgress(card, ph), st = L.phaseStatus(card, ph, S.d.today, S.d.imminent);
    const ts = tasks.filter((t) => t.phase === ph);
    return `<div class="panel" style="margin:10px 0 0"><div style="display:flex;gap:10px;align-items:center"><h3 style="margin:0">${L.PHASE_NAMES[ph]} · ${L.PHASE_TITLES[ph]}</h3><i class="seg st-${st}" style="flex:none;padding:2px 10px">${STATE_LABEL[st]}</i><span class="muted small">${pr.enabled ? `${pr.done}/${pr.total} étapes` : ""}</span>
      ${pr.enabled ? `<button class="btn small" style="margin-left:auto" data-act="close-phase" data-card="${card.id}" data-phase="${ph}">${pr.closed ? "Rouvrir la phase" : "Clôturer la phase"}</button>` : `<span class="muted small" style="margin-left:auto">Phase désactivée pour cette card</span>`}</div>
      ${pr.enabled ? `<table class="t"><tbody>${ts.map((t) => `<tr><td style="width:34px">${tickBtn(t)}</td><td>${esc(t.label)}</td><td class="nowrap">${t.date ? L.fmtDate(t.date) + (t.time ? " " + esc(t.time) : "") : "—"}</td><td>${esc(pn(t.assignee))}</td><td>${taskBadge(t)}</td></tr>`).join("")}</tbody></table>` : ""}</div>`;
  };
  return `<div style="margin-top:14px;display:flex;gap:10px;align-items:center"><h3 style="font-size:24px">« ${esc(card.title)} »</h3><button class="btn small" data-act="open-card" data-id="${card.id}">Ouvrir la card</button><span class="pill grey">${Math.round(L.cardProgress(card) * 100)} %</span></div>
    ${PH.map(phaseBlock).join("")}
    ${al.conflicts.length ? `<div class="box-bad"><b>Conflits de dates</b><ul class="alert-list">${al.conflicts.map((c) => `<li>${esc(c.msg)}</li>`).join("")}</ul></div>` : ""}`;
}

/* --- Card (brouillon local, enregistré au clic) --- */
const getPath = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, path, v) { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; }
const F = {
  inp: (d, path, label, type = "text", extra = "") => `<label class="f"><span>${label}</span><input type="${type}" data-p="${path}" value="${esc(getPath(d, path))}" ${extra}></label>`,
  area: (d, path, label) => `<label class="f"><span>${label}</span><textarea data-p="${path}">${esc(getPath(d, path))}</textarea></label>`,
  sel: (d, path, label, opts) => `<label class="f"><span>${label}</span><select data-p="${path}">${opts}</select></label>`,
  ppl: (d, path, label, o) => F.sel(d, path, label, peopleOpts(getPath(d, path), o)),
  chk: (d, path, label, rr) => `<label class="c"><input type="checkbox" data-p="${path}" ${rr ? "data-rr" : ""} ${getPath(d, path) ? "checked" : ""}> ${label}</label>`,
  url: (d, path, label) => `<div style="display:flex;gap:6px;align-items:flex-end">${F.inp(d, path, label, "url", 'placeholder="https://drive.google.com/…" style="flex:1"').replace('<label class="f">', '<label class="f" style="flex:1">')}${getPath(d, path) ? `<a class="btn small" href="${esc(getPath(d, path))}" target="_blank" rel="noopener">Ouvrir</a>` : ""}</div>`,
};
function cardModalHtml() {
  const d = S.modal.draft, isNew = !S.modal.id;
  const phase = (ph, inner) => `<fieldset class="ph ${d.phases[ph] === false ? "off" : ""}"><legend>${L.PHASE_NAMES[ph]} · ${L.PHASE_TITLES[ph].toUpperCase()} <label class="c" style="font-family:var(--body)"><input type="checkbox" data-p="phases.${ph}" data-rr ${d.phases[ph] !== false ? "checked" : ""}> Phase prévue</label></legend><div class="in">${inner}</div></fieldset>`;
  const iv = d.a.recolte.interviews.map((v, i) => { const b = `a.recolte.interviews.${i}`; return `<div class="iv"><div class="grid g4">${F.inp(d, b + ".date", "Date / deadline", "date")}${F.inp(d, b + ".time", "Heure du RDV", "time")}${F.inp(d, b + ".who", "Personne concernée")}${F.inp(d, b + ".phone", "Téléphone", "tel")}</div>
      <div class="grid g3" style="margin-top:8px;align-items:end">${F.chk(d, b + ".field", "Récolte terrain (pas à distance)", true)}${v.field ? "<div></div>" : F.inp(d, b + ".visio", "Lien visio", "url")}${F.ppl(d, b + ".collector", "Qui récolte")}</div>
      <div style="display:flex;gap:14px;margin-top:8px;align-items:center">${F.chk(d, b + ".done", "Récolte faite")}<button class="btn small danger" data-act="iv-del" data-i="${i}" style="margin-left:auto">Supprimer</button></div></div>`; }).join("");
  const A = phase("a", `
    <div class="step"><h4>Récolte du contenu ${F.chk(d, "a.recolte.skip", "Pas de récolte pour cette card", true)}</h4>
      ${d.a.recolte.skip ? "" : `${iv || `<div class="muted small" style="margin-bottom:6px">Aucune interview saisie.</div>`}<button class="btn small" data-act="iv-add">+ Ajouter une interview / récolte</button>`}</div>
    <div class="step"><h4>Rédaction V1</h4><div class="grid g3">${F.inp(d, "a.v1.date", "Deadline de livraison V1", "date")}${F.ppl(d, "a.v1.writer", "Qui écrit")}${F.url(d, "a.v1.url", "Lien Drive du texte")}</div><div style="margin-top:6px">${F.chk(d, "a.v1.done", "V1 livrée")}</div></div>
    <div class="step"><h4>Relecture · version définitive</h4><div class="grid g3">${F.inp(d, "a.vdef.date", "Deadline de validation vdef", "date")}${F.ppl(d, "a.vdef.reviewer", "Qui relit et valide")}<div class="muted small" style="align-self:end">Même lien Drive que la V1${d.a.v1.url ? ` : <a href="${esc(d.a.v1.url)}" target="_blank" rel="noopener">ouvrir</a>` : ""}</div></div><div style="margin-top:6px">${F.chk(d, "a.vdef.done", "Vdef validée")}</div></div>`);
  const B = phase("b", `
    <div class="step"><h4>Brief au photographe</h4><div class="grid g2">${F.inp(d, "b.brief.date", "Deadline de livraison du brief", "date")}${F.ppl(d, "b.brief.author", "Qui rédige le brief")}</div>${F.area(d, "b.brief.text", "Brief")}<div style="margin-top:6px">${F.chk(d, "b.brief.done", "Brief livré")}</div></div>
    <div class="step"><h4>Reportage photo</h4><div class="grid g3">${F.inp(d, "b.shoot.date", "Date du reportage", "date")}${F.inp(d, "b.shoot.time", "Heure", "time")}${F.ppl(d, "b.shoot.photographer", "Photographe", { photo: true })}</div><div class="grid g2" style="margin-top:8px">${F.inp(d, "b.shoot.place", "Lieu des photos")}${F.inp(d, "b.shoot.contact", "Contact sur place")}</div><div style="margin-top:6px">${F.chk(d, "b.shoot.done", "Reportage réalisé")}</div></div>
    <div class="step"><h4>Livraison des photos</h4><div class="grid g2">${F.inp(d, "b.delivery.date", "Deadline de livraison des photos", "date")}${F.url(d, "b.delivery.url", "Lien Drive des photos")}</div><div style="margin-top:6px">${F.chk(d, "b.delivery.done", "Photos livrées")}</div></div>`);
  const C = phase("c", `
    <div class="step"><h4>Début de conception</h4><div class="grid g2">${F.inp(d, "c.start.date", "Date de début de conception", "date")}${F.ppl(d, "c.designer", "Qui fait le graphisme")}</div><div class="muted small" style="margin-top:4px">Les échéances 1A et 1B doivent se terminer avant cette date, sinon un conflit s'affiche en rouge.</div></div>
    <div class="step"><h4>Livraison V1</h4><div class="grid g2">${F.inp(d, "c.v1.date", "Deadline V1", "date")}${F.url(d, "c.v1.url", "Lien Drive V1")}</div><div style="margin-top:6px">${F.chk(d, "c.v1.done", "V1 livrée")}</div></div>
    <div class="step"><h4>Livraison vdef</h4><div class="grid g3">${F.inp(d, "c.vdef.date", "Deadline vdef", "date")}${F.url(d, "c.vdef.url", "Lien Drive vdef (différent de la V1)")}${F.ppl(d, "c.vdef.validator", "Qui valide")}</div><div style="margin-top:6px">${F.chk(d, "c.vdef.done", "Vdef validée")}</div></div>`);
  const issue = S.issues[d.issueId], pages = issue && S.modal.id ? L.fmtPages(L.cardPagePositions(issue, S.modal.id, S.cards)) : "";
  return `<div class="modal"><header><h3>${isNew ? "NOUVELLE IDÉE" : "CARD"}</h3><button class="x" data-act="close-card">✕</button></header><div class="body">
    <div class="grid g3" style="grid-template-columns:2fr 1fr 1fr">${F.inp(d, "title", "Angle éditorial (titre)")}${F.sel(d, "rubId", "Rubrique", rubOpts(d.rubId, "— Choisir —"))}${F.sel(d, "issueId", "Numéro du magazine", issueOpts(d.issueId, "— Pas encore affecté —"))}</div>
    ${pages ? `<div class="muted small" style="margin-top:4px">Placée sur le chemin de fer : ${pages}</div>` : ""}
    ${A}${B}${C}
    <div style="margin-top:12px">${F.area(d, "notes", "Notes")}</div>
    <div id="card-alerts">${draftAlerts()}</div></div>
    <footer>${isNew ? "" : `<button class="btn danger" data-act="card-del">Supprimer la card</button>`}<span style="flex:1"></span><button class="btn" data-act="close-card">Annuler</button><button class="btn primary" data-act="card-save">Enregistrer</button></footer></div>`;
}
function draftAlerts() {
  const d = S.modal.draft, al = L.cardAlerts({ id: S.modal.id || "draft", ...d }, S.issues[d.issueId], S.d.today, S.d.imminent);
  return `${al.conflicts.length ? `<div class="box-bad"><b>Conflits de dates</b><ul class="alert-list">${al.conflicts.map((c) => `<li>${esc(c.msg)}</li>`).join("")}</ul></div>` : ""}
    ${al.late.length ? `<div class="box-bad"><b>En retard</b><ul class="alert-list">${al.late.map((t) => `<li>${esc(pn(t.assignee))} — ${esc(t.label)} (${t.daysLate} j)</li>`).join("")}</ul></div>` : ""}`;
}

function newIssueModalHtml() {
  const next = Math.max(0, ...issueList().map((i) => i.number)) + 1;
  return `<div class="modal narrow"><header><h3>NOUVEAU NUMÉRO</h3><button class="x" data-act="close">✕</button></header><div class="body grid">
    <div class="grid g2"><label class="f"><span>Numéro</span><input type="number" id="ni-num" min="1" value="${next}"></label><label class="f"><span>Date de sortie (provisoire)</span><input type="date" id="ni-date"></label></div>
    <label class="f"><span>Titre (facultatif)</span><input type="text" id="ni-title"></label>
    <label class="f"><span>Partir du numéro</span><select id="ni-src"><option value="">— Chemin de fer vide —</option>${issueList().map((i) => `<option value="${i.id}" ${S.modal.src === i.id ? "selected" : ""}>N°${i.number}</option>`).join("")}</select></label>
    <div class="muted small">Reprend uniquement les chapitres, rubriques et types de pages du numéro choisi — pas les angles du desk.</div></div>
    <footer><button class="btn" data-act="close">Annuler</button><button class="btn primary" data-act="issue-create">Créer</button></footer></div>`;
}

/* ---------- Admin ---------- */
function usage(kind, id) {
  if (kind === "rub") return cardsArr().filter((c) => c.rubId === id).length + issueList().reduce((n, i) => n + Object.values(i.pages || {}).filter((p) => p.rubId === id).length, 0);
  if (kind === "person") return cardsArr().reduce((n, c) => n + L.cardTasks(c).filter((t) => t.assignee === id).length + (c.c.vdef.validator === id ? 1 : 0), 0);
  return 0;
}
function adminView() {
  const cfg = S.config, rubs = cfg.rubriques;
  const iRow = (i) => `<tr><td><b>N°${i.number}</b></td><td><input type="text" value="${esc(i.title)}" data-adm="iss:${i.id}:title" placeholder="Titre"></td>
    <td><input type="date" value="${esc(i.releaseDate)}" data-adm="iss:${i.id}:releaseDate"></td><td><label class="c"><input type="checkbox" data-adm="iss:${i.id}:releaseFinal" ${i.releaseFinal ? "checked" : ""}> définitive</label></td>
    <td class="nowrap"><button class="btn small" data-act="new-issue" data-src="${i.id}">Partir de ce numéro</button> <button class="btn small danger" data-act="del-issue" data-id="${i.id}">Supprimer</button></td></tr>`;
  const colOpts = (sel) => cfg.colors.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  return `<div class="head" style="grid-template-columns:1fr"><div><h2>ADMINISTRATION</h2><div class="muted">Chapitres, rubriques, couleurs, équipe, accès et numéros. Chaque modification est enregistrée immédiatement.</div></div></div>
  <div class="panel adm-sec"><h3>Numéros</h3><table class="t"><thead><tr><th>N°</th><th>Titre</th><th>Date de sortie</th><th></th><th></th></tr></thead><tbody>${issueList().map(iRow).join("")}</tbody></table><div style="margin-top:8px"><button class="btn small" data-act="new-issue">+ Nouveau numéro</button></div></div>
  <div class="panel adm-sec"><h3>Chapitres et rubriques</h3>
    ${cfg.chapters.map((ch, ci) => `<div class="adm-chap"><div class="ch"><input type="text" value="${esc(ch.name)}" data-adm="chap:${ch.id}:name"><button class="iconb" data-act="adm" data-a="chap-up" data-id="${ch.id}" title="Monter" ${ci === 0 ? "disabled" : ""}>↑</button><button class="iconb" data-act="adm" data-a="chap-down" data-id="${ch.id}" title="Descendre" ${ci === cfg.chapters.length - 1 ? "disabled" : ""}>↓</button><button class="btn small danger" data-act="adm" data-a="chap-del" data-id="${ch.id}">Supprimer</button></div>
      <table class="t"><tbody>${rubs.filter((r) => r.chapterId === ch.id).map((r) => `<tr><td><input type="text" value="${esc(r.name)}" data-adm="rub:${r.id}:name"></td>
        <td style="width:210px"><select data-adm="rub:${r.id}:chapterId" title="Chapitre parent">${cfg.chapters.map((c) => `<option value="${c.id}" ${c.id === r.chapterId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></td>
        <td style="width:190px"><select data-adm="rub:${r.id}:color">${colOpts(r.color)}</select></td>
        <td class="nowrap" style="width:130px"><span class="swatch" style="background:${colorOf(r.color)?.hex || "#ccc"};width:18px;height:18px"></span><button class="iconb" data-act="adm" data-a="rub-up" data-id="${r.id}">↑</button> <button class="iconb" data-act="adm" data-a="rub-down" data-id="${r.id}">↓</button> <button class="iconb" style="color:var(--red)" data-act="adm" data-a="rub-del" data-id="${r.id}" title="Supprimer">✕</button></td></tr>`).join("")}</tbody></table>
      <button class="btn small" data-act="adm" data-a="rub-add" data-id="${ch.id}">+ Rubrique</button></div>`).join("")}
    <button class="btn small" data-act="adm" data-a="chap-add">+ Chapitre</button></div>
  <div class="panel adm-sec"><h3>Couleurs</h3><table class="t"><thead><tr><th>Nom</th><th>Code</th><th></th></tr></thead><tbody>${cfg.colors.map((c) => `<tr><td><input type="text" value="${esc(c.name)}" data-adm="col:${c.id}:name"></td><td style="width:120px"><input type="color" value="${esc(c.hex)}" data-adm="col:${c.id}:hex"></td><td style="width:60px"><button class="iconb" style="color:var(--red)" data-act="adm" data-a="col-del" data-id="${c.id}">✕</button></td></tr>`).join("")}</tbody></table>
    <button class="btn small" data-act="adm" data-a="col-add">+ Couleur</button>
    <div class="grid g3" style="margin-top:12px">${[["inter", "Intercalaires"], ["publi", "Publireportages"], ["pub", "Pages de pub"]].map(([k, l]) => `<label class="f"><span>Couleur · ${l}</span><select data-adm="ptc:${k}:">${colOpts(cfg.pageTypeColors?.[k])}</select></label>`).join("")}</div></div>
  <div class="panel adm-sec"><h3>Équipe et accès</h3><p class="muted small" style="margin-top:0">Renseigne l'adresse Google de chaque personne : elle sert à la connexion et au filtre « Mes tâches ». Les admins gèrent cette page ; tout le monde peut modifier les cards et attribuer les tâches.</p>
    <table class="t"><thead><tr><th>Nom</th><th>Adresse(s) Google (séparées par une virgule)</th><th>Admin</th><th>Photographe</th><th></th></tr></thead><tbody>${cfg.people.map((p) => `<tr><td><input type="text" value="${esc(p.name)}" data-adm="ppl:${p.id}:name"></td><td><input type="text" value="${esc((p.emails || []).join(", "))}" data-adm="ppl:${p.id}:emails" placeholder="prenom.nom@gmail.com"></td>
      <td><input type="checkbox" data-adm="ppl:${p.id}:admin" ${p.admin ? "checked" : ""}></td><td><input type="checkbox" data-adm="ppl:${p.id}:photographer" ${p.photographer ? "checked" : ""}></td><td><button class="iconb" style="color:var(--red)" data-act="adm" data-a="ppl-del" data-id="${p.id}">✕</button></td></tr>`).join("")}</tbody></table>
    <button class="btn small" data-act="adm" data-a="ppl-add">+ Personne</button>
    <div class="grid g4" style="margin-top:14px">${[["redacteur", "Rédacteur par défaut"], ["relecteur", "Relecteur par défaut"], ["graphiste", "Graphiste par défaut"], ["brief", "Briefs photo par défaut"]].map(([k, l]) => `<label class="f"><span>${l}</span><select data-adm="def:${k}:">${peopleOpts(cfg.defaults?.[k])}</select></label>`).join("")}</div></div>
  <div class="panel adm-sec"><h3>Réglages</h3><label class="f" style="max-width:280px"><span>Une échéance est « imminente » à moins de (jours)</span><input type="number" min="0" max="30" value="${imminentDays()}" data-adm="set:imminentDays:"></label></div>`;
}

async function admChange(el) {
  const [kind, id, field] = el.dataset.adm.split(":");
  const val = el.type === "checkbox" ? el.checked : el.value;
  if (kind === "iss") {
    const patch = { [field]: val }; return run(S.store.updateDoc(`magIssues/${id}`, patch));
  }
  const cfg = structuredClone(S.config);
  let access = false;
  if (kind === "chap") cfg.chapters.find((c) => c.id === id)[field] = val;
  else if (kind === "rub") cfg.rubriques.find((r) => r.id === id)[field] = val;
  else if (kind === "col") cfg.colors.find((c) => c.id === id)[field] = val;
  else if (kind === "ptc") cfg.pageTypeColors = { ...cfg.pageTypeColors, [id]: val };
  else if (kind === "def") cfg.defaults = { ...cfg.defaults, [id]: val };
  else if (kind === "set") cfg.settings = { ...cfg.settings, [id]: Math.max(0, +val || 0) };
  else if (kind === "ppl") {
    const p = cfg.people.find((x) => x.id === id);
    if (field === "emails") {
      const list = val.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
      const bad = list.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad) { toast(`Adresse invalide : ${bad}`); return render(); }
      p.emails = list;
    } else p[field] = val;
    access = true;
  }
  await run(saveConfig(cfg, { access }));
}
async function admAction(a, id) {
  const cfg = structuredClone(S.config);
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (a === "chap-add") cfg.chapters.push({ id: "ch-" + L.uid(), name: "Nouveau chapitre" });
  else if (a === "chap-up" || a === "chap-down") move(cfg.chapters, cfg.chapters.findIndex((c) => c.id === id), a === "chap-up" ? -1 : 1);
  else if (a === "chap-del") {
    if (cfg.rubriques.some((r) => r.chapterId === id)) return toast("Ce chapitre contient encore des rubriques : déplace-les ou supprime-les d'abord.");
    cfg.chapters = cfg.chapters.filter((c) => c.id !== id);
  } else if (a === "rub-add") cfg.rubriques.push({ id: "r-" + L.uid(), name: "Nouvelle rubrique", chapterId: id, color: cfg.colors[0]?.id || "" });
  else if (a === "rub-up" || a === "rub-down") {
    const i = cfg.rubriques.findIndex((r) => r.id === id), ch = cfg.rubriques[i].chapterId, d = a === "rub-up" ? -1 : 1;
    let j = i + d; while (j >= 0 && j < cfg.rubriques.length && cfg.rubriques[j].chapterId !== ch) j += d;
    if (j >= 0 && j < cfg.rubriques.length) [cfg.rubriques[i], cfg.rubriques[j]] = [cfg.rubriques[j], cfg.rubriques[i]];
  } else if (a === "rub-del") {
    const n = usage("rub", id); if (n) return toast(`Rubrique utilisée (${n} page(s)/card(s)) : impossible de la supprimer.`);
    cfg.rubriques = cfg.rubriques.filter((r) => r.id !== id);
  } else if (a === "col-add") cfg.colors.push({ id: "c-" + L.uid(), name: "Nouvelle couleur", hex: "#888888" });
  else if (a === "col-del") {
    if (cfg.rubriques.some((r) => r.color === id) || Object.values(cfg.pageTypeColors || {}).includes(id)) return toast("Cette couleur est encore utilisée.");
    cfg.colors = cfg.colors.filter((c) => c.id !== id);
  } else if (a === "ppl-add") cfg.people.push({ id: "p-" + L.uid(), name: "Nouvelle personne", emails: [], admin: false, photographer: false });
  else if (a === "ppl-del") {
    const n = usage("person", id);
    if (!confirm(n ? `Cette personne est attribuée à ${n} tâche(s). Supprimer quand même ?` : "Supprimer cette personne ?")) return;
    cfg.people = cfg.people.filter((p) => p.id !== id);
    for (const k of Object.keys(cfg.defaults || {})) if (cfg.defaults[k] === id) cfg.defaults[k] = "";
    return run(saveConfig(cfg, { access: true }));
  }
  await run(saveConfig(cfg));
}

/* ---------- Actions ---------- */
const openCardEditor = (id, extra = {}) => {
  const c = id ? S.cards[id] : L.emptyCard({ defaults: S.config.defaults, ...extra });
  openModal({ kind: "card", id: id || "", draft: structuredClone(c), linkSlot: extra.linkSlot || null, linkIssue: extra.issueId || "" });
};
async function unlinkCard(cardId, exceptIssueId) {
  for (const i of issueList()) {
    if (i.id === exceptIssueId) continue;
    const patch = {}; for (const [sid, p] of Object.entries(i.pages || {})) if (p.cardId === cardId) patch[`pages.${sid}.cardId`] = "";
    if (Object.keys(patch).length) await S.store.updateDoc(`magIssues/${i.id}`, patch);
  }
}
async function saveCard() {
  const m = S.modal, d = structuredClone(m.draft);
  if (!d.title.trim()) return toast("Donne un titre à l'angle éditorial.");
  if (!d.rubId) return toast("Choisis une rubrique.");
  delete d.id; d.title = d.title.trim(); d.updatedAt = Date.now();
  try {
    let id = m.id;
    if (id) await S.store.setDoc("magCards/" + id, d);
    else { d.createdAt = Date.now(); id = await S.store.addDoc("magCards", d); }
    await unlinkCard(id, d.issueId);
    if (m.linkSlot && d.issueId === m.linkSlot.issueId) await S.store.updateDoc(`magIssues/${m.linkSlot.issueId}`, { [`pages.${m.linkSlot.slotId}.cardId`]: id });
    closeModal(); toast("Card enregistrée");
  } catch (e) { fail(e); }
}
async function deleteCard() {
  const id = S.modal.id;
  if (!confirm("Supprimer définitivement cette card ?")) return;
  try { await unlinkCard(id, null); await S.store.delDoc("magCards/" + id); closeModal(); toast("Card supprimée"); } catch (e) { fail(e); }
}
const findTask = (card, ds) => L.cardTasks(card).find((t) => t.phase === ds.phase && t.key === ds.key && (t.sub || "") === (ds.sub || ""));
const pagePatch = (issue, slotId, over) => {
  const { pos, type, rubId, cardId, label, celebrated } = { ...issue.pages[slotId], ...over };
  const keep = !("type" in over || "rubId" in over || "cardId" in over); // changer de rubrique/card annule la validation
  return { [`pages.${slotId}`]: { pos, type, rubId: rubId || "", cardId: cardId || "", label: label || "", celebrated: keep && !!celebrated } };
};

async function onChange(e) {
  const t = e.target;
  if (t.dataset.adm) return admChange(t);
  if (S.modal?.draft && t.dataset.p !== undefined) return onDraftInput(e);
  const k = t.dataset.chg; if (!k) return;
  const v = t.type === "checkbox" ? t.checked : t.value;
  if (k === "f-chapter") { S.f.chapter = v; return render(); }
  if (k === "f-late") { S.f.lateOnly = v; return render(); }
  if (k.startsWith("desk-")) { S.f.desk[k.slice(5)] = v; return render(); }
  if (k.startsWith("plan-")) { S.f.plan[k.slice(5)] = v; return render(); }
  if (S.modal?.kind === "page") {
    const issue = S.issues[S.modal.issueId], sid = S.modal.slotId, p = issue.pages[sid];
    if (k === "pg-type") return run(S.store.updateDoc(`magIssues/${issue.id}`, pagePatch(issue, sid, { type: v, cardId: v === "rub" ? p.cardId : "", rubId: v === "rub" ? p.rubId : "", label: v === "rub" ? "" : p.label })));
    if (k === "pg-rub") return run(S.store.updateDoc(`magIssues/${issue.id}`, pagePatch(issue, sid, { rubId: v })));
    if (k === "pg-label") return run(S.store.updateDoc(`magIssues/${issue.id}`, pagePatch(issue, sid, { label: v })));
    if (k === "pg-card") {
      if (v === "__new") { const rubId = p.rubId; closeModal(); return openCardEditor("", { rubId, issueId: issue.id, linkSlot: { issueId: issue.id, slotId: sid } }); }
      if (v) { const c = S.cards[v]; if (c && c.issueId !== issue.id) await run(S.store.updateDoc(`magCards/${v}`, { issueId: issue.id })); }
      return run(S.store.updateDoc(`magIssues/${issue.id}`, pagePatch(issue, sid, { cardId: v })));
    }
  }
}
function onDraftInput(e) {
  const t = e.target, d = S.modal.draft;
  setPath(d, t.dataset.p, t.type === "checkbox" ? t.checked : t.value);
  if (t.dataset.rr !== undefined) return renderModal(true);
  const box = $("#card-alerts"); if (box) box.innerHTML = draftAlerts();
  if (t.dataset.p === "a.v1.url") renderModal(true);
}

const ACT = {
  signin: () => S.store.signIn().catch(fail),
  signout: () => S.store.signOut(),
  tab: (el) => { S.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  close: () => closeModal(),
  "close-card": () => { if (confirm("Fermer sans enregistrer ?")) closeModal(); },
  "edit-issue": (el) => openModal({ kind: "issue", id: el.dataset.id }),
  "issue-save": () => {
    const id = S.modal.id;
    const patch = { title: $("#iss-title").value.trim(), releaseDate: $("#iss-date").value, releaseFinal: $("#iss-final").checked };
    run(S.store.updateDoc(`magIssues/${id}`, patch)).then(() => { closeModal(); toast("Date de sortie enregistrée"); });
  },
  page: (el) => openModal({ kind: "page", issueId: S.tab.slice(2), slotId: el.dataset.id, live: true }),
  celebrate: () => { const i = S.issues[S.modal.issueId]; playCelebration(); run(S.store.updateDoc(`magIssues/${i.id}`, { [`pages.${S.modal.slotId}.celebrated`]: true })); },
  "celebrate-play": () => playCelebration(),
  "celebrate-undo": () => { const i = S.issues[S.modal.issueId]; run(S.store.updateDoc(`magIssues/${i.id}`, { [`pages.${S.modal.slotId}.celebrated`]: false })); },
  "pg-apply": async () => {
    const issue = S.issues[S.modal.issueId], id = S.modal.slotId;
    const n = Math.floor(+$("#pg-count").value);
    if (!(n >= 1)) return toast("Indique un nombre de pages (1 ou plus).");
    const { patch, targets } = L.applyNextPatch(issue, id, n, { withCard: !!$("#pg-count-card")?.checked });
    if (!targets.length) return toast("Il n'y a plus de page après celle-ci.");
    const src = issue.pages[id];
    const busy = targets.filter((t) => t.type !== "empty" && (t.type !== src.type || t.rubId !== src.rubId));
    if (busy.length && !confirm(`${busy.length} page(s) déjà attribuée(s) parmi les ${targets.length} suivantes seront remplacées (p. ${busy.map((t) => t.pos).join(", ")}). Continuer ?`)) return;
    await run(S.store.updateDoc(`magIssues/${issue.id}`, patch));
    toast(`Appliqué aux pages ${targets[0].pos} à ${targets.at(-1).pos}`);
  },
  "pg-insert": () => { const issue = S.issues[S.modal.issueId], patch = L.insertPatch(issue, issue.pages[S.modal.slotId].pos); if (!patch) return toast(`Impossible : la dernière page (${issue.pages ? Object.keys(issue.pages).length : L.PAGES_TOTAL}) est occupée. Libère-la d'abord.`); run(S.store.updateDoc(`magIssues/${issue.id}`, patch)).then(() => { toast("Page insérée — les suivantes ont été décalées"); closeModal(); }); },
  "pg-remove": () => { const issue = S.issues[S.modal.issueId]; if (!confirm("Retirer cette page ? Les suivantes remontent d'un cran et une page vierge est ajoutée à la fin.")) return; run(S.store.updateDoc(`magIssues/${issue.id}`, L.removePatch(issue, S.modal.slotId))).then(closeModal); },
  "open-card": (el) => { if (S.modal?.kind === "page") closeModal(); openCardEditor(el.dataset.id); },
  "new-card": () => openCardEditor("", { issueId: S.f.desk.issue && S.f.desk.issue !== "none" ? S.f.desk.issue : "", rubId: S.f.desk.rub }),
  "card-save": saveCard, "card-del": deleteCard,
  "iv-add": () => { S.modal.draft.a.recolte.interviews.push(L.newInterview(S.config.defaults)); renderModal(true); },
  "iv-del": (el) => { S.modal.draft.a.recolte.interviews.splice(+el.dataset.i, 1); renderModal(true); },
  tick: (el) => { const c = S.cards[el.dataset.card], t = c && findTask(c, el.dataset); if (t) run(S.store.updateDoc(`magCards/${c.id}`, L.taskDonePatch(c, t, !t.done))); },
  "close-phase": (el) => { const c = S.cards[el.dataset.card], ph = el.dataset.phase; run(S.store.updateDoc(`magCards/${c.id}`, L.closePhasePatch(c, ph, !L.phaseProgress(c, ph).closed))); },
  "plan-view": (el) => { S.f.plan.view = el.dataset.v; render(); },
  "plan-me": () => { S.f.plan.person = me()?.id || ""; render(); },
  month: (el) => { const d = +el.dataset.d, cur = S.f.plan.month || S.d.today.slice(0, 8) + "01"; S.f.plan.month = d === 0 ? "" : L.iso(new Date(L.parse(cur).getFullYear(), L.parse(cur).getMonth() + d, 1, 12)); render(); },
  adm: (el) => admAction(el.dataset.a, el.dataset.id),
  "new-issue": (el) => openModal({ kind: "newissue", src: el.dataset.src || "" }),
  "issue-create": async () => {
    const num = +$("#ni-num").value, src = $("#ni-src").value;
    if (!num || issueList().some((i) => i.number === num)) return toast("Ce numéro existe déjà ou est invalide.");
    const doc = newIssueDoc({ number: num, title: $("#ni-title").value.trim(), releaseDate: $("#ni-date").value, releaseFinal: false }, src ? L.cloneStructure(S.issues[src]) : L.initialPages());
    await run(S.store.setDoc(`magIssues/n${num}`, doc)); closeModal(); S.tab = `i:n${num}`; toast(`N°${num} créé`); render();
  },
  "del-issue": async (el) => {
    const i = S.issues[el.dataset.id], n = cardsArr().filter((c) => c.issueId === i.id).length;
    if (!confirm(`Supprimer le N°${i.number} et son chemin de fer ?${n ? ` ${n} card(s) du desk resteront, sans numéro.` : ""}`)) return;
    for (const c of cardsArr().filter((c) => c.issueId === i.id)) await run(S.store.updateDoc(`magCards/${c.id}`, { issueId: "" }));
    await run(S.store.delDoc(`magIssues/${i.id}`)); S.tab = ""; render();
  },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.matches("button, a") || el.dataset.act) { if (el.tagName === "A") e.preventDefault(); }
  const fn = ACT[el.dataset.act]; if (fn) fn(el);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.modal && S.modal.kind !== "card") closeModal();
  if (e.key === "Enter" && e.target.matches?.("[role=button][data-act]")) e.target.click();
});
document.addEventListener("change", onChange);
document.addEventListener("input", (e) => {
  const t = e.target;
  if (S.modal?.draft && t.dataset.p !== undefined && t.type !== "checkbox" && t.tagName !== "SELECT") return onDraftInput(e);
  if (t.dataset.inp === "desk-q") { S.f.desk.q = t.value; const l = $("#desk-list"); if (l) l.innerHTML = deskCards(); }
});

/* Glisser-déposer : échanger deux pages du chemin de fer */
document.addEventListener("dragstart", (e) => { const el = e.target.closest?.("[data-drop]"); if (el) { S.drag = el.dataset.drop; e.dataTransfer.setData("text/plain", S.drag); e.dataTransfer.effectAllowed = "move"; } });
document.addEventListener("dragover", (e) => { const el = e.target.closest?.("[data-drop]"); if (el && S.drag) { e.preventDefault(); $$(".pg.over").forEach((x) => x.classList.remove("over")); el.classList.add("over"); } });
document.addEventListener("dragend", () => { S.drag = null; $$(".pg.over").forEach((x) => x.classList.remove("over")); });
document.addEventListener("drop", (e) => {
  const el = e.target.closest?.("[data-drop]"); if (!el || !S.drag) return;
  e.preventDefault();
  const a = S.drag, b = el.dataset.drop; S.drag = null;
  const issue = S.issues[S.tab.slice(2)];
  if (a !== b && issue?.pages[a] && issue.pages[b]) run(S.store.updateDoc(`magIssues/${issue.id}`, L.swapPatch(issue, a, b))).then(() => toast(`Pages ${issue.pages[a].pos} et ${issue.pages[b].pos} échangées`));
});
window.__S = S; // pour les tests
