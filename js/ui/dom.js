// Kleine DOM-Hilfen für die Oberfläche.
export const UI = () => document.getElementById('ui');

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function btn(label, onClick, cls = '', extra = {}) {
  return h('button', { class: `btn ${cls}`, type: 'button', onClick: (e) => { tapFeedback(); onClick?.(e); }, ...extra }, label);
}

let sound = null;
let haptics = true;
export function setFeedback(audio, useHaptics) { sound = audio; haptics = useHaptics; }
export function tapFeedback() { sound?.sfx('click'); vibrate(8); }
export function vibrate(pattern) {
  if (!haptics || !navigator.vibrate) return;
  // Browser erlauben Vibration erst nach einer Nutzergeste – vorher gar nicht erst versuchen
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(pattern); } catch (e) { /* nicht unterstützt */ }
}

export function toast(text, kind = '') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); UI().appendChild(box); }
  const t = h('div', { class: `toast ${kind}` }, text);
  box.appendChild(t);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => t.remove(), 3500);
}

export function banner(text, sub = '') {
  document.querySelectorAll('.banner').forEach((b) => b.remove());
  const b = h('div', { class: 'banner' }, text, sub ? h('small', {}, sub) : null);
  UI().appendChild(b);
  setTimeout(() => b.remove(), 2000);
}

// Modal (auf dem Handy als Bottom-Sheet)
export function modal({ title, icon, content, closable = true, onClose, cls = '' }) {
  const close = () => { back.remove(); onClose?.(); };
  const m = h('div', { class: `modal ${cls}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'grab' }),
    title ? h('div', { class: 'modal-head' }, icon ? h('span', { style: { fontSize: '22px' } }, icon) : null, h('div', { class: 'title' }, title),
      closable ? h('button', { class: 'btn ghost icon-btn', type: 'button', 'aria-label': '×', onClick: close }, '✕') : null) : null,
    content);
  const back = h('div', { class: 'backdrop', onClick: (e) => { if (e.target === back && closable) close(); } }, m);
  UI().appendChild(back);
  return { el: m, back, close, setContent: (c) => { clear(m); m.append(h('div', { class: 'grab' })); m.append(c); } };
}

export function ask(text, yes, no) {
  return new Promise((resolve) => {
    const md = modal({
      title: text, closable: false,
      content: h('div', { class: 'grid2' }, btn(no, () => { md.close(); resolve(false); }, 'ghost'), btn(yes, () => { md.close(); resolve(true); }, 'primary')),
    });
  });
}

export function stepper(value, min, max, onChange, step = 1) {
  const val = h('div', { class: 'val' }, String(value));
  const set = (v) => { value = Math.max(min, Math.min(max, v)); val.textContent = String(value); onChange(value); };
  return {
    el: h('div', { class: 'stepper' },
      btn('−', () => set(value - step), 'small icon-btn'), val, btn('+', () => set(value + step), 'small icon-btn'),
      max - min > 6 ? btn('max', () => set(max), 'small ghost') : null),
    set,
    get: () => value,
  };
}

export function seg(options, current, onChange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const render = () => {
    clear(el);
    for (const o of options) {
      el.appendChild(h('button', { type: 'button', class: o.value === current ? 'on' : '', role: 'radio', 'aria-checked': String(o.value === current),
        onClick: () => { tapFeedback(); current = o.value; render(); onChange(o.value); } }, o.label));
    }
  };
  render();
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
