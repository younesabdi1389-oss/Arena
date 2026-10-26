// نقطه‌ی ورود مرورگر: ورود مهمان، خانه، صف/اتاق، نبرد، نتیجه.
// منطق بازی اینجا نیست؛ همه‌ی تصمیم‌ها را سرور می‌گیرد.
import './fonts.js';
import { setLocale, t, n, errorText } from './i18n.js';
import { $, el, showScreen, currentScreen, toast, modal, confirmDialog } from './ui.js';
import { net } from './net.js';
import { store } from './store.js';
import { BattleController } from './battle/BattleController.js';
import { createDeckScreen, renderDeckStrip } from './deckScreen.js';
import { AI_DIFFICULTIES } from '/shared/config.js';
import { startSplash } from './splash.js';
import { setAmbient, releaseAmbient } from './ambient.js';
import { initMusic, setMenuActive, toggleMusic, onChange as onMusicChange, info as musicInfo } from './audio.js';

const state = {
  player: null,
  mode: null, // 'online' | 'friendly' | 'practice'
  difficulty: store.lastPractice(),
  side: 0,
  queueTimer: null,
  resultTimer: null,
  inBattle: false,
  gameName: 'Project Arena',
};

let battle = null;
let deckScreen = null;
let splash = null;
// کارت‌های اولیه‌ی منو: آماده‌شدن اولین صفحه‌ی بازی (ورود یا خانه) به لودینگ خبر داده می‌شود
let markFirstScreenReady = () => {};
const firstScreenReady = new Promise((r) => (markFirstScreenReady = r));

// ───────────────────────── متن‌ها ─────────────────────────

function applyTexts() {
  const set = (sel, text) => {
    const node = $(sel);
    if (node) node.textContent = text;
  };
  set('#boot-text', t('loading'));
  $('#arena').setAttribute('aria-label', t('battle.arena'));
  set('#login-title', t('login.title'));
  set('#login-name-label', t('login.nameLabel'));
  $('#login-name').placeholder = t('login.namePlaceholder');
  set('#login-hint', t('login.nameHint'));
  set('#login-submit', t('login.guestBtn'));
  set('#login-note', t('login.guestNote'));
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  // برچسب‌های دسترسی‌پذیر دکمه‌های آیکونی
  $('#btn-online').setAttribute('aria-label', t('home.online'));
  $('#btn-friendly').setAttribute('aria-label', t('home.friendly'));
  $('#btn-practice').setAttribute('aria-label', t('home.practice'));
  $('#btn-deck').setAttribute('aria-label', t('home.deck'));
  $('#btn-deck-orb').setAttribute('aria-label', t('home.deck'));
  $('#btn-friends').setAttribute('aria-label', t('home.friendly'));
  $('#btn-friends-quick').setAttribute('aria-label', t('home.friendly'));
  $('#btn-news').setAttribute('aria-label', t('home.soon'));
  $('#btn-menu').setAttribute('aria-label', t('settings.title'));
  $('#btn-profile').setAttribute('aria-label', t('home.profile'));
  for (const node of document.querySelectorAll('.cur, .side-btn.trophy')) node.setAttribute('aria-label', t('home.soon'));
  set('#home-deck-label', t('home.yourDeck'));
  set('#home-badge', t('home.guestBadge'));
  set('#deck-back', t('deck.back'));
  set('#deck-title', t('deck.title'));
  set('#deck-hint', t('deck.hint'));
  set('#deck-reset', t('deck.reset'));
  set('#deck-save', t('deck.save'));
  set('#queue-cancel', t('queue.cancel'));
  set('#queue-copy', t('friendly.copy'));
  set('#battle-leave', t('battle.leave'));
  $('#emote-toggle').setAttribute('aria-label', t('battle.emotes'));
  set('#result-home', t('result.home'));
  set('#result-again', t('result.again'));
  set('#result-note', t('result.noRewards'));
}

