// Regelübersicht (jederzeit abrufbar) und Einstellungen.
import { h, btn, modal, seg, toast, setFeedback, ask } from './dom.js';
import { t, LANGUAGES, getLang } from '../i18n/index.js';
import { TOPICS, TOPIC_INFO, FIELD_INFO } from '../core/constants.js';
import { CARDS, CARD_KIND_ICON } from '../core/content.js';
import { prefs, savePrefs, clearGame } from '../app/prefs.js';

function textBlock(s) {
  const out = [];
  let list = null;
  for (const line of s.split('\n')) {
    if (line.startsWith('• ')) { if (!list) { list = h('ul'); out.push(list); } list.appendChild(h('li', {}, line.slice(2))); }
    else { list = null; if (line.trim()) out.push(h('p', {}, line)); }
  }
  return out;
}

const SECTIONS = ['goal', 'turn', 'resources', 'fields', 'parliament', 'alliances', 'cards', 'storm', 'controls'];

export function openRules() {
  const body = h('div', { class: 'rules' });
  for (const key of SECTIONS) {
    const sec = h('section', {}, h('h3', {}, t(`rules.${key}.title`)), textBlock(t(`rules.${key}.body`)));
    if (key === 'fields') {
      sec.appendChild(h('div', { class: 'legend' },
        Object.entries(FIELD_INFO).filter(([k]) => k !== 'topic').map(([k, f]) => h('div', {}, h('span', { class: 'sw', style: { background: f.color } }, f.icon), h('span', {}, h('b', {}, t(f.key)), ' – ', t(`rules.field.${k}`)))),
        TOPICS.map((tp) => h('div', {}, h('span', { class: 'sw', style: { background: TOPIC_INFO[tp].color } }, TOPIC_INFO[tp].icon), h('span', {}, h('b', {}, t(`topic.${tp}`)), ' – ', t('rules.field.topic'))))));
    }
    if (key === 'cards') {
      const kinds = ['joker', 'sabotage', 'jump', 'shield', 'veto', 'spy'];
      for (const kind of kinds) {
        const det = h('details', {}, h('summary', { style: { cursor: 'pointer', padding: '6px 0', fontWeight: '700' } }, CARD_KIND_ICON[kind], ' ', t(`cardkind.${kind}`)),
          h('ul', {}, Object.entries(CARDS).filter(([, c]) => c.kind === kind).map(([id]) => h('li', {}, h('b', {}, t(`card.${id}.name`)), ': ', t(`card.${id}.desc`)))));
        sec.appendChild(det);
      }
    }
    body.appendChild(sec);
  }
  modal({ title: t('rules.title'), icon: '❔', content: body });
}

// Barrierefreiheit: große Schrift und reduzierte Bewegung als Klassen am Dokument
export function applyAccessibility() {
  document.documentElement.classList.toggle('big-text', !!prefs.bigText);
  document.documentElement.classList.toggle('reduce-motion', !!prefs.reduceMotion);
}

export function openWhatsNew() {
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => h('li', {}, t(`new.v21.${i}`)));
  modal({ title: t('new.title'), icon: '✨', content: h('div', { class: 'rules' }, h('h3', {}, t('new.v21')), h('ul', {}, items), h('h3', {}, t('new.v2')), h('p', {}, t('new.v2text'))) });
}

export function openSettings(app) {
  const vol = (key) => {
    const input = h('input', { class: 'range', type: 'range', min: '0', max: '1', step: '0.05', value: String(prefs[key]), 'aria-label': t(`set.${key}`) });
    input.addEventListener('input', () => { prefs[key] = Number(input.value); app.audio.setVolumes(prefs.music, prefs.sfx); savePrefs(); });
    input.addEventListener('change', () => app.audio.sfx('coin'));
    return input;
  };
  const toggle = (key, label, onChange) => {
    const b = h('button', { type: 'button', class: `toggle-chip ${prefs[key] ? 'on' : ''}`, 'aria-pressed': String(!!prefs[key]) }, label);
    b.addEventListener('click', () => { prefs[key] = !prefs[key]; b.classList.toggle('on', prefs[key]); b.setAttribute('aria-pressed', String(prefs[key])); savePrefs(); onChange?.(); });
    return b;
  };
  const haptic = toggle('haptics', ['📳 ', t('set.haptics')], () => setFeedback(app.audio, prefs.haptics));
  const bigText = toggle('bigText', ['🔠 ', t('set.bigText')], applyAccessibility);
  const motion = toggle('reduceMotion', ['🐢 ', t('set.reduceMotion')], () => { applyAccessibility(); app.render.effects.motionScale = prefs.reduceMotion ? 0.35 : 1; });
  const lang = h('select', { class: 'input', 'aria-label': t('set.lang') }, LANGUAGES.map((l) => h('option', { value: l.id, selected: l.id === getLang() }, l.name)));
  lang.addEventListener('change', () => { prefs.lang = lang.value; savePrefs(); toast(t('set.langReload')); });
  modal({
    title: t('set.title'), icon: '⚙',
    content: h('div', { class: 'col' },
      h('div', { class: 'field' }, h('label', {}, t('set.quality')),
        seg(['low', 'medium', 'high'].map((q) => ({ value: q, label: t(`quality.${q}`) })), prefs.quality, (v) => { prefs.quality = v; savePrefs(); app.render.world.applyQuality(v); toast(t('set.qualityNote')); }),
        h('div', { class: 'muted small' }, t('set.fps', { fps: Math.round(app.render.world.fps) }))),
      h('div', { class: 'field' }, h('label', {}, t('set.music')), vol('music')),
      h('div', { class: 'field' }, h('label', {}, t('set.sfx')), vol('sfx')),
      h('div', { class: 'field' }, h('label', {}, t('set.botSpeed')),
        seg(['slow', 'normal', 'fast'].map((v) => ({ value: v, label: t(`set.speed.${v}`) })), prefs.botSpeed, (v) => { prefs.botSpeed = v; savePrefs(); if (app.session) app.session.botSpeed = v; })),
      h('div', { class: 'field' }, h('label', {}, t('set.access')), h('div', { class: 'row wrap' }, haptic, bigText, motion)),
      h('div', { class: 'field' }, h('label', {}, t('set.lang')), lang),
      h('div', { class: 'muted small' }, t('set.gameDefaults')),
      btn(['🗑 ', t('set.clearSave')], async () => {
        if (await ask(t('set.clearConfirm'), t('common.yes'), t('common.no'))) { clearGame(); toast(t('set.cleared'), 'good'); }
      }, 'ghost block'),
      h('div', { class: 'muted small center' }, 'ZEITSTURM 1.0 · Three.js · PeerJS · Web Audio')),
  });
}
