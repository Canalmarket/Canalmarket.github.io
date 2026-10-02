// Service worker de Canal. Son seul rôle est la notification du soir : il ne met rien en cache,
// pour qu'une page reconstruite chaque jour ne soit jamais servie périmée.
//
// La notification poussée arrive VIDE, sans contenu. C'est volontaire : transporter un texte
// imposerait de chiffrer la charge utile (ECDH puis AES-128-GCM), la partie du protocole où l'on
// se trompe, et une erreur de chiffrement se traduit par une notification qui n'arrive jamais.
// Le service worker va donc lire lui-même /jour.json sur le site, qui est republié par la même
// Action, une minute plus tôt.
//
// iOS exige qu'un push se termine TOUJOURS par une notification affichée : sans cela il finit par
// révoquer l'abonnement. D'où la notification de repli si la lecture échoue.
const SITE = "/";

const nombre = v => (v < 0 ? "−" : "+") + Math.abs(v * 100).toFixed(1).replace(".", ",") + " %";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

async function composer() {
  const r = await fetch("/jour.json?" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const [, m, d] = j.date.split("-").map(Number);
  const ligne = (x, hausse) => `${hausse ? "▲" : "▼"} ${x.nom}  ${nombre(x.v)}`;
  const corps = [
    ...j.hausses.map(x => ligne(x, true)),
    ...(j.hausses.length && j.baisses.length ? [""] : []),
    ...j.baisses.map(x => ligne(x, false)),
  ].join("\n");
  return {
    titre: `Canal — séance du ${d === 1 ? "1er" : d} ${MOIS[m - 1]}`,
    corps: corps || "Aucun mouvement à signaler sur cette séance.",
  };
}

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let n;
    try { n = await composer(); }
    catch (err) { n = { titre: "Canal", corps: "Les mouvements du jour sont disponibles." }; }
    await self.registration.showNotification(n.titre, {
      body: n.corps,
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: "canal-jour",      // une seule notification à la fois : la nouvelle remplace l'ancienne
      renotify: true,
      data: { url: SITE },
    });
  })());
});

// Toucher la notification ouvre Canal — l'application de l'écran d'accueil si elle est installée,
// et non le navigateur : c'est toute la raison d'être de ce fichier.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres) if ("focus" in f) return f.focus();
    if (self.clients.openWindow) return self.clients.openWindow(SITE);
  })());
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