function updateSoundUi() {
  const i = musicInfo();
  const prompt = $('#sound-prompt');
  prompt.textContent = `🔊 ${t('sound.tap')}`;
  prompt.hidden = !(i.available && i.blocked && currentScreen() !== 'battle');
}

function applyGameName(name) {
  state.gameName = name;
  document.title = name;
  for (const node of document.querySelectorAll('[data-game-name]')) node.textContent = name;
}

// ───────────────────────── ناوبری ─────────────────────────

function goHome() {
  clearInterval(state.queueTimer);
  battle?.end();
  state.inBattle = false;
  $('#home-welcome').textContent = t('home.welcome', { name: state.player?.name ?? '' });
  renderDeckStrip($('#home-deck-strip'));
  showScreen('home');
  markFirstScreenReady();
}

function applyReduceFx(on) {
  document.body.classList.toggle('reduce-fx', !!on);
  setAmbient(!on && currentScreen() !== 'battle');
  const fx = $('#opt-reduce-fx');
  if (fx) fx.checked = !!on;
  if (battle) battle.view.reduceFx = !!on;
}

// ───────────────────────── ورود ─────────────────────────

async function login(rawName) {
  const btn = $('#login-submit');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true;
  try {
    const name = rawName.trim();
    if (name && !/^[\p{L}\p{N}_\- ]{2,16}$/u.test(name)) {
      err.textContent = t('login.badName');
      err.hidden = false;
      return;
    }
    const data = await net.createGuest(name);
    store.token = data.token;
    store.name = name;
    state.player = data.player;
    connect(data.token);
  } catch (e) {
    err.textContent = e.code === 'rate_limited' ? t('login.rateLimited') : t('login.serverError');
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function connect(token) {
  showScreen('boot');
  $('#boot-text').textContent = t('connecting');
  net.connect(token);
}

async function boot() {
  setLocale('en');
  applyTexts();
  // لودینگ فیلم: همزمان با راه‌اندازی بازی اجرا می‌شود و فقط روی آن پوشش می‌دهد
  splash = startSplash();
  splash.track(preloadArt());
  splash.track(document.fonts?.ready);
  splash.track(firstScreenReady);
  splash.finished.then(() => {
    releaseAmbient();
    initMusic();
  }); // موسیقی منو (اگر فایلش باشد) بعد از پایان فیلم؛ صدای فیلم با موسیقی قاطی نمی‌شود
  document.addEventListener('screenchange', (e) => {
    setAmbient(!store.reduceFx && e.detail !== 'battle');
    setMenuActive(e.detail !== 'battle');
    updateSoundUi();
  });
  // موسیقی: بدون await تا راه‌اندازی بازی معطل پخش صدا نماند (initMusic بعد از پایان لودینگ فیلم صدا زده می‌شود)
  onMusicChange(updateSoundUi);
  $('#sound-prompt').addEventListener('click', toggleMusic);
  applyReduceFx(store.reduceFx);
  const cfg = await net.config();
  if (cfg.gameName) applyGameName(cfg.gameName);

  const token = store.token;
  if (!token) return showLogin();
  const session = await net.checkSession(token).catch(() => null);
  if (!session) {
    // توکن نامعتبر/منقضی (مثلاً سرور ریست شده) → ورود دوباره
    store.clearSession();
    return showLogin();
  }
  state.player = session.player;
  connect(token);
}

function showLogin() {
  $('#login-name').value = store.name;
  showScreen('login');
  markFirstScreenReady();
}

/** تصاویر منو را از قبل می‌گیرد و رمزگشایی می‌کند تا بعد از لودینگ بدون پرش نمایش داده شوند. */
function preloadArt() {
  const urls = ['/assets/art/island.webp', '/assets/art/hero.webp', '/assets/art/cards.webp', '/assets/art/potion.webp', '/assets/bg/home.jpg'];
  return Promise.all(
    urls.map(
      (u) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => (img.decode ? img.decode().catch(() => {}).then(resolve) : resolve());
          img.onerror = resolve; // نبودن یک تصویر نباید لودینگ را معطل کند
          img.src = u;
        }),
    ),
  );
}

