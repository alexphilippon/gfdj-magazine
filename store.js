/* Couche données : Firestore en production, mémoire en mode démo (?demo) pour tester sans compte. */

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
export const firebaseConfig = {
  apiKey: "AIzaSyDt80UK91_KpvvGdIsBaAfLyOXRlctWWek",
  authDomain: "groupama-fdj-united.firebaseapp.com",
  projectId: "groupama-fdj-united",
  storageBucket: "groupama-fdj-united.firebasestorage.app",
  messagingSenderId: "453165469514",
  appId: "1:453165469514:web:6bbc2e72757f9cce28fbb3",
};

/** Applique un patch à chemins pointés (`a.v1.done`, `pages.s05.pos`) comme le fait Firestore. */
export function applyPatch(obj, patch) {
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split(".");
    let o = obj;
    for (const s of parts.slice(0, -1)) { if (typeof o[s] !== "object" || o[s] === null) o[s] = {}; o = o[s]; }
    o[parts.at(-1)] = v;
  }
  return obj;
}

export async function firebaseStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  const provider = new A.GoogleAuthProvider();
  const split = (p) => p.split("/");
  return {
    demo: false,
    onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(u ? { email: (u.email || "").toLowerCase(), name: u.displayName || "", photo: u.photoURL || "", verified: u.emailVerified } : null)),
    signIn: () => A.signInWithPopup(auth, provider),
    signOut: () => A.signOut(auth),
    watchDoc: (path, cb, err) => F.onSnapshot(F.doc(db, ...split(path)), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), err),
    watchCol: (name, cb, err) => F.onSnapshot(F.collection(db, name), (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }]))), err),
    setDoc: (path, data) => F.setDoc(F.doc(db, ...split(path)), data),
    updateDoc: (path, patch) => F.updateDoc(F.doc(db, ...split(path)), patch),
    addDoc: async (col, data) => (await F.addDoc(F.collection(db, col), data)).id,
    delDoc: (path) => F.deleteDoc(F.doc(db, ...split(path))),
  };
}

export function memoryStore(initial = {}, user = { email: "demo@example.org", name: "Démo", photo: "", verified: true }) {
  const data = JSON.parse(JSON.stringify(initial)); // { "magConfig/main": {...}, "magCards/abc": {...} }
  const listeners = new Set();
  const fire = () => listeners.forEach((f) => f());
  const doc = (path) => (data[path] ? { id: path.split("/")[1], ...JSON.parse(JSON.stringify(data[path])) } : null);
  const col = (name) => Object.fromEntries(Object.keys(data).filter((k) => k.startsWith(name + "/")).map((k) => [k.split("/")[1], doc(k)]));
  const watch = (fn, cb) => { const f = () => cb(fn()); listeners.add(f); queueMicrotask(f); return () => listeners.delete(f); };
  return {
    demo: true,
    data,
    onAuth: (cb) => { queueMicrotask(() => cb(user)); return () => {}; },
    signIn: async () => {}, signOut: async () => {},
    watchDoc: (path, cb) => watch(() => doc(path), cb),
    watchCol: (name, cb) => watch(() => col(name), cb),
    setDoc: async (path, d) => { data[path] = JSON.parse(JSON.stringify(d)); fire(); },
    updateDoc: async (path, patch) => { applyPatch(data[path], JSON.parse(JSON.stringify(patch))); fire(); },
    addDoc: async (c, d) => { const id = "m" + Math.random().toString(36).slice(2, 10); data[`${c}/${id}`] = JSON.parse(JSON.stringify(d)); fire(); return id; },
    delDoc: async (path) => { delete data[path]; fire(); },
  };
}
