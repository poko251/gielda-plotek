// Ekran prowadzącego: trzyma stan gry i rozsyła go do telefonów.
(() => {
  const START_CASH = 500, START_TOK = 5, START_PRICE = 100;
  const BASE_SECONDS = Number(GP.params.get('t')) || 15;
  const SLIP = 0.7; // jaką część ruchu ceny rynek „zje” do końca czasu na decyzję
  const FEE = 0.02; // prowizja giełdy od transakcji
  const secondsFor = (n) => (n && n.flash ? n.seconds || 8 : BASE_SECONDS);
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const STORE = 'gp-host-v2';
  const $ = (id) => document.getElementById(id);

  let S = load() || fresh();
  let T = null; // transport
  let tick = null;

  function fresh(room) {
    return {
      room: room || Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''),
      broker: 0,
      phase: 'lobby',
      round: -1,
      price: START_PRICE,
      history: [START_PRICE],
      players: {},
      choices: {},
      times: {},
      roundStart: 0,
      deadline: 0,
      stats: null,
      deltas: {},
      results: {},
      outcome: null,
    };
  }
  // Zapisany stan przetrwa odświeżenie strony, ale po 3 godzinach gra startuje od nowa.
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      return s && Date.now() - (s.savedAt || 0) < 3 * 3600 * 1000 ? s : null;
    } catch (e) { return null; }
  }
  function save() { try { S.savedAt = Date.now(); localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* tryb prywatny */ } }

  const value = (p) => p.cash + p.tok * S.price;
  function ranking() {
    return Object.entries(S.players)
      .map(([id, p]) => ({ id, name: p.name, cash: p.cash, tok: p.tok, value: value(p), delta: S.deltas[id] || 0, res: S.results[id] || null }))
      .sort((a, b) => b.value - a.value);
  }
  function publicNews(i, withTruth) {
    const n = NEWS[i];
    if (!n) return null;
    const o = {};
    for (const k of GP.PUBLIC_FIELDS) if (n[k] !== undefined) o[k] = n[k];
    if (withTruth && S.outcome) Object.assign(o, { verdict: n.verdict, marks: n.marks || [], clue: n.clue, lesson: n.lesson }, S.outcome);
    return o;
  }
  function publish() {
    save();
    render();
    if (!T) return;
    const rank = ranking();
    T.publish('room/' + S.room + '/state', {
      phase: S.phase,
      round: S.round,
      total: NEWS.length,
      price: S.price,
      endsIn: S.phase === 'news' ? Math.max(0, (S.deadline - Date.now()) / 1000) : 0,
      roundSeconds: secondsFor(NEWS[S.round]),
      news: S.phase === 'news' || S.phase === 'reveal' ? publicNews(S.round, S.phase === 'reveal') : null,
      stats: S.phase === 'reveal' ? S.stats : null,
      players: rank.map((r, i) => ({ id: r.id, name: r.name, cash: r.cash, tok: r.tok, value: r.value, delta: r.delta, place: i + 1, res: S.phase === 'reveal' ? r.res : null })),
    }, true);
  }

  // ---------- logika gry ----------
  function onInput(msg) {
    if (!msg || !msg.id) return;
    if (msg.t === 'join') {
      const name = String(msg.name || 'Gracz').trim().slice(0, 16) || 'Gracz';
      if (!S.players[msg.id]) S.players[msg.id] = { name, cash: START_CASH, tok: START_TOK };
      else S.players[msg.id].name = name;
      publish();
    } else if (msg.t === 'act') {
      if (S.phase !== 'news' || msg.r !== S.round || !S.players[msg.id]) return;
      if (!['buy', 'hold', 'sell'].includes(msg.c)) return;
      S.choices[msg.id] = msg.c;
      S.times[msg.id] = Date.now() - S.roundStart; // liczy się ostatnie kliknięcie
      publish();
    }
  }

  function startRound(i) {
    S.round = i;
    S.phase = 'news';
    S.choices = {};
    S.times = {};
    S.results = {};
    S.outcome = null;
    S.stats = null;
    S.roundStart = Date.now();
    S.deadline = S.roundStart + secondsFor(NEWS[i]) * 1000;
    publish();
    startTick();
  }
  function startTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (S.phase !== 'news') { clearInterval(tick); return; }
      renderTimer();
      if (Date.now() >= S.deadline) { clearInterval(tick); reveal(); }
    }, 250);
  }
  // Rynek reaguje na news od pierwszej sekundy: transakcja zawarta w chwili t idzie po cenie
  // p0 + (p1 - p0) * SLIP * t/czas. Kto trafnie zareaguje szybciej, dostaje lepszą cenę.
  // Od każdej transakcji giełda pobiera prowizję FEE, więc klikanie na ślepo kosztuje.
  function reveal() {
    if (S.phase !== 'news') return;
    const n = NEWS[S.round];
    const o = n.outcomes ? n.outcomes[Math.floor(Math.random() * n.outcomes.length)] : n; // plotka: los
    S.outcome = { effect: o.effect, best: o.best, result: o.result || '' };
    const secs = secondsFor(n);
    const p0 = S.price;
    const p1 = Math.max(1, p0 * (1 + o.effect));
    const counts = { buy: 0, hold: 0, sell: 0 };
    S.deltas = {};
    S.results = {};
    let fastest = null;
    for (const [id, p] of Object.entries(S.players)) {
      const before = p.cash + p.tok * p0;
      const c = S.choices[id] || 'hold';
      counts[c]++;
      const t = S.times[id];
      const frac = t === undefined ? 1 : Math.min(1, Math.max(0, t / (secs * 1000)));
      const px = p0 + (p1 - p0) * SLIP * frac;
      let traded = false;
      if (c === 'buy' && p.cash > 0) { p.tok += (p.cash * (1 - FEE)) / px; p.cash = 0; traded = true; }
      if (c === 'sell' && p.tok > 0) { p.cash += p.tok * px * (1 - FEE); p.tok = 0; traded = true; }
      if (traded && c === o.best && (!fastest || t < fastest.t)) fastest = { name: p.name, t, px };
      S.results[id] = { c: S.choices[id] || null, t: S.choices[id] ? t : null, px: traded ? px : null, traded };
      S.deltas[id] = p.cash + p.tok * p1 - before;
    }
    S.price = p1;
    S.history.push(S.price);
    const total = Object.keys(S.players).length || 1;
    S.stats = { counts, total, answered: Object.keys(S.choices).length, effect: o.effect, best: o.best, fastest };
    S.phase = 'reveal';
    publish();
  }
  function next() {
    if (S.phase === 'lobby') return startRound(0);
    if (S.phase === 'news') return reveal();
    if (S.phase === 'reveal') {
      if (S.round + 1 < NEWS.length) return startRound(S.round + 1);
      S.phase = 'end';
      return publish();
    }
  }
  function endGame() {
    if (S.phase === 'news') reveal();
    S.phase = 'end';
    publish();
  }
  function newGame() {
    if (!confirm('Zacząć nową grę? Obecni gracze i wyniki znikną.')) return;
    const b = S.broker;
    S = fresh();
    S.broker = b;
    connectAndPublish();
  }

  // ---------- widok ----------
  function show(id) {
    for (const v of ['view-lobby', 'view-game', 'view-end']) $(v).classList.toggle('hidden', v !== id);
  }
  function joinUrl() {
    const u = new URL('index.html', location.href);
    u.search = '';
    u.searchParams.set('room', S.room);
    u.searchParams.set('b', String(S.broker));
    for (const k of ['local', 'broker']) if (GP.params.get(k)) u.searchParams.set(k, GP.params.get(k));
    return u.toString();
  }
  function renderQR() {
    const url = joinUrl();
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
    $('join-url').textContent = url.replace(/^https?:\/\//, '');
    $('room-code').textContent = S.room;
  }
  function renderTimer() {
    const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
    $('big-timer').textContent = left + ' s';
  }
  function drawChart() {
    const c = $('chart');
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const pts = S.history;
    const max = Math.max(...pts) * 1.1, min = Math.min(...pts) * 0.85;
    const pad = 28;
    const X = (i) => pad + (i / Math.max(1, NEWS.length)) * (w - pad * 2);
    const Y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    g.strokeStyle = '#2b333e'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, Y(START_PRICE)); g.lineTo(w - pad, Y(START_PRICE)); g.stroke();
    g.fillStyle = '#a3abb6'; g.font = '13px sans-serif';
    g.fillText('start 100 zł', pad + 4, Y(START_PRICE) - 6);
    g.strokeStyle = pts.at(-1) >= START_PRICE ? '#2fbf71' : '#ff6b57';
    g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.beginPath(); g.arc(X(pts.length - 1), Y(pts.at(-1)), 7, 0, Math.PI * 2); g.fill();
  }
  function render() {
    $('room-tag').textContent = 'Pokój ' + S.room;
    if (S.phase === 'lobby') {
      show('view-lobby');
      renderQR();
      const names = Object.values(S.players).map((p) => `<span>${GP.esc(p.name)}</span>`).join('');
      $('names').innerHTML = names || '<span class="muted">Czekamy na pierwszych graczy…</span>';
      $('count').textContent = Object.keys(S.players).length;
      return;
    }
    if (S.phase === 'end') {
      show('view-end');
      const r = ranking();
      const step = (p, k) => (p ? `<div class="step p${k}"><div class="place">${k}</div><div class="who">${GP.esc(p.name)}</div><div class="val">${GP.fmtMoney(p.value)}</div></div>` : '');
      $('podium').innerHTML = step(r[1], 2) + step(r[0], 1) + step(r[2], 3);
      $('winner').textContent = r[0] ? `${r[0].name} wygrywa i dostaje cukierka!` : 'Brak graczy';
      $('rest').innerHTML = r.slice(3, 10).map((p, i) => `<li><span><b>${i + 4}.</b>${GP.esc(p.name)}</span><span>${GP.fmtMoney(p.value)}</span></li>`).join('');
      return;
    }
    show('view-game');
    const n = NEWS[S.round];
    const isReveal = S.phase === 'reveal';
    $('round-tag').textContent = `News ${S.round + 1} z ${NEWS.length}` + (n.flash ? ` · PILNE: tylko ${secondsFor(n)} s` : '');
    $('news').innerHTML = GP.newsHTML(n, isReveal ? n.marks : []);
    $('price-now').textContent = GP.fmtPrice(S.price);
    $('reveal-box').classList.toggle('hidden', !isReveal);
    $('news-box-extra').classList.toggle('hidden', isReveal);
    $('stats-wrap').classList.toggle('hidden', !isReveal);
    $('timer-wrap').classList.toggle('hidden', isReveal);
    $('btn-next').textContent = isReveal ? (S.round + 1 < NEWS.length ? 'Następny news →' : 'Wyniki →') : 'Odkryj teraz →';
    if (isReveal) {
      const v = GP.VERDICTS[n.verdict];
      $('verdict').className = 'verdict ' + v.cls;
      $('verdict').textContent = v.label;
      const o = S.outcome || n;
      $('clue').innerHTML = GP.clueHTML(n.clue);
      $('lesson').textContent = (o.result ? o.result + ' ' : '') + n.lesson;
      const chg = $('price-chg');
      chg.textContent = GP.fmtPct(o.effect);
      chg.className = 'price-chg ' + (o.effect > 0 ? 'up' : o.effect < 0 ? 'down' : '');
      const st = S.stats, tot = Math.max(1, st.total);
      $('best').innerHTML = `Trafna decyzja: <b>${GP.CHOICES[st.best]}</b>` +
        (st.fastest ? ` · najlepsza cena: <b>${GP.esc(st.fastest.name)}</b> (${GP.fmtPrice(st.fastest.px)} w ${(st.fastest.t / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} s)` : '');
      const bar = (label, k, color) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${(100 * st.counts[k]) / tot}%;background:${color}"></div></div><span>${Math.round((100 * st.counts[k]) / tot)}%</span></div>`;
      $('stats').innerHTML = bar('Kupiło', 'buy', '#2fbf71') + bar('Trzymało', 'hold', '#7d8591') + bar('Sprzedało', 'sell', '#ff6b57');
      $('board').innerHTML = ranking().slice(0, 5).map((p, i) => `<li><span><b>${i + 1}.</b>${GP.esc(p.name)}</span><span>${p.delta ? `<small class="${p.delta > 0 ? 'up' : 'down'}">${p.delta > 0 ? '+' : ''}${GP.fmtMoney(p.delta)}</small> ` : ''}${GP.fmtMoney(p.value)}</span></li>`).join('');
    } else {
      $('price-chg').textContent = '';
      renderTimer();
      const total = Object.keys(S.players).length;
      $('answered').textContent = `${Object.keys(S.choices).length} z ${total} graczy zdecydowało`;
    }
    drawChart();
  }

  // ---------- połączenie ----------
  async function connectAndPublish() {
    render();
    try {
      T = await GP.connect({ index: S.broker, tryAll: true, onStatus: (s) => ($('conn').textContent = s) });
      if (T.index !== S.broker) S.broker = T.index;
      T.subscribe('room/' + S.room + '/in', onInput);
      publish();
      if (S.phase === 'news') startTick();
    } catch (e) {
      $('conn').textContent = e.message + '. Sprawdź internet i odśwież stronę.';
    }
  }

  $('btn-start').onclick = () => startRound(0);
  $('btn-next').onclick = next;
  $('btn-end').onclick = endGame;
  $('btn-new').onclick = newGame;
  $('btn-new2').onclick = newGame;
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
  });
  window.addEventListener('resize', () => S.phase !== 'lobby' && S.phase !== 'end' && drawChart());
  connectAndPublish();
})();
