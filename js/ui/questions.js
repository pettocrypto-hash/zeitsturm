// Darstellung von Fragen (Multiple Choice, Wahr/Falsch, Schätzen, Reihenfolge, Zuordnung) – touch-optimiert.
import { h, btn, clear, tapFeedback } from './dom.js';
import { t } from '../i18n/index.js';
import { TOPIC_INFO, EPOCHS } from '../core/constants.js';
import { CARDS } from '../core/content.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TAG_COLORS = ['#2fe6ff', '#ff3fb4', '#ffc83a', '#8cff4a'];

export function questionMeta(q) {
  return h('div', { class: 'qmeta' },
    h('span', { class: 'badge', style: { borderColor: TOPIC_INFO[q.topic].color } }, TOPIC_INFO[q.topic].icon, ' ', t(`topic.${q.topic}`)),
    h('span', { class: 'badge', title: t('q.diff', { n: q.diff }) }, t('q.diff', { n: q.diff }), ' ', '★'.repeat(q.diff)),
    q.epoch >= 0 ? h('span', { class: 'badge' }, t(`epoch.${EPOCHS[q.epoch]}`)) : null,
    h('span', { class: 'badge' }, t(`qtype.${q.type}`)));
}

// pending: { order, removed } aus dem Spielzustand. onAnswer(answer) liefert die Antwort im Engine-Format.
export function renderQuestion(q, pending, { onAnswer, jokers = [], onJoker, disabled = false }) {
  const box = h('div', { class: 'qbox' });
  box.appendChild(questionMeta(q));
  box.appendChild(h('div', { class: 'qtext' }, q.q));
  const done = (ans) => { if (disabled) return; disabled = true; onAnswer(ans); };

  if (q.type === 'mc') {
    const opts = h('div', { class: 'opts' });
    (pending.order?.length ? pending.order : [0, 1, 2, 3]).forEach((orig, i) => {
      const gone = (pending.removed || []).includes(orig);
      opts.appendChild(h('button', { class: `opt ${gone ? 'gone' : ''}`, type: 'button', onClick: () => { tapFeedback(); done(orig); } },
        h('span', { class: 'l' }, LETTERS[i]), q.a[orig]));
    });
    box.appendChild(opts);
  } else if (q.type === 'tf') {
    box.appendChild(h('div', { class: 'grid2' },
      btn(['✔ ', t('q.true')], () => done(true), 'big good'),
      btn(['✘ ', t('q.false')], () => done(false), 'big danger')));
  } else if (q.type === 'est') {
    const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', placeholder: '?', 'aria-label': t('q.estimate') });
    const big = Math.abs(q.c) >= 1000 ? 100 : Math.abs(q.c) >= 100 ? 10 : 1;
    const nudge = (d) => { const v = Number(input.value || 0); input.value = String(Math.round((v + d) * 100) / 100); };
    // ± für negative Werte: Die iOS-Zahlentastatur hat kein Minuszeichen
    const flip = () => { const v = Number(String(input.value || '0').replace(',', '.')); input.value = String(-v); };
    box.appendChild(h('div', { class: 'estrow' },
      btn(`−${big}`, () => nudge(-big), 'small ghost'), input, btn(`+${big}`, () => nudge(big), 'small ghost'), btn('±', flip, 'small ghost', { 'aria-label': t('q.sign') })));
    if (q.unit) box.appendChild(h('div', { class: 'muted small center' }, t('q.unit', { unit: q.unit })));
    box.appendChild(btn(t('q.submit'), () => {
      const v = Number(String(input.value).replace(',', '.'));
      if (input.value === '' || Number.isNaN(v)) { input.focus(); return; }
      done(v);
    }, 'primary block big'));
    setTimeout(() => input.focus({ preventScroll: true }), 150);
  } else if (q.type === 'order') {
    const picked = [];
    const list = h('div', { class: 'opts' });
    const confirm = btn(t('q.confirm'), () => done(picked.slice()), 'primary block big', { disabled: true });
    const render = () => {
      clear(list);
      for (const orig of pending.order) {
        const pos = picked.indexOf(orig);
        list.appendChild(h('button', { class: `opt ${pos >= 0 ? 'picked' : ''}`, type: 'button', onClick: () => {
          tapFeedback();
          if (pos >= 0) picked.splice(pos, 1); else picked.push(orig);
          render();
        } }, q.a[orig], pos >= 0 ? h('span', { class: 'num' }, String(pos + 1)) : null));
      }
      confirm.disabled = picked.length !== q.a.length;
    };
    render();
    box.appendChild(h('div', { class: 'muted small' }, t('q.orderHint')));
    box.appendChild(list);
    box.appendChild(h('div', { class: 'grid2' }, btn(t('q.reset'), () => { picked.length = 0; render(); }, 'ghost'), confirm));
  } else if (q.type === 'match') {
    const pairs = new Array(q.pairs.length).fill(null); // linker Index -> rechter Originalindex
    let selLeft = null, selRight = null;
    const grid = h('div', { class: 'match-grid' });
    const confirm = btn(t('q.confirm'), () => done(pairs.slice()), 'primary block big', { disabled: true });
    const tryPair = () => {
      if (selLeft != null && selRight != null) {
        const prev = pairs.indexOf(selRight);
        if (prev >= 0) pairs[prev] = null;
        pairs[selLeft] = selRight;
        selLeft = selRight = null;
      }
      render();
    };
    const render = () => {
      clear(grid);
      const left = h('div', { class: 'match-col' }), right = h('div', { class: 'match-col' });
      q.pairs.forEach((p, i) => {
        const tag = pairs[i] != null ? h('span', { class: 'tag', style: { background: TAG_COLORS[i] } }, String(i + 1)) : null;
        left.appendChild(h('button', { class: `mitem ${selLeft === i ? 'sel' : ''}`, type: 'button', onClick: () => { tapFeedback(); selLeft = selLeft === i ? null : i; tryPair(); } }, tag, p[0]));
      });
      for (const orig of pending.order) {
        const li = pairs.indexOf(orig);
        const tag = li >= 0 ? h('span', { class: 'tag', style: { background: TAG_COLORS[li] } }, String(li + 1)) : null;
        right.appendChild(h('button', { class: `mitem ${selRight === orig ? 'sel' : ''}`, type: 'button', onClick: () => { tapFeedback(); selRight = selRight === orig ? null : orig; tryPair(); } }, tag, q.pairs[orig][1]));
      }
      grid.append(left, right);
      confirm.disabled = pairs.some((x) => x == null);
    };
    render();
    box.appendChild(h('div', { class: 'muted small' }, t('q.matchHint')));
    box.appendChild(grid);
    box.appendChild(confirm);
  }

  if (jokers.length && onJoker) {
    const bar = h('div', { class: 'row wrap' });
    for (const c of jokers) {
      const usable = c !== 'j_fifty' || (q.type === 'mc' && !(pending.removed || []).length);
      bar.appendChild(btn(['🃏 ', t(`card.${c}.name`)], () => onJoker(c), 'small ghost', { disabled: !usable || disabled }));
    }
    box.appendChild(h('div', { class: 'col' }, h('div', { class: 'muted small' }, t('q.jokers')), bar));
  }
  return box;
}

