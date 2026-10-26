// صفحه‌ی انتخاب دسته‌ی ۸ کارتی. همه‌ی ۱۶ کارت اولیه در دسترس‌اند (سیستم مجموعه/باز شدن کارت در مراحل بعد).
import { CARDS, validateDeck, DEFAULT_DECK, CARD_BY_ID } from '/shared/cards.js';
import { BATTLE } from '/shared/config.js';
import { t, n } from './i18n.js';
import { $, toast } from './ui.js';
import { cardEl, showCardInfo } from './cardView.js';
import { store } from './store.js';

const SIZE = BATTLE.deck.size;

export function createDeckScreen({ onBack }) {
  let draft = [];

  const grid = $('#deck-grid');

  function avg() {
    if (!draft.length) return 0;
    return draft.reduce((s, id) => s + CARD_BY_ID[id].cost, 0) / draft.length;
  }

  function render() {
    // مرتب‌سازی: ابتدا انتخاب‌شده‌ها، سپس بر اساس هزینه
    const order = [...CARDS].sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    grid.replaceChildren(
      ...order.map((card) => {
        const inDeck = draft.includes(card.id);
        const node = cardEl(card, { onInfo: showCardInfo });
        node.classList.add(inDeck ? 'in-deck' : 'not-in');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-pressed', String(inDeck));
        node.addEventListener('click', () => toggle(card.id));
        return node;
      }),
    );
    $('#deck-count').textContent = t('deck.count', { n: n(draft.length) });
    $('#deck-avg').textContent = t('deck.avgCost', { v: n(avg(), { maximumFractionDigits: 1 }) });
    $('#deck-save').disabled = draft.length !== SIZE;
  }

  function toggle(id) {
    const i = draft.indexOf(id);
    if (i >= 0) draft.splice(i, 1);
    else if (draft.length >= SIZE) return toast(t('deck.full'), 'error', 1500);
    else draft.push(id);
    render();
  }

  $('#deck-back').addEventListener('click', () => onBack());
  $('#deck-reset').addEventListener('click', () => {
    draft = DEFAULT_DECK.slice();
    render();
  });
  $('#deck-save').addEventListener('click', () => {
    if (!validateDeck(draft, SIZE)) return toast(t('deck.need8'), 'error');
    store.deck = draft;
    toast(t('deck.saved'), 'success');
    onBack();
  });

  return {
    open() {
      draft = store.deck;
      render();
    },
  };
}

/** نوار کوچک کارت‌های دسته‌ی فعلی برای صفحه‌ی خانه */
export function renderDeckStrip(container) {
  container.replaceChildren(...store.deck.map((id) => cardEl(CARD_BY_ID[id], { mini: true })));
}
