import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../logic.js";

const D = { redacteur: "mignot", relecteur: "morel", graphiste: "porcheron", brief: "dujardin" };
const mk = (over = {}) => ({ id: "c1", ...L.emptyCard({ defaults: D, rubId: "r1", issueId: "i1", title: "Test" }), ...over });

test("défauts d'attribution", () => {
  const c = mk();
  assert.equal(c.a.v1.writer, "mignot");
  assert.equal(c.a.vdef.reviewer, "morel");
  assert.equal(c.b.brief.author, "dujardin");
  assert.equal(c.c.designer, "porcheron");
});

test("avancement : un tiers par phase, 1/2 si une phase est désactivée", () => {
  const c = mk();
  assert.equal(L.cardProgress(c), 0);
  Object.assign(c.a.v1, { done: true }); Object.assign(c.a.vdef, { done: true }); c.a.recolte.skip = true;
  assert.ok(L.phaseProgress(c, "a").closed);
  assert.ok(Math.abs(L.cardProgress(c) - 1 / 3) < 1e-9);
  c.phases.b = false;
  assert.ok(Math.abs(L.cardProgress(c) - 1 / 2) < 1e-9);
  c.phases.c = false; // 1A seule, close
  assert.equal(L.cardProgress(c), 1);
});

test("récolte : plusieurs interviews, faite seulement quand toutes le sont", () => {
  const c = mk();
  c.a.recolte.interviews = [{ ...L.newInterview(D), id: "x", date: "2027-01-10", done: true }, { ...L.newInterview(D), id: "y", date: "2027-01-12", done: false }];
  assert.equal(L.recolteDone(c), false);
  const patch = L.taskDonePatch(c, { key: "recolte", sub: "y", phase: "a" }, true);
  c.a.recolte.interviews = patch["a.recolte.interviews"];
  assert.equal(L.recolteDone(c), true);
});

test("retard nominatif : échéance dépassée non clôturée → personne désignée", () => {
  const c = mk(); c.a.v1.date = "2027-01-05";
  const a = L.cardAlerts(c, { number: 1, releaseDate: "2027-01-29" }, "2027-01-08");
  assert.equal(a.late.length, 1);
  assert.equal(a.late[0].assignee, "mignot");
  assert.equal(a.late[0].daysLate, 3);
  c.a.v1.done = true;
  assert.equal(L.cardAlerts(c, { number: 1, releaseDate: "2027-01-29" }, "2027-01-08").late.length, 0);
});

test("le jour de l'échéance n'est pas un retard mais est imminent", () => {
  const c = mk(); c.a.v1.date = "2027-01-08";
  const a = L.cardAlerts(c, { number: 1 }, "2027-01-08");
  assert.equal(a.late.length, 0); assert.equal(a.soon.length, 1);
  assert.equal(L.phaseStatus(c, "a", "2027-01-08"), "imminent");
});

test("conflit : 1A/1B doivent finir avant le début de conception", () => {
  const c = mk(); c.a.vdef.date = "2027-02-10"; c.b.delivery.date = "2027-02-01"; c.c.start.date = "2027-02-05";
  const a = L.cardAlerts(c, { number: 1 }, "2027-01-01");
  assert.equal(a.conflicts.length, 1);
  assert.equal(a.conflicts[0].kind, "design");
  assert.match(a.conflicts[0].msg, /Relecture/);
  c.a.vdef.date = "2027-02-04";
  assert.equal(L.cardAlerts(c, { number: 1 }, "2027-01-01").conflicts.length, 0);
  c.a.vdef.date = "2027-02-05"; // même jour : non « avant »
  assert.equal(L.cardAlerts(c, { number: 1 }, "2027-01-01").conflicts.length, 1);
});

test("phase désactivée : plus de conflit ni de retard issus de cette phase", () => {
  const c = mk(); c.a.vdef.date = "2027-02-10"; c.c.start.date = "2027-02-05"; c.phases.a = false;
  assert.equal(L.cardAlerts(c, { number: 1 }, "2027-03-01").conflicts.length, 0);
  assert.equal(L.cardAlerts(c, { number: 1 }, "2027-03-01").late.length, 0);
  assert.equal(L.phaseStatus(c, "a", "2027-03-01"), "off");
});

test("échéance après la sortie = erreur de saisie", () => {
  const c = mk(); c.c.vdef.date = "2027-02-02";
  const a = L.cardAlerts(c, { number: 1, releaseDate: "2027-01-29" }, "2027-01-01");
  assert.equal(a.conflicts.filter((x) => x.kind === "release").length, 1);
});

test("clôture d'une phase", () => {
  const c = mk(); c.a.recolte.interviews = [L.newInterview(D)];
  const p = L.closePhasePatch(c, "a");
  assert.equal(p["a.v1.done"], true);
  assert.equal(p["a.recolte.interviews"][0].done, true);
  const c2 = mk(); // aucune interview saisie : la récolte est réputée faite
  assert.equal(L.closePhasePatch(c2, "a")["a.recolte.skip"], true);
});

function apply(issue, patch) {
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split("."); let o = issue;
    for (const s of parts.slice(0, -1)) o = o[s];
    o[parts.at(-1)] = v;
  }
}

