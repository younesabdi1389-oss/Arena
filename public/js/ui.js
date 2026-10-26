// ابزارهای رابط: تعویض صفحه، toast، modal و تأیید
import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function showScreen(id) {
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === `screen-${id}`);
  document.body.dataset.screen = id;
  document.dispatchEvent(new CustomEvent('screenchange', { detail: id }));
}

export function currentScreen() {
  return document.body.dataset.screen;
}

export function toast(message, kind = 'info', ms = 2400) {
  const root = $('#toast-root');
  const node = el('div', { class: `toast ${kind}`, role: 'status', text: message });
  root.append(node);
  setTimeout(() => node.classList.add('out'), ms);
  setTimeout(() => node.remove(), ms + 300);
}

/**
 * modal({ title, body, actions:[{label, kind, onClick}] , dismissible })
 * بدنه Node یا رشته؛ اگر onClick مقدار false برگرداند modal بسته نمی‌شود.
 */
export function modal({ title, body, actions = [], dismissible = true }) {
  const root = $('#modal-root');
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
  };
  const buttons = actions.map((a) =>
    el('button', {
      class: `btn ${a.kind ?? 'secondary'}`,
      type: 'button',
      text: a.label,
      onClick: async () => {
        const r = await a.onClick?.();
        if (r !== false) close();
      },
    }),
  );
  const box = el(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    title ? el('h2', { class: 'modal-title', text: title }) : null,
    el('div', { class: 'modal-body' }, typeof body === 'string' ? el('p', { text: body }) : body),
    buttons.length ? el('div', { class: 'modal-actions' }, buttons) : null,
  );
  const backdrop = el('div', { class: 'modal-backdrop', onClick: (e) => e.target === backdrop && dismissible && close() }, box);
  document.addEventListener('keydown', onKey);
  root.append(backdrop);
  buttons[0]?.focus?.();
  return close;
}

export function confirmDialog({ title, body, yes, no }) {
  return new Promise((resolve) => {
    modal({
      title,
      body,
      dismissible: false,
      actions: [
        { label: no ?? t('cancel'), kind: 'secondary', onClick: () => resolve(false) },
        { label: yes ?? t('ok'), kind: 'danger', onClick: () => resolve(true) },
      ],
    });
  });
}