export function correctText(q) {
  switch (q.type) {
    case 'mc': return q.a[0];
    case 'tf': return q.c ? t('q.true') : t('q.false');
    case 'est': return `${q.c.toLocaleString('de-DE')}${q.unit ? ' ' + q.unit : ''}`;
    case 'order': return q.a.map((x, i) => `${i + 1}. ${x}`).join('  ·  ');
    case 'match': return q.pairs.map((p) => `${p[0]} → ${p[1]}`).join('  ·  ');
    default: return '';
  }
}

export function answerText(q, ans) {
  if (ans == null) return t('q.noAnswer');
  switch (q.type) {
    case 'mc': return q.a[ans] ?? '–';
    case 'tf': return ans ? t('q.true') : t('q.false');
    case 'est': return Number(ans).toLocaleString('de-DE');
    case 'order': return Array.isArray(ans) ? ans.map((i) => q.a[i]).join(' → ') : '–';
    case 'match': return Array.isArray(ans) ? ans.map((r, i) => `${q.pairs[i][0]} → ${q.pairs[r]?.[1] ?? '?'}`).join(' · ') : '–';
    default: return String(ans);
  }
}

// Auflösung mit Erklärung (damit man etwas lernt)
export function renderResult(q, ans, correct, extra = null) {
  return h('div', { class: 'qbox' },
    h('div', { class: `verdict ${correct ? 'ok' : 'no'}` }, correct ? t('q.right') : t('q.wrong')),
    h('div', { class: 'qtext', style: { fontSize: '16px' } }, q.q),
    ans !== undefined ? h('div', { class: 'kv' }, h('span', { class: 'muted' }, t('q.yourAnswer')), h('b', {}, answerText(q, ans))) : null,
    h('div', { class: 'kv' }, h('span', { class: 'muted' }, t('q.solution')), h('b', {}, correctText(q))),
    h('div', { class: 'explain' }, '💡 ', q.x),
    extra);
}

export function jokerCards(cards) { return [...new Set(cards.filter((c) => CARDS[c]?.when === 'quiz'))]; }
