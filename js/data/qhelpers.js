// Kompakte Konstruktoren für Fragen.
// Epochen: -1 = passt überall, 0 Antike, 1 Mittelalter/Frühe Neuzeit, 2 Industrialisierung (ca. 1750–1914),
// 3 Weltkriegs-Ära (1914–1945), 4 Kalter Krieg (1945–1991), 5 Zukunft/Gegenwart (ab 1991).
// Multiple Choice: a[0] ist immer die richtige Antwort – die Anzeige wird pro Partie gemischt.
// Reihenfolge: a steht in der richtigen Reihenfolge. Zuordnung: pairs = [[links, rechts], ...].

export const mc = (diff, epoch, q, a, x) => ({ type: 'mc', diff, epoch, q, a, x });
export const tf = (diff, epoch, q, c, x) => ({ type: 'tf', diff, epoch, q, c, x });
export const est = (diff, epoch, q, c, tol, unit, x) => ({ type: 'est', diff, epoch, q, c, tol, unit, x });
export const ord = (diff, epoch, q, a, x) => ({ type: 'order', diff, epoch, q, a, x });
export const mat = (diff, epoch, q, pairs, x) => ({ type: 'match', diff, epoch, q, pairs, x });

export function makeBank(topic, list) {
  return list.map((q, i) => ({ id: `${topic}${String(i + 1).padStart(3, '0')}`, topic, ...q }));
}
