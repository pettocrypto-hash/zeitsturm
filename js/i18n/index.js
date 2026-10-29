// Mehrsprachigkeit: Texte liegen pro Sprache in einer Datei (de.js). Weitere Sprachen:
// Datei en.js mit denselben Schlüsseln anlegen, in LANGS eintragen und Fragen unter js/data/en/ ablegen.
import de from './de.js';

const LANGS = { de };
export const LANGUAGES = [{ id: 'de', name: 'Deutsch' }];

let current = 'de';

export function setLang(lang) { if (LANGS[lang]) current = lang; document.documentElement.lang = current; }
export function getLang() { return current; }

export function t(key, params) {
  let s = LANGS[current][key] ?? LANGS.de[key];
  if (s == null) { console.warn('i18n fehlt:', key); return key; }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
  return s;
}

export function has(key) { return LANGS[current][key] != null || LANGS.de[key] != null; }

export async function loadQuestions(lang) {
  const mod = await import(`../data/${LANGS[lang] ? lang : 'de'}/questions/index.js`);
  return mod.default;
}
