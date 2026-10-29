// Strukturprüfung des Fragenkatalogs (Formate, Pflichtfelder, Dubletten).
export function validateBank(list) {
  const out = [];
  const seenText = new Map();
  for (const q of list) {
    const tag = `${q.id} (${q.type})`;
    if (!q.q || !q.x) out.push(`${tag}: Text oder Erklärung fehlt`);
    if (![1, 2, 3].includes(q.diff)) out.push(`${tag}: Schwierigkeit ungültig`);
    if (!(q.epoch >= -1 && q.epoch <= 5)) out.push(`${tag}: Epoche ungültig`);
    const key = q.q + JSON.stringify(q.a || q.pairs || '');
    if (seenText.has(key)) out.push(`${tag}: Dublette von ${seenText.get(key)}`);
    seenText.set(key, q.id);
    switch (q.type) {
      case 'mc':
        if (!Array.isArray(q.a) || q.a.length !== 4) out.push(`${tag}: braucht 4 Antworten`);
        else if (new Set(q.a).size !== 4) out.push(`${tag}: doppelte Antworten`);
        break;
      case 'tf': if (typeof q.c !== 'boolean') out.push(`${tag}: c muss boolean sein`); break;
      case 'est': if (typeof q.c !== 'number' || typeof q.tol !== 'number') out.push(`${tag}: c/tol fehlen`); break;
      case 'order': if (!Array.isArray(q.a) || q.a.length < 3 || new Set(q.a).size !== q.a.length) out.push(`${tag}: Reihenfolge ungültig`); break;
      case 'match':
        if (!Array.isArray(q.pairs) || q.pairs.length !== 4) out.push(`${tag}: braucht 4 Paare`);
        else if (new Set(q.pairs.map((p) => p[1])).size !== 4) out.push(`${tag}: doppelte Zuordnungen`);
        break;
      default: out.push(`${tag}: unbekannter Typ`);
    }
  }
  return out;
}
