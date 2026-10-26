// ساخت DOM کارت‌ها و پنجره‌ی جزئیات.
// تصویر کارت‌ها فعلاً «placeholder» است (آیکون اموجی روی پس‌زمینه‌ی رنگی). برای جایگزینی با
// تصویر واقعی: فایل را در public/assets/cards/<id>.png بگذارید و در assets.js ثبت کنید.
import { RARITIES, CARD_TYPES, cardName, cardDesc, CARD_BY_ID } from '/shared/cards.js';
import { t, n } from './i18n.js';
import { el, modal } from './ui.js';
import { assetUrl } from './assets.js';

export function cardEl(card, { level = 1, selected = false, disabled = false, mini = false, onInfo } = {}) {
  const art = assetUrl('card', card.id);
  const node = el(
    'div',
    {
      class: `card r-${card.rarity} t-${card.type}${mini ? ' mini' : ''}${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`,
      dataset: { id: card.id },
      style: { '--card-color': card.color },
    },
    el('div', { class: 'card-cost', text: n(card.cost) }),
    el(
      'div',
      { class: 'card-art' },
      art ? el('img', { src: art, alt: '', draggable: 'false' }) : el('span', { class: 'card-icon', 'aria-hidden': 'true', text: card.icon }),
    ),
    el('div', { class: 'card-name', text: cardName(card) }),
    mini ? null : el('div', { class: 'card-level', text: t('card.level', { n: n(level) }) }),
  );
  if (onInfo) {
    node.append(
      el('button', {
        class: 'card-info',
        type: 'button',
        'aria-label': 'ⓘ',
        text: 'ⓘ',
        onClick: (e) => {
          e.stopPropagation();
          onInfo(card);
        },
        onPointerdown: (e) => e.stopPropagation(),
      }),
    );
  }
  return node;
}

function statRow(label, value) {
  return el('div', { class: 'stat-row' }, el('span', { class: 'stat-k', text: label }), el('span', { class: 'stat-v', text: value }));
}

export function showCardInfo(card) {
  const rows = [statRow(t('card.cost'), n(card.cost))];
  if (card.type === 'unit' || card.type === 'structure') {
    if (card.type === 'unit') rows.push(statRow(t('card.targets'), card.targets === 'buildings' ? t('card.targetsBuildings') : t('card.targetsAny')));
    rows.push(statRow(t('card.hp'), n(card.hp)));
    if (card.damage > 0) {
      rows.push(statRow(t('card.damage'), n(card.damage)));
      rows.push(statRow(t('card.hitSpeed'), t('card.seconds', { v: n(card.hitSpeed, { maximumFractionDigits: 1 }) })));
      rows.push(statRow(t('card.range'), card.range > 1 ? n(card.range, { maximumFractionDigits: 1 }) : t('card.melee')));
      rows.push(statRow(t('card.hitsAir'), card.attacksAir ? '✔' : '✘'));
    }
    if (card.type === 'unit') {
      rows.push(statRow(t('card.speed'), n(card.speed, { maximumFractionDigits: 1 })));
      rows.push(statRow(t('card.air'), card.air ? t('card.air') : t('card.ground')));
      if (card.count > 1) rows.push(statRow(t('card.count'), n(card.count)));
    } else {
      rows.push(statRow(t('card.lifetime'), t('card.seconds', { v: n(card.lifetime) })));
    }
    if (card.splash) rows.push(statRow(t('card.splash'), n(card.splash, { maximumFractionDigits: 1 })));
  } else {
    rows.push(statRow(t('card.damage'), n(card.damage)));
    rows.push(statRow(t('card.radius'), n(card.radius, { maximumFractionDigits: 1 })));
  }
  modal({
    title: cardName(card),
    body: el(
      'div',
      { class: 'card-detail' },
      el(
        'div',
        { class: 'card-detail-head' },
        cardEl(CARD_BY_ID[card.id], { mini: true }),
        el(
          'div',
          {},
          el('span', { class: `badge r-${card.rarity}`, text: RARITIES[card.rarity].en }),
          ' ',
          el('span', { class: 'badge', text: CARD_TYPES[card.type].en }),
        ),
      ),
      el('p', { class: 'card-desc', text: cardDesc(card) }),
      el('div', { class: 'stats' }, rows),
    ),
    actions: [{ label: t('card.close'), kind: 'primary' }],
  });
}
