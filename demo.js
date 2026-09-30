/* Données fictives du mode démo (?demo) : rien n'est écrit en base, tout reste en mémoire. */
import { emptyCard, newInterview, addDays, todayIso, initialPages } from "./logic.js?v=5";
import { seedConfig, seedAccess, SEED_ISSUES, newIssueDoc } from "./seed.js?v=5";

export function demoData() {
  const cfg = seedConfig("demo@example.org");
  const t = todayIso();
  const d = (n) => addDays(t, n);
  const rub = (name) => cfg.rubriques.find((r) => r.name === name).id;
  const data = { "magConfig/main": cfg, "magConfig/access": seedAccess(cfg) };
  const D = cfg.defaults;

  const cards = {};
  const mk = (id, title, rubName, over = {}) => {
    const c = emptyCard({ defaults: D, rubId: rub(rubName), issueId: "n1", title });
    cards[id] = { ...c, ...over };
    return cards[id];
  };
  // Terminée
  const c1 = mk("c1", "Le tableau de bord du directeur sportif", "Le bon de sortie");
  c1.a.recolte.interviews = [{ ...newInterview(D), date: d(-40), time: "10:00", who: "Le DS", phone: "06 00 00 00 01", field: true, done: true }];
  Object.assign(c1.a.v1, { date: d(-30), done: true, url: "https://drive.google.com/…" }); Object.assign(c1.a.vdef, { date: d(-25), done: true });
  Object.assign(c1.b.brief, { date: d(-45), done: true }); Object.assign(c1.b.shoot, { date: d(-38), photographer: "maheux", place: "Service course, Cesson", done: true }); Object.assign(c1.b.delivery, { date: d(-33), done: true });
  c1.c.start.date = d(-24); Object.assign(c1.c.v1, { date: d(-15), done: true }); Object.assign(c1.c.vdef, { date: d(-8), done: true });
  // En retard (Mignot pour la V1, photographe pour la livraison)
  const c2 = mk("c2", "Dans la tête d'un poisson-pilote", "L'enquête");
  c2.a.recolte.interviews = [
    { ...newInterview(D), date: d(-20), time: "14:30", who: "Poisson-pilote", phone: "06 00 00 00 02", visio: "https://meet.google.com/abc", done: true },
    { ...newInterview(D), date: d(-9), time: "09:00", who: "Ancien coéquipier", phone: "06 00 00 00 03", field: true, done: true },
  ];
  Object.assign(c2.a.v1, { date: d(-4) }); Object.assign(c2.a.vdef, { date: d(4) });
  Object.assign(c2.b.brief, { date: d(-22), done: true }); Object.assign(c2.b.shoot, { date: d(-6), photographer: "morreel", place: "Gare d'Amiens", contact: "M. Dupont", done: true }); Object.assign(c2.b.delivery, { date: d(-2) });
  c2.c.start.date = d(6); Object.assign(c2.c.v1, { date: d(14) }); Object.assign(c2.c.vdef, { date: d(22) });
  // Conflit de dates (relecture après le début de conception)
  const c3 = mk("c3", "La saison des coureurs invisibles", "L'invisible visible");
  Object.assign(c3.a.v1, { date: d(3) }); Object.assign(c3.a.vdef, { date: d(12) });
  Object.assign(c3.b.brief, { date: d(1) }); Object.assign(c3.b.shoot, { date: d(8), photographer: "maheux", place: "Vosges" }); Object.assign(c3.b.delivery, { date: d(10) });
  c3.c.start.date = d(9); Object.assign(c3.c.v1, { date: d(20) }); Object.assign(c3.c.vdef, { date: d(28) });
  // Imminent, sans phase 1B (illustrations)
  const c4 = mk("c4", "Pourquoi les pignons lâchent", "L'atelier méca", { phases: { a: true, b: false, c: true } });
  Object.assign(c4.a.v1, { date: d(2) }); Object.assign(c4.a.vdef, { date: d(7) }); c4.a.recolte.skip = true;
  c4.c.start.date = d(8); Object.assign(c4.c.v1, { date: d(16) }); Object.assign(c4.c.vdef, { date: d(24), validator: "jullien" });
  // Non planifiée (idée)
  mk("c5", "Le watt et le ventre : l'expert nutrition", "Le lexique de l'expert");
  mk("c6", "Le calendrier des courses de la saison", "Le calendrier");
  // Publiée dans un autre numéro
  const c7 = mk("c7", "Interview de rentrée au camp d'entraînement", "La séance vidéo"); c7.issueId = "n2";
  Object.assign(c7.a.v1, { date: d(40) }); c7.a.recolte.interviews = [{ ...newInterview(D), date: d(35), who: "Le manager", field: true }];

  // Chemin de fer du N°1 (structure de démonstration)
  const issue = newIssueDoc(SEED_ISSUES[0]);
  const P = issue.pages;
  const set = (pos, type, rubName, cardId) => { P["s" + String(pos).padStart(2, "0")] = { pos, type, rubId: rubName ? rub(rubName) : "", cardId: cardId || "", label: type === "inter" ? "Respiration" : type === "publi" ? "Publireportage" : type === "pub" ? "Annonceur à confirmer" : "" }; };
  set(2, "rub", "Le bon de sortie", "c1"); set(3, "rub", "Le programme"); set(4, "publi"); set(5, "rub", "La musette"); set(6, "rub", "Le musée");
  set(7, "rub", "Le tableau noir"); set(8, "inter"); set(9, "rub", "Le zinzin en chef");
  set(10, "rub", "L'enquête", "c2"); set(11, "rub", "L'enquête", "c2"); set(12, "rub", "L'enquête", "c2"); set(13, "rub", "L'enquête", "c2");
  set(14, "rub", "L'invisible visible", "c3"); set(15, "rub", "L'invisible visible", "c3"); set(16, "pub");
  set(17, "rub", "La part de rêve"); set(18, "rub", "La part de rêve"); set(19, "inter");
  set(20, "rub", "La vitrine"); set(21, "rub", "L'atelier méca", "c4"); set(22, "rub", "L'atelier méca", "c4"); set(23, "rub", "La data room");
  set(24, "rub", "Le lexique de l'expert", "c5"); set(25, "rub", "Le plaisir coupable"); set(26, "rub", "Le cabinet du doc");
  set(27, "rub", "La séance vidéo"); set(28, "rub", "La micro-aventure de...");
  set(29, "rub", "La grille"); set(30, "rub", "Les bons plans"); set(31, "rub", "Le calendrier", "c6"); set(32, "pub");
  set(72, "rub", "4e de couverture");
  data["magIssues/n1"] = issue;
  for (const i of SEED_ISSUES.slice(1)) data[`magIssues/${i.id}`] = newIssueDoc(i);
  for (const [id, c] of Object.entries(cards)) data[`magCards/${id}`] = c;
  return data;
}