// ───────────────────────── رویدادهای شبکه ─────────────────────────

function bindNet() {
  net.on('session:ready', ({ player, status }) => {
    state.player = player;
    if (status === 'battle') return; // battle:start بلافاصله می‌رسد
    const s = currentScreen();
    if (s === 'battle' || s === 'result') return;
    if (s === 'queue') toast(t('errors.offline'), 'error');
    goHome();
  });

  net.on('net:error', (err) => {
    if (err?.message === 'unauthorized') {
      // نشست در سرور وجود ندارد (ریست سرور)
      net.disconnect();
      store.clearSession();
      showLogin();
      toast(t('login.serverError'), 'error');
    } else if (currentScreen() === 'boot') {
      $('#boot-text').textContent = t('boot.failed');
      markFirstScreenReady(); // خطا را بعد از فیلم به کاربر نشان بده، نه اینکه لودینگ تا ابد بماند
    }
  });

  net.on('net:disconnect', () => {
    if (state.inBattle) battle.setReconnecting(true);
  });

  net.on('session:replaced', () => {
    net.disconnect();
    battle?.end();
    state.inBattle = false;
    showScreen('boot');
    $('#boot-text').textContent = t('battle.replaced');
  });

  net.on('battle:start', (msg) => {
    clearTimeout(state.resultTimer);
    clearInterval(state.queueTimer);
    $('#modal-root').replaceChildren();
    state.inBattle = true;
    state.mode = msg.mode;
    state.side = msg.side;
    showScreen('battle');
    battle ??= new BattleController({ reduceFx: store.reduceFx });
    battle.begin(msg);
    if (msg.resumed) toast(t('battle.reconnected'), 'success');
  });

  net.on('battle:snap', (snap) => {
    battle?.onSnapshot(snap);
    for (const ev of snap.ev ?? []) {
      if (ev.k === 'die' && ev.t === 'tower') battle?.banner(ev.o === state.side ? t('battle.towerMine') : t('battle.towerEnemy'));
    }
  });

  net.on('battle:emote', (m) => battle?.showEmote(m));

  net.on('battle:end', (res) => {
    state.inBattle = false;
    // کمی صبر تا بازیکن لحظه‌ی پایانی را ببیند
    state.resultTimer = setTimeout(() => {
      battle?.end();
      showResult(res);
    }, 1400);
  });

  net.on('room:expired', () => {
    toast(t('friendly.expired'), 'error');
    goHome();
  });
}

// ───────────────────────── صف و اتاق ─────────────────────────

function showQueue({ title, sub, code, cancel }) {
  $('#queue-title').textContent = title;
  $('#queue-sub').textContent = sub ?? '';
  const codeEl = $('#queue-code');
  codeEl.hidden = !code;
  codeEl.textContent = code ?? '';
  $('#queue-copy').hidden = !code;
  $('#queue-cancel').onclick = async () => {
    clearInterval(state.queueTimer);
    await cancel();
    goHome();
  };
  showScreen('queue');
}

async function startOnline() {
  const r = await net.request('queue:join', { deck: store.deck });
  if (!r.ok) return toast(errorText(r.code), 'error');
  state.mode = 'online';
  const t0 = Date.now();
  const tick = () => ($('#queue-sub').textContent = t('queue.elapsed', { sec: n(Math.floor((Date.now() - t0) / 1000)) }));
  showQueue({ title: t('queue.searching'), cancel: () => net.request('queue:leave') });
  tick();
  state.queueTimer = setInterval(tick, 1000);
}

async function startPractice(difficulty) {
  state.difficulty = difficulty;
  store.setLastPractice(difficulty);
  const r = await net.request('practice:start', { deck: store.deck, difficulty });
  if (!r.ok) toast(errorText(r.code), 'error');
}

