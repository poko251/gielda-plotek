// Telefon gracza: dołącza do pokoju, pokazuje newsy i wysyła decyzje.
(() => {
  const $ = (id) => document.getElementById(id);
  let room = (GP.params.get('room') || '').toUpperCase();
  const brokerIndex = Number(GP.params.get('b') || 0);
  let T = null;
  let me = null; // { id, name }
  let state = null;
  let lastRound = -1;
  let picked = {}; // runda -> wybór
  let recvAt = 0;
  let joinTimer = null;

  function loadMe() {
    try { return JSON.parse(localStorage.getItem('gp-me-' + room)); } catch (e) { return null; }
  }
  function saveMe() { try { localStorage.setItem('gp-me-' + room, JSON.stringify(me)); } catch (e) { /* prywatny */ } }

  function show(id) {
    for (const v of ['v-join', 'v-wait', 'v-news', 'v-reveal', 'v-end']) $(v).classList.toggle('hidden', v !== id);
  }
  function mine() {
    return state && me ? state.players.find((p) => p.id === me.id) : null;
  }
  function renderWallet() {
    const p = mine();
    $('w-cash').textContent = p ? GP.fmtMoney(p.cash) : '–';
    $('w-tok').textContent = p ? p.tok.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) : '–';
    $('w-val').textContent = p ? GP.fmtMoney(p.value) : '–';
    $('price').textContent = state ? '1 MUALA = ' + GP.fmtPrice(state.price) : '';
  }
  function sourceOf(n) { return n.name || (n.url || n.platform || '').split('/')[0]; }
  function notify(n) {
    $('toast-title').textContent = (n.flash ? 'PILNE: ' : 'Nowa wiadomość: ') + sourceOf(n);
    $('toast-sub').textContent = n.headline.slice(0, 60) + (n.headline.length > 60 ? '…' : '');
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2600);
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }
  function markPicked() {
    const c = picked[state.round];
    document.querySelectorAll('.act').forEach((b) => b.classList.toggle('picked', b.dataset.c === c));
    $('act-note').textContent = c
      ? `Wybrano: ${GP.CHOICES[c]}. Możesz zmienić do końca czasu.`
      : 'Kup = cała gotówka w MUALA · Sprzedaj = wszystkie MUALA na gotówkę';
  }

  function render() {
    renderWallet();
    if (!me) { show('v-join'); return; }
    if (!state) { show('v-wait'); return; }
    const p = mine();
    if (!p) { show('v-wait'); $('hello').textContent = 'Dołączanie…'; return; }
    if (joinTimer) { clearInterval(joinTimer); joinTimer = null; }
    $('hello').textContent = 'Cześć, ' + p.name + '!';
    if (state.phase === 'lobby') { show('v-wait'); return; }
    if (state.phase === 'news') {
      show('v-news');
      $('round').textContent = `News ${state.round + 1} z ${state.total}` + (state.news.flash ? ` · PILNE: ${state.roundSeconds} s` : '');
      $('news').innerHTML = GP.newsHTML(state.news);
      if (state.round !== lastRound) { lastRound = state.round; notify(state.news); }
      markPicked();
      return;
    }
    if (state.phase === 'reveal') {
      show('v-reveal');
      $('toast').classList.remove('show');
      const v = GP.VERDICTS[state.news.verdict];
      $('round2').textContent = `News ${state.round + 1} z ${state.total} · cena ${GP.fmtPct(state.news.effect)} (teraz ${GP.fmtPrice(state.price)})`;
      $('verdict').className = 'verdict ' + v.cls;
      $('verdict').textContent = v.label;
      const d = p.delta || 0;
      $('delta').textContent = (d > 0 ? '+' : '') + GP.fmtMoney(d);
      $('delta').className = 'big-result ' + (d > 0.5 ? 'up' : d < -0.5 ? 'down' : '');
      const r = p.res || {};
      const sec = (t) => (t / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + ' s';
      const verb = { buy: 'Kupiłeś', sell: 'Sprzedałeś' };
      const ok = r.c && r.c === state.news.best;
      const pre = ok ? '<b class="up">Trafnie!</b> ' : '';
      $('my-res').innerHTML = r.traded
        ? `${pre}${verb[r.c]} po ${GP.fmtPrice(r.px)} (w ${sec(r.t)})`
        : r.c === 'buy' ? pre + 'Miałeś już wszystko w MUALA, więc nic nie dokupiłeś.'
        : r.c === 'sell' ? pre + 'Miałeś już wszystko w gotówce, więc nic nie sprzedałeś.'
        : r.c === 'hold' ? pre + 'Trzymałeś.' : 'Brak decyzji: trzymałeś.';
      lastRound = state.round;
      return;
    }
    if (state.phase === 'end') {
      show('v-end');
      $('place').textContent = p.place + '. z ' + state.players.length;
      $('end-msg').textContent = p.place === 1
        ? 'Wygrywasz! Zgłoś się po cukierka.'
        : `Wartość portfela: ${GP.fmtMoney(p.value)}. Na start było 1 000 zł.`;
    }
  }

  // pasek czasu
  setInterval(() => {
    if (!state || state.phase !== 'news') return;
    const left = Math.max(0, state.endsIn - (Date.now() - recvAt) / 1000);
    $('bar').style.width = (100 * left) / (state.roundSeconds || 15) + '%';
  }, 200);

  function sendJoin() { if (T && me) T.publish('room/' + room + '/in', { t: 'join', id: me.id, name: me.name }); }

  document.querySelectorAll('.act').forEach((b) => {
    b.onclick = () => {
      if (!state || state.phase !== 'news' || !me) return;
      const c = b.dataset.c;
      picked[state.round] = c;
      T.publish('room/' + room + '/in', { t: 'act', id: me.id, r: state.round, c });
      if (navigator.vibrate) navigator.vibrate(30);
      markPicked();
    };
  });

  $('btn-join').onclick = async () => {
    if (!room) room = $('room').value.trim().toUpperCase();
    const name = $('name').value.trim();
    if (!room || room.length < 4) { $('room').focus(); return; }
    if (!name) { $('name').focus(); return; }
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    me = { id: 'p' + Math.random().toString(36).slice(2, 10), name };
    saveMe();
    if (!T) await start();
    sendJoin();
    joinTimer = setInterval(() => (mine() ? null : sendJoin()), 2000);
    render();
  };

  async function start() {
    try {
      T = await GP.connect({ index: brokerIndex, onStatus: (s) => ($('conn').textContent = s) });
      T.subscribe('room/' + room + '/state', (st) => { state = st; recvAt = Date.now(); render(); });
    } catch (e) {
      $('conn').textContent = 'Nie można połączyć z grą. Sprawdź internet.';
    }
  }

  if (!room) $('room').classList.remove('hidden');
  me = room ? loadMe() : null;
  render();
  if (room) start().then(() => { if (me) { sendJoin(); render(); } });
})();
