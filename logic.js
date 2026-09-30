/* Logique pure du suivi de prod (aucun accès DOM ni Firebase) — testée dans tests/logic.test.mjs */

export const PAGES_TOTAL = 72;
export const IMMINENT_DEFAULT = 3; // jours
// « les deadlines de 1A et 1B doivent se finir avant la date de début de conception » :
// lecture littérale → une échéance le jour même du début de conception est un conflit.
export const CONFLICT_ON_SAME_DAY = true;

export const PHASE_KEYS = ["a", "b", "c"];
export const PHASE_NAMES = { a: "1A", b: "1B", c: "2" };
export const PHASE_TITLES = { a: "Contenu rédactionnel", b: "Contenu iconographique", c: "Conception graphique" };
export const PAGE_TYPES = { empty: "À attribuer", rub: "Rubrique", inter: "Intercalaire", publi: "Publireportage", pub: "Publicité" };

/* ---------- Dates (chaînes ISO AAAA-MM-JJ, calcul à midi local : pas de piège d'heure d'été) ---------- */
const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const todayIso = () => iso(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5); // b - a
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
export const fmtShort = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
export const fmtDay = (s) => parse(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

/* ---------- Card ---------- */
export function newInterview(defaults = {}) {
  return { id: uid(), date: "", time: "", who: "", phone: "", visio: "", field: false, collector: defaults.redacteur || "", done: false };
}

export function emptyCard({ defaults = {}, rubId = "", issueId = "", title = "" } = {}) {
  return {
    title, rubId, issueId, notes: "",
    phases: { a: true, b: true, c: true },
    a: {
      recolte: { skip: false, interviews: [] },
      v1: { date: "", writer: defaults.redacteur || "", url: "", done: false },
      vdef: { date: "", reviewer: defaults.relecteur || "", done: false },
    },
    b: {
      brief: { date: "", author: defaults.brief || "", text: "", done: false },
      shoot: { date: "", time: "", photographer: "", place: "", contact: "", done: false },
      delivery: { date: "", url: "", done: false },
    },
    c: {
      designer: defaults.graphiste || "",
      start: { date: "" },
      v1: { date: "", url: "", done: false },
      vdef: { date: "", url: "", validator: "", done: false },
    },
  };
}

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
function withDefaults(target, def) {
  const out = { ...target };
  for (const k of Object.keys(def)) {
    if (isObj(def[k])) out[k] = withDefaults(isObj(target?.[k]) ? target[k] : {}, def[k]);
    else if (out[k] === undefined || out[k] === null) out[k] = def[k];
  }
  return out;
}
/** Complète une card lue en base avec les champs manquants (évolutions du modèle). */
export const normCard = (c) => withDefaults(c || {}, emptyCard());

/* ---------- Tâches d'une card ---------- */
export function recolteDone(card) {
  const r = card.a.recolte;
  return !!r.skip || (r.interviews.length > 0 && r.interviews.every((i) => i.done));
}

/** Toutes les échéances de la card (y compris le jalon « début de conception », non clôturable). */
export function cardTasks(card) {
  const t = [];
  const ph = card.phases || {};
  const base = { cardId: card.id, cardTitle: card.title, issueId: card.issueId, rubId: card.rubId };
  const push = (o) => t.push({ ...base, closable: true, done: false, date: "", time: "", assignee: "", ...o });
  if (ph.a !== false) {
    const a = card.a;
    if (!a.recolte.skip) {
      for (const iv of a.recolte.interviews) {
        push({ phase: "a", key: "recolte", sub: iv.id, label: "Récolte" + (iv.who ? ` · ${iv.who}` : ""), date: iv.date, time: iv.time, assignee: iv.collector, done: !!iv.done, detail: iv });
      }
    }
    push({ phase: "a", key: "v1", label: "Rédaction V1", date: a.v1.date, assignee: a.v1.writer, done: !!a.v1.done });
    push({ phase: "a", key: "vdef", label: "Relecture · vdef", date: a.vdef.date, assignee: a.vdef.reviewer, done: !!a.vdef.done });
  }
  if (ph.b !== false) {
    const b = card.b;
    push({ phase: "b", key: "brief", label: "Brief photographe", date: b.brief.date, assignee: b.brief.author, done: !!b.brief.done });
    push({ phase: "b", key: "shoot", label: "Reportage photo", date: b.shoot.date, time: b.shoot.time, assignee: b.shoot.photographer, done: !!b.shoot.done });
    push({ phase: "b", key: "delivery", label: "Livraison des photos", date: b.delivery.date, assignee: b.shoot.photographer, done: !!b.delivery.done });
  }
  if (ph.c !== false) {
    const c = card.c;
    push({ phase: "c", key: "start", label: "Début de conception", date: c.start.date, assignee: c.designer, closable: false, milestone: true });
    push({ phase: "c", key: "v1", label: "Livraison V1", date: c.v1.date, assignee: c.designer, done: !!c.v1.done });
    push({ phase: "c", key: "vdef", label: "Livraison vdef", date: c.vdef.date, assignee: c.designer, done: !!c.vdef.done });
  }
  return t;
}

/** Étapes comptées dans l'avancement : la récolte compte pour une seule étape (toutes les interviews). */
export function phaseSteps(card, ph) {
  if (card.phases?.[ph] === false) return [];
  if (ph === "a") return [{ key: "recolte", done: recolteDone(card) }, { key: "v1", done: !!card.a.v1.done }, { key: "vdef", done: !!card.a.vdef.done }];
  if (ph === "b") return [{ key: "brief", done: !!card.b.brief.done }, { key: "shoot", done: !!card.b.shoot.done }, { key: "delivery", done: !!card.b.delivery.done }];
  return [{ key: "v1", done: !!card.c.v1.done }, { key: "vdef", done: !!card.c.vdef.done }];
}

export function phaseProgress(card, ph) {
  const steps = phaseSteps(card, ph);
  const enabled = card.phases?.[ph] !== false;
  const done = steps.filter((s) => s.done).length;
  return { enabled, done, total: steps.length, closed: enabled && steps.length > 0 && done === steps.length, fraction: steps.length ? done / steps.length : 0 };
}

/** Avancement d'une card : chaque phase active pèse autant (1/3, ou 1/2 si une phase est désactivée). */
export function cardProgress(card) {
  const on = PHASE_KEYS.filter((p) => card.phases?.[p] !== false);
  if (!on.length) return 1;
  return on.reduce((s, p) => s + phaseProgress(card, p).fraction, 0) / on.length;
}

/* ---------- Retards, imminence, conflits ---------- */
const openTasks = (card) => cardTasks(card).filter((t) => t.closable && !t.done);

export function phaseStatus(card, ph, today, imminent = IMMINENT_DEFAULT) {
  if (card.phases?.[ph] === false) return "off";
  if (phaseProgress(card, ph).closed) return "done";
  const open = openTasks(card).filter((t) => t.phase === ph);
  const dated = open.filter((t) => t.date);
  if (dated.some((t) => t.date < today)) return "late";
  if (dated.some((t) => diffDays(today, t.date) <= imminent)) return "imminent";
  return dated.length ? "todo" : "unplanned";
}

export function cardAlerts(card, issue, today, imminent = IMMINENT_DEFAULT) {
  const tasks = cardTasks(card);
  const open = tasks.filter((t) => t.closable && !t.done && t.date);
  const late = open.filter((t) => t.date < today).map((t) => ({ ...t, daysLate: diffDays(t.date, today) }));
  const soon = open.filter((t) => t.date >= today && diffDays(today, t.date) <= imminent).map((t) => ({ ...t, inDays: diffDays(today, t.date) }));
  const conflicts = [];

  // 1A/1B doivent se terminer avant le début de la conception graphique
  const start = card.phases?.c !== false ? card.c.start.date : "";
  if (start) {
    const upstream = tasks.filter((t) => (t.phase === "a" || t.phase === "b") && t.closable && t.date);
    const bad = upstream.filter((t) => (CONFLICT_ON_SAME_DAY ? t.date >= start : t.date > start));
    for (const t of bad) {
      conflicts.push({ kind: "design", assignee: t.assignee, msg: `« ${t.label} » (${fmtDate(t.date)}) ne se termine pas avant le début de conception (${fmtDate(start)})` });
    }
  }
  // Aucune échéance après la sortie : c'est une erreur de saisie
  if (issue?.releaseDate) {
    for (const t of tasks.filter((x) => x.date && x.date > issue.releaseDate)) {
      conflicts.push({ kind: "release", assignee: t.assignee, msg: `« ${t.label} » (${fmtDate(t.date)}) tombe après la sortie du N°${issue.number} (${fmtDate(issue.releaseDate)})` });
    }
  }
  return { late, soon, conflicts };
}

/* ---------- Actions de clôture (patchs Firestore en chemins pointés ; les tableaux se réécrivent entiers) ---------- */
export function taskDonePatch(card, task, value) {
  if (task.key === "recolte") {
    return { "a.recolte.interviews": card.a.recolte.interviews.map((i) => (i.id === task.sub ? { ...i, done: value } : i)) };
  }
  return { [`${task.phase}.${task.key}.done`]: value };
}

export function closePhasePatch(card, ph, value = true) {
  const p = {};
  if (ph === "a") {
    p["a.v1.done"] = value; p["a.vdef.done"] = value;
    if (!card.a.recolte.skip) p["a.recolte.interviews"] = card.a.recolte.interviews.map((i) => ({ ...i, done: value }));
    if (value && !card.a.recolte.skip && card.a.recolte.interviews.length === 0) p["a.recolte.skip"] = true; // rien à récolter : la récolte est réputée faite
  } else if (ph === "b") {
    p["b.brief.done"] = value; p["b.shoot.done"] = value; p["b.delivery.done"] = value;
  } else {
    p["c.v1.done"] = value; p["c.vdef.done"] = value;
  }
  return p;
}

/* ---------- Chemin de fer ---------- */
export function initialPages(n = PAGES_TOTAL) {
  const o = {};
  for (let k = 1; k <= n; k++) o["s" + pad(k)] = { pos: k, type: "empty", rubId: "", cardId: "", label: "" };
  return o;
}
export const pagesSorted = (issue) => Object.entries(issue?.pages || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.pos - b.pos);

/** Doubles pages : la 1re et la dernière (couvertures) seules, le reste par paires. */
export function spreads(pages) {
  if (!pages.length) return [];
  const out = [[pages[0]]];
  let i = 1;
  while (i < pages.length - 1) { out.push(pages.slice(i, i + 2)); i += 2; }
  if (i < pages.length) out.push([pages[i]]);
  return out;
}

const emptySlot = (pos) => ({ pos, type: "empty", rubId: "", cardId: "", label: "" });
export function swapPatch(issue, idA, idB) {
  const a = issue.pages[idA], b = issue.pages[idB];
  return { [`pages.${idA}.pos`]: b.pos, [`pages.${idB}.pos`]: a.pos };
}
/** Insère une page vierge à la position `pos` : possible seulement si la dernière page est libre (le total reste fixe). */
export function insertPatch(issue, pos) {
  const s = pagesSorted(issue);
  const last = s[s.length - 1];
  if (!last || last.type !== "empty") return null;
  const patch = {};
  for (const p of s) if (p.pos >= pos && p.id !== last.id) patch[`pages.${p.id}.pos`] = p.pos + 1;
  patch[`pages.${last.id}.pos`] = pos;
  return patch;
}
/** Retire la page (elle est vidée et rejoint la fin), les suivantes remontent d'un cran. */
export function removePatch(issue, id) {
  const s = pagesSorted(issue);
  const target = issue.pages[id];
  const patch = {};
  for (const p of s) if (p.pos > target.pos) patch[`pages.${p.id}.pos`] = p.pos - 1;
  patch[`pages.${id}`] = emptySlot(s.length);
  return patch;
}
/** Recopie le type / la rubrique / la mention de la page `id` sur les `count` pages suivantes (et la même card si demandé). */
export function applyNextPatch(issue, id, count, { withCard = false } = {}) {
  const s = pagesSorted(issue);
  const i = s.findIndex((p) => p.id === id);
  if (i < 0) return { patch: {}, targets: [] };
  const src = s[i];
  const targets = s.slice(i + 1, i + 1 + Math.max(0, Math.floor(count)));
  const patch = {};
  for (const t of targets) {
    patch[`pages.${t.id}`] = { pos: t.pos, type: src.type, rubId: src.rubId || "", cardId: withCard && src.type === "rub" ? src.cardId || "" : "", label: src.label || "" };
  }
  return { patch, targets };
}

/** « Partir du numéro X » : chapitres/rubriques et types de pages, sans les cards ni le contenu. */
export function cloneStructure(issue) {
  const o = {};
  for (const p of pagesSorted(issue)) o[p.id] = { pos: p.pos, type: p.type, rubId: p.rubId || "", cardId: "", label: p.label || "" };
  return o;
}

export function cardPagePositions(issue, cardId) {
  return pagesSorted(issue).filter((p) => p.cardId === cardId).map((p) => p.pos);
}
export function fmtPages(pos) {
  if (!pos.length) return "";
  const runs = []; let s = pos[0], e = pos[0];
  for (const n of pos.slice(1)) { if (n === e + 1) e = n; else { runs.push([s, e]); s = e = n; } }
  runs.push([s, e]);
  return "p. " + runs.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(", ");
}

/* ---------- Avancement d'un numéro ---------- */
export function issueStats(issue, cardsById) {
  const pages = pagesSorted(issue);
  const prod = pages.filter((p) => p.type === "rub");
  const fr = prod.map((p) => { const c = cardsById[p.cardId]; return c ? cardProgress(c) : 0; });
  const byPhase = {};
  for (const ph of PHASE_KEYS) {
    const on = prod.filter((p) => cardsById[p.cardId]?.phases?.[ph] !== false && cardsById[p.cardId]);
    byPhase[ph] = { closed: on.filter((p) => phaseProgress(cardsById[p.cardId], ph).closed).length, total: on.length };
  }
  return {
    pct: prod.length ? fr.reduce((a, b) => a + b, 0) / prod.length : 0,
    total: pages.length,
    empty: pages.filter((p) => p.type === "empty").length,
    prod: prod.length,
    noCard: prod.filter((p) => !cardsById[p.cardId]).length,
    adjust: { inter: pages.filter((p) => p.type === "inter").length, publi: pages.filter((p) => p.type === "publi").length, pub: pages.filter((p) => p.type === "pub").length },
    byPhase,
  };
}

/* ---------- Alertes globales / par personne ---------- */
export function collectAlerts(cards, issues, today, imminent = IMMINENT_DEFAULT) {
  const res = { late: [], soon: [], conflicts: [] };
  for (const c of cards) {
    if (!c.issueId || !issues[c.issueId]) { continue; }
    const a = cardAlerts(c, issues[c.issueId], today, imminent);
    res.late.push(...a.late); res.soon.push(...a.soon);
    res.conflicts.push(...a.conflicts.map((x) => ({ ...x, cardId: c.id, cardTitle: c.title, issueId: c.issueId })));
  }
  const cmp = (x, y) => (x.date || "").localeCompare(y.date || "");
  res.late.sort(cmp); res.soon.sort(cmp);
  return res;
}
export function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it) || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return m;
}

export function textOn(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1F294C" : "#FFFFFF";
}
export const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
