import { createRng } from '../util/rng.js';
import { BATTLE, } from '../../shared/config.js';
import { validateDeck } from '../../shared/cards.js';

/**
 * دسته‌ی ۸ کارتی با دست چرخشی ۴ تایی.
 * ترتیب فقط از (کارت‌ها + seed) ساخته می‌شود و کاملاً قابل بازسازی است.
 * کارت‌ها بعد از استفاده به انتهای صف می‌روند، کارت «بعدی» همیشه سرِ صف است.
 */
export class Deck {
  constructor(cardIds, seed, handSize = BATTLE.deck.hand) {
    if (!validateDeck(cardIds, BATTLE.deck.size)) throw new Error('invalid deck');
    this.cardIds = cardIds.slice();
    this.seed = seed >>> 0;
    const order = createRng(this.seed).shuffle(this.cardIds);
    this.hand = order.slice(0, handSize);
    this.queue = order.slice(handSize);
    this.played = []; // لاگ ترتیب استفاده (برای بازپخش آینده)
  }

  get next() {
    return this.queue[0];
  }

  /** کارت جایگاه slot را مصرف می‌کند و کارت بعدی را جایگزین می‌کند */
  play(slot) {
    const id = this.hand[slot];
    this.hand[slot] = this.queue.shift();
    this.queue.push(id);
    this.played.push(id);
    return id;
  }
}