test("chemin de fer : 72 pages, doubles pages, échange, insertion, retrait", () => {
  const issue = { pages: L.initialPages() };
  assert.equal(L.pagesSorted(issue).length, 72);
  const sp = L.spreads(L.pagesSorted(issue));
  assert.equal(sp.length, 37); assert.deepEqual(sp[1].map((p) => p.pos), [2, 3]); assert.equal(sp.at(-1)[0].pos, 72);

  issue.pages.s05.type = "rub"; issue.pages.s05.rubId = "r1";
  issue.pages.s06.type = "publi";
  apply(issue, L.swapPatch(issue, "s05", "s06"));
  assert.equal(L.pagesSorted(issue)[4].id, "s06");

  apply(issue, L.insertPatch(issue, 5)); // dernière page libre : ok
  const s = L.pagesSorted(issue);
  assert.equal(s.length, 72); assert.deepEqual(s.map((p) => p.pos), [...Array(72).keys()].map((i) => i + 1));
  assert.equal(s[4].type, "empty"); assert.equal(s[5].id, "s06");

  issue.pages.s72.type = "pub"; // la dernière n'est plus libre
  const idLast = L.pagesSorted(issue).at(-1).id; issue.pages[idLast].type = "pub";
  assert.equal(L.insertPatch(issue, 5), null);

  apply(issue, L.removePatch(issue, "s06"));
  const t = L.pagesSorted(issue);
  assert.deepEqual(t.map((p) => p.pos), [...Array(72).keys()].map((i) => i + 1));
  assert.equal(t.at(-1).id, "s06"); assert.equal(t.at(-1).type, "empty");
});

test("avancement du numéro : pages rubrique seulement, page sans card = 0 %", () => {
  const issue = { pages: L.initialPages() };
  for (const id of ["s02", "s03", "s04", "s05"]) issue.pages[id] = { ...issue.pages[id], type: "rub", rubId: "r1" };
  issue.pages.s02.cardId = "c1"; issue.pages.s03.cardId = "c1";
  issue.pages.s06.type = "inter"; issue.pages.s07.type = "publi";
  const c = mk(); c.a.v1.done = c.a.vdef.done = true; c.a.recolte.skip = true; c.phases.b = false; c.phases.c = false; // 100 %
  const st = L.issueStats(issue, { c1: c });
  assert.equal(st.prod, 4); assert.equal(st.noCard, 2);
  assert.equal(st.pct, 0.5);
  assert.equal(st.adjust.inter, 1); assert.equal(st.adjust.publi, 1); assert.equal(st.empty, 72 - 6);
});

test("cloneStructure : garde chapitres/rubriques, pas les cards", () => {
  const issue = { pages: L.initialPages() };
  issue.pages.s02 = { ...issue.pages.s02, type: "rub", rubId: "r3", cardId: "c9", label: "x" };
  const cl = L.cloneStructure(issue);
  assert.equal(cl.s02.rubId, "r3"); assert.equal(cl.s02.cardId, "");
});

test("pagination lisible et contraste de texte", () => {
  assert.equal(L.fmtPages([12, 13, 15]), "p. 12-13, 15");
  assert.equal(L.textOn("#E10819"), "#FFFFFF");
  assert.equal(L.textOn("#DDE2EA"), "#1F294C");
});

test("normCard complète un ancien document", () => {
  const c = L.normCard({ title: "x", a: { v1: { date: "2027-01-01" } } });
  assert.equal(c.a.v1.date, "2027-01-01"); assert.equal(c.a.v1.done, false);
  assert.deepEqual(c.a.recolte.interviews, []); assert.equal(c.phases.b, true);
});

test("appliquer aux X pages suivantes : rubrique, mention, card optionnelle, borné en fin de numéro", () => {
  const issue = { pages: L.initialPages() };
  issue.pages.s10 = { pos: 10, type: "rub", rubId: "r1", cardId: "c1", label: "" };
  let { patch, targets } = L.applyNextPatch(issue, "s10", 3);
  assert.deepEqual(targets.map((p) => p.pos), [11, 12, 13]);
  apply(issue, patch);
  assert.equal(issue.pages.s12.type, "rub"); assert.equal(issue.pages.s12.rubId, "r1"); assert.equal(issue.pages.s12.cardId, "");
  assert.equal(issue.pages.s12.pos, 12); assert.equal(issue.pages.s14.type, "empty");
  ({ patch } = L.applyNextPatch(issue, "s10", 2, { withCard: true })); apply(issue, patch);
  assert.equal(issue.pages.s11.cardId, "c1"); assert.equal(issue.pages.s12.cardId, "c1"); assert.equal(issue.pages.s13.cardId, "");
  issue.pages.s70 = { pos: 70, type: "publi", rubId: "", cardId: "", label: "Pub X" };
  ({ patch, targets } = L.applyNextPatch(issue, "s70", 10)); assert.equal(targets.length, 2); // 71 et 72 seulement
  apply(issue, patch); assert.equal(issue.pages.s72.type, "publi"); assert.equal(issue.pages.s72.label, "Pub X");
  assert.equal(L.applyNextPatch(issue, "s10", 0).targets.length, 0);
});