function openPracticeModal() {
  const body = el(
    'div',
    { class: 'choice-list' },
    el('p', { class: 'muted', text: t('practice.pick') }),
    ...AI_DIFFICULTIES.map((d) =>
      el('button', {
        class: `btn ${d === state.difficulty ? 'primary' : 'secondary'}`,
        type: 'button',
        text: t(`practice.${d}`),
        onClick: () => {
          $('#modal-root').replaceChildren();
          startPractice(d);
        },
      }),
    ),
    el('p', { class: 'muted note', text: t('practice.note') }),
  );
  modal({ title: t('practice.title'), body, actions: [{ label: t('cancel'), kind: 'ghost' }] });
}

function openFriendlyModal() {
  const input = el('input', { type: 'text', maxlength: '8', placeholder: t('friendly.codePlaceholder'), 'aria-label': t('friendly.joinLabel'), autocomplete: 'off' });
  const body = el(
    'div',
    { class: 'choice-list' },
    el('button', {
      class: 'btn primary',
      type: 'button',
      text: t('friendly.create'),
      onClick: async () => {
        const r = await net.request('room:create', { deck: store.deck });
        if (!r.ok) return toast(errorText(r.code), 'error');
        $('#modal-root').replaceChildren();
        showQueue({
          title: t('friendly.title'),
          sub: t('friendly.waiting'),
          code: r.code,
          cancel: () => net.request('room:cancel'),
        });
        $('#queue-copy').onclick = async () => {
          try {
            await navigator.clipboard.writeText(r.code);
            toast(t('friendly.copied'), 'success');
          } catch {
            /* کلیپ‌بورد در دسترس نیست؛ کد روی صفحه قابل انتخاب است */
          }
        };
      },
    }),
    el('label', { text: t('friendly.joinLabel') }),
    el(
      'div',
      { class: 'join-row' },
      input,
      el('button', {
        class: 'btn secondary',
        type: 'button',
        text: t('friendly.join'),
        onClick: async () => {
          const code = input.value.trim().toUpperCase();
          if (code.length < 3) return toast(t('errors.room_not_found'), 'error');
          const r = await net.request('room:join', { code, deck: store.deck });
          if (!r.ok) return toast(errorText(r.code), 'error');
          $('#modal-root').replaceChildren();
        },
      }),
    ),
  );
  modal({ title: t('friendly.title'), body, actions: [{ label: t('cancel'), kind: 'ghost' }] });
}

// ───────────────────────── نتیجه ─────────────────────────

function showResult(res) {
  const title = $('#result-title');
  title.className = `result-title ${res.outcome}`;
  title.textContent = t(`result.${res.outcome}`);
  $('#result-reason').textContent = t(`result.reasons.${res.reason}`);
  const row = (k, v) => el('div', { class: 'stat-row' }, el('span', { class: 'stat-k', text: k }), el('span', { class: 'stat-v', text: v }));
  const m = Math.floor(res.time / 60);
  const s = Math.floor(res.time % 60);
  $('#result-stats').replaceChildren(
    row(t('result.duration'), `${n(m)}:${n(s, { minimumIntegerDigits: 2 })}`),
    row(t('result.towersDestroyed'), n(res.stats.towersDestroyed)),
    row(t('result.towersLost'), n(res.stats.towersLost)),
    row(t('result.cardsPlayed'), n(res.stats.cardsPlayed)),
    row(t('result.unitsSpawned'), n(res.stats.unitsSpawned)),
    row(t('result.elixirSpent'), n(res.stats.elixirSpent)),
  );
  // تاج‌های روشن = تعداد برج‌های نابودشده‌ی حریف (داده‌ی واقعی نبرد)
  [...$('#result-crowns').children].forEach((c, i) => c.classList.toggle('lit', i < Math.min(3, res.stats.towersDestroyed)));
  $('#result-again').hidden = res.mode === 'friendly';
  $('#result-again').onclick = () => (res.mode === 'practice' ? startPractice(state.difficulty) : startOnline());
  showScreen('result');
}

// ───────────────────────── تنظیمات ─────────────────────────

