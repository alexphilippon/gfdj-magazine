import { initialPages, slug } from "./logic.js?v=10";

/* Couleurs de rubriques. Les codes viennent de la palette du template « Équipe 2027 » :
   rouge #E10819 et bleu #006AB1 sont dans la charte ; le bleu clair et le gris clair en sont des teintes claires.
   Tout est modifiable dans Admin → Couleurs. */
export const SEED_COLORS = [
  { id: "red", name: "Espace commercial", hex: "#E10819" },
  { id: "hot", name: "Contenu chaud", hex: "#006AB1" },
  { id: "cold", name: "Contenu froid", hex: "#8EC5E8" },
  { id: "grey", name: "Photo uniquement", hex: "#DCE1E9" },
];

const CHAPTERS = [
  ["L'échauffement", ["Le bon de sortie", "Le programme", "La musette", "Le musée", "Le tableau noir", "Le zinzin en chef"]],
  ["La meute", ["L'enquête", "L'invisible visible", "La part de rêve"]],
  ["La machine", ["La vitrine", "L'atelier méca", "La data room"]],
  ["Le corps", ["Le lexique de l'expert", "Le plaisir coupable", "Le cabinet du doc"]],
  ["La route", ["La séance vidéo", "La micro-aventure de..."]],
  ["Le service course", ["La grille", "Les bons plans", "Le calendrier", "4e de couverture"]],
];

export function seedStructure() {
  const chapters = [], rubriques = [];
  for (const [cn, rubs] of CHAPTERS) {
    const chapterId = "ch-" + slug(cn);
    chapters.push({ id: chapterId, name: cn });
    for (const rn of rubs) rubriques.push({ id: "r-" + slug(rn), name: rn, chapterId, color: rn === "4e de couverture" ? "red" : "hot" });
  }
  return { chapters, rubriques };
}

const PEOPLE = [
  ["mignot", "Alexandre Mignot", { admin: true }],
  ["porcheron", "Alexandre Porcheron", {}],
  ["dujardin", "Loïc Dujardin", { admin: true }],
  ["maheux", "Thomas Maheux", { photographer: true }],
  ["morreel", "Valentin Morreel", { photographer: true }],
  ["morel", "Christophe Morel", { admin: true }],
  ["jullien", "Philippe Jullien", { admin: true }],
  ["philippon", "Alexandre Philippon", { admin: true }],
  ["louvet", "Louis Louvet", {}],
];

/** `adminEmail` : le compte qui initialise l'outil (relié à Alexandre Philippon). */
export function seedConfig(adminEmail = "") {
  return {
    ...seedStructure(),
    colors: SEED_COLORS,
    people: PEOPLE.map(([id, name, f]) => ({ id, name, emails: id === "philippon" && adminEmail ? [adminEmail] : [], admin: !!f.admin, photographer: !!f.photographer })),
    defaults: { redacteur: "mignot", relecteur: "morel", graphiste: "porcheron", brief: "dujardin" },
    pageTypeColors: { inter: "grey", publi: "red", pub: "red" },
    settings: { imminentDays: 3 },
  };
}

export const seedAccess = (config, extraAdmin = "") => syncAccess(config, extraAdmin);
/** Listes d'adresses lues par les règles de sécurité Firestore (déduites des personnes). */
export function syncAccess(config, extraAdmin = "") {
  const all = new Set(), admins = new Set();
  for (const p of config.people) for (const e of p.emails || []) { const m = e.trim().toLowerCase(); if (!m) continue; all.add(m); if (p.admin) admins.add(m); }
  if (extraAdmin) { all.add(extraAdmin); admins.add(extraAdmin); }
  return { allowedEmails: [...all], adminEmails: [...admins] };
}

/** Dates de sortie provisoires : fin janvier, fin avril, fin juin, début novembre 2027. */
export const SEED_ISSUES = [
  { id: "n1", number: 1, title: "", releaseDate: "2027-01-29", releaseFinal: false },
  { id: "n2", number: 2, title: "", releaseDate: "2027-04-30", releaseFinal: false },
  { id: "n3", number: 3, title: "", releaseDate: "2027-06-30", releaseFinal: false },
  { id: "n4", number: 4, title: "", releaseDate: "2027-11-05", releaseFinal: false },
];
export const newIssueDoc = (i, pages = initialPages()) => ({ number: i.number, title: i.title || "", releaseDate: i.releaseDate || "", releaseFinal: !!i.releaseFinal, pages, createdAt: Date.now() });
