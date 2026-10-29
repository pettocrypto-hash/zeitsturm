// Interaktives Tutorial: Ein Coach erklärt jede Spielsituation, sobald sie zum ersten Mal auftritt.
import { h, btn, UI } from './dom.js';
import { t } from '../i18n/index.js';
import { pendingActors } from '../core/engine.js';

const ORDER = ['intro', 'hud', 'camera'];
const BY_KIND = { turn: 'turn', path: 'path', quiz: 'quiz', reward: 'reward', post: 'post', challenge: 'challenge', vote: 'vote', motion: 'motion', market: 'market', duelSetup: 'duel', duel: 'duel', concert: 'concert', portal: 'portal' };

export class Tutorial {
  constructor(app) {
    this.app = app;
    this.seen = new Set();
    this.queue = [...ORDER];
    this.el = null;
    this.done = false;
  }

  onState(s, ui) {
    if (this.done) return;
    const pd = s.pending;
    const local = pendingActors(pd).some((id) => ui.session.isLocal(id));
    const step = local ? BY_KIND[pd?.kind] : null;
    if (step && !this.seen.has(step) && !this.queue.includes(step)) this.queue.push(step);
    if (s.log.some((e) => e.type === 'event') && !this.seen.has('event') && !this.queue.includes('event')) this.queue.push('event');
    if (!this.el) this.next();
  }

  next() {
    this.el?.remove();
    this.el = null;
    const step = this.queue.shift();
    if (!step) {
      const all = ['turn', 'path', 'quiz', 'reward', 'post'].every((k) => this.seen.has(k));
      if (all && !this.seen.has('finish')) { this.seen.add('finish'); this.show('finish'); }
      return;
    }
    if (this.seen.has(step)) { this.next(); return; }
    this.seen.add(step);
    this.show(step);
  }

  show(step) {
    const total = 14;
    this.el = h('div', { class: 'coach', role: 'status' },
      h('div', { class: 'c-title' }, '🎓 ', t(`tut.${step}.title`), h('span', { class: 'muted small', style: { float: 'right' } }, `${Math.min(this.seen.size, total)}/${total}`)),
      h('div', { class: 'c-body' }, t(`tut.${step}.body`)),
      h('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'flex-end' } },
        btn(t('tut.skip'), () => this.destroy(), 'small ghost'),
        btn(step === 'finish' ? t('tut.finish') : t('tut.ok'), () => { if (step === 'finish') this.destroy(); else this.next(); }, 'small primary')));
    UI().appendChild(this.el);
  }

  destroy() {
    this.done = true;
    this.el?.remove();
    this.el = null;
  }
}