function openSettings() {
  const rows = [];
  if (musicInfo().available) {
    const label = () => (musicInfo().enabled ? t('sound.on') : t('sound.off'));
    const btn = el('button', { type: 'button', text: label() });
    btn.addEventListener('click', () => {
      toggleMusic();
      btn.textContent = label();
    });
    rows.push(el('div', { class: 'set-row' }, el('span', { text: t('settings.sound') }), btn));
  }
  const fx = el('input', { type: 'checkbox', id: 'opt-reduce-fx' });
  fx.checked = store.reduceFx;
  fx.addEventListener('change', () => {
    store.reduceFx = fx.checked;
    applyReduceFx(fx.checked);
  });
  rows.push(el('label', { class: 'set-row', for: 'opt-reduce-fx' }, el('span', { text: t('home.reduceFx') }), fx));
  modal({
    title: t('settings.title'),
    body: el('div', { class: 'set-list' }, rows),
    actions: [
      { label: t('settings.help'), kind: 'blue', onClick: () => (openHelp(), false) },
      { label: t('home.logoutYes'), kind: 'red', onClick: () => (logout(), false) },
      { label: t('settings.close'), kind: 'gold' },
    ],
  });
}

function openHelp() {
  modal({ title: t('help.title'), body: el('ul', {}, t('help.lines').map((line) => el('li', { text: line }))), actions: [{ label: t('ok'), kind: 'primary' }] });
}

async function logout() {
  const yes = await confirmDialog({ title: t('home.logoutConfirmTitle'), body: t('home.logoutConfirmBody'), yes: t('home.logoutYes'), no: t('cancel') });
  if (!yes) return;
  $('#modal-root').replaceChildren();
  net.disconnect();
  store.clearSession();
  state.player = null;
  showLogin();
}

// ───────────────────────── اتصال دکمه‌ها ─────────────────────────

function bindUi() {
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    login($('#login-name').value);
  });
  $('#btn-online').addEventListener('click', startOnline);
  $('#btn-friendly').addEventListener('click', openFriendlyModal);
  $('#btn-practice').addEventListener('click', openPracticeModal);
  const openDeck = () => {
    deckScreen.open();
    showScreen('deck');
  };
  $('#btn-deck').addEventListener('click', openDeck);
  $('#btn-deck-orb').addEventListener('click', openDeck);
  const deckBox = $('#home-deck');
  deckBox.addEventListener('click', openDeck);
  deckBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDeck();
    }
  });
  $('#btn-friends').addEventListener('click', openFriendlyModal);
  $('#btn-friends-quick').addEventListener('click', openFriendlyModal);
  $('#btn-menu').addEventListener('click', openSettings);
  $('#btn-profile').addEventListener('click', () =>
    modal({ title: state.player?.name ?? '', body: t('home.profileNote'), actions: [{ label: t('ok'), kind: 'primary' }] }),
  );
  // بخش‌هایی که هنوز پیاده‌سازی نشده‌اند (سکه، جواهر، لیگ، فروشگاه، رتبه‌بندی، صندوق، اخبار) صادقانه اعلام می‌شوند
  for (const node of document.querySelectorAll('[data-soon]')) {
    node.addEventListener('click', () => toast(t('home.soonToast'), 'info', 1600));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toast(t('home.soonToast'), 'info', 1600);
      }
    });
  }
  $('#battle-leave').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: t('battle.leaveConfirmTitle'),
      body: t('battle.leaveConfirmBody'),
      yes: t('battle.leaveYes'),
      no: t('battle.leaveNo'),
    });
    if (!yes || !state.inBattle) return;
    const r = await net.request('battle:leave');
    if (!r.ok) toast(errorText(r.code), 'error');
  });
  $('#result-home').addEventListener('click', goHome);
  window.addEventListener('resize', () => battle?.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => battle?.resize(), 200));
}

deckScreen = createDeckScreen({ onBack: goHome });
bindUi();
bindNet();
boot();
