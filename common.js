// Giełda plotek: wspólny transport (MQTT przez publiczny broker albo lokalny tryb testowy)
const GP = (() => {
  const BROKERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081',
  ];
  const PREFIX = 'gielda-plotek-pwr/v2/';
  const params = new URLSearchParams(location.search);

  function brokerUrl(index) {
    if (params.get('broker')) return params.get('broker');
    return BROKERS[index] || BROKERS[0];
  }

  // Łączy się z brokerem; zwraca obiekt { publish, subscribe, url, index }.
  // tryAll = true: host próbuje kolejnych brokerów, gracz używa tego z linku.
  function connect({ index = 0, tryAll = false, onStatus = () => {} } = {}) {
    if (params.get('local') === '1') return Promise.resolve(localTransport());
    const order = tryAll && !params.get('broker') ? BROKERS.map((_, i) => i) : [index];
    return new Promise((resolve, reject) => {
      let k = 0;
      const attempt = () => {
        if (k >= order.length) { reject(new Error('Brak połączenia z serwerem gry')); return; }
        const i = order[k++];
        const url = brokerUrl(i);
        onStatus('Łączenie z ' + url.replace(/^wss?:\/\//, '').split('/')[0] + '…');
        const client = mqtt.connect(url, {
          clientId: 'gp_' + Math.random().toString(16).slice(2, 10),
          connectTimeout: 6000,
          reconnectPeriod: 2000,
          clean: true,
        });
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; client.end(true); attempt(); } }, 7000);
        client.on('connect', () => {
          onStatus('Połączono');
          if (done) return;
          done = true; clearTimeout(timer);
          const handlers = {};
          client.on('message', (topic, payload) => {
            const h = handlers[topic];
            if (!h) return;
            try { h(JSON.parse(payload.toString())); } catch (e) { /* ignoruj zły pakiet */ }
          });
          client.on('reconnect', () => onStatus('Ponowne łączenie…'));
          client.on('offline', () => onStatus('Brak sieci, próbuję ponownie…'));
          resolve({
            index: i,
            url,
            publish(topic, obj, retain = false) {
              client.publish(PREFIX + topic, JSON.stringify(obj), { qos: 1, retain });
            },
            subscribe(topic, fn) {
              handlers[PREFIX + topic] = fn;
              client.subscribe(PREFIX + topic, { qos: 1 });
            },
          });
        });
        client.on('error', () => { if (!done) { done = true; clearTimeout(timer); client.end(true); attempt(); } });
      };
      attempt();
    });
  }

  // Tryb testowy na jednym komputerze (kilka kart przeglądarki): ?local=1
  function localTransport() {
    const bc = new BroadcastChannel('gielda-plotek-local');
    const handlers = {};
    const retained = {};
    bc.onmessage = (e) => {
      const { topic, obj, retain } = e.data;
      if (retain) retained[topic] = obj;
      if (handlers[topic]) handlers[topic](obj);
      if (e.data.ask && retained[e.data.ask]) bc.postMessage({ topic: e.data.ask, obj: retained[e.data.ask], retain: true });
    };
    return {
      index: 0,
      url: 'local',
      publish(topic, obj, retain = false) {
        if (retain) retained[topic] = obj;
        bc.postMessage({ topic, obj, retain });
      },
      subscribe(topic, fn) {
        handlers[topic] = fn;
        bc.postMessage({ ask: topic });
      },
    };
  }

  function fmtMoney(v) {
    return Math.round(v).toLocaleString('pl-PL') + ' zł';
  }
  function fmtPrice(v) {
    return v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
  }
  function fmtPct(v) {
    const s = (v * 100).toLocaleString('pl-PL', { maximumFractionDigits: 0 });
    return (v > 0 ? '+' : '') + s + '%';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const VERDICTS = {
    prawda: { label: 'PRAWDA', cls: 'v-true' },
    fake: { label: 'FAKE NEWS', cls: 'v-fake' },
    scam: { label: 'PODSZYWANIE SIĘ', cls: 'v-fake' },
    reklama: { label: 'REKLAMA', cls: 'v-ad' },
    konflikt: { label: 'KONFLIKT INTERESÓW', cls: 'v-conflict' },
    plotka: { label: 'NIEPOTWIERDZONA PLOTKA', cls: 'v-rumor' },
    stary: { label: 'STARY NEWS', cls: 'v-old' },
  };
  const CHOICES = { buy: 'KUP', hold: 'TRZYMAJ', sell: 'SPRZEDAJ' };

  // Wskazówka po odkryciu: fragmenty w `...` pokazujemy czcionką o stałej szerokości (widać różnicę I / l).
  function clueHTML(s) {
    return esc(s || '').replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  // Pola karty, które gracze widzą przed odkryciem.
  const PUBLIC_FIELDS = ['flash', 'seconds', 'url', 'platform', 'name', 'handle', 'followers', 'verified', 'color', 'label', 'headline', 'author', 'time', 'body', 'quote', 'link'];

  const ICON_LOCK = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9zm-8 0V7a3 3 0 0 1 6 0v2z"/></svg>';
  const ICON_LINK = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
  const ICON_CHECK = '<svg class="post-check" viewBox="0 0 24 24" width="1em" height="1em"><circle cx="12" cy="12" r="11" fill="#1d9bf0"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Karta posta/artykułu, wspólna dla rzutnika i telefonu. marks: fragmenty do podświetlenia po odkryciu.
  function newsHTML(n, marks) {
    const e = esc;
    let h = '';
    const top = [];
    if (n.flash) top.push('<span class="post-flash">PILNE</span>');
    if (n.url) top.push(`<span class="post-url">${ICON_LOCK}<span>${e(n.url)}</span></span>`);
    else top.push(`<span class="post-platform">${e(n.platform || '')}</span>`);
    h += `<div class="post-top">${top.join('')}</div>`;
    if (n.name) {
      const initial = e((n.name.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]/g, '').charAt(0) || '?').toUpperCase());
      const sub = [n.handle, n.followers, n.author ? '' : n.time].filter(Boolean).map(e).join(' · ');
      h += `<div class="post-head"><div class="post-avatar" style="background:${e(n.color || '#161a20')}">${initial}</div><div><div class="post-name">${e(n.name)}${n.verified ? ICON_CHECK : ''}</div><div class="post-handle">${sub}</div></div></div>`;
    }
    if (n.label) h += `<div class="post-label">${e(n.label)}</div>`;
    h += `<div class="post-title">${e(n.headline)}</div>`;
    if (n.author) h += `<div class="post-byline">${e(n.author)} · ${e(n.time || '')}</div>`;
    if (n.body) h += `<div class="post-body">${e(n.body)}</div>`;
    if (n.quote) h += `<div class="post-quote"><div class="post-quote-src">${e(n.quote.src)}</div><div class="post-quote-title">${e(n.quote.title)}</div></div>`;
    if (n.link) h += `<div class="post-link">${ICON_LINK}<span>${e(n.link)}</span></div>`;
    for (const m of marks || []) {
      const em = e(m);
      h = h.split(em).join('<mark>' + em + '</mark>');
    }
    return h;
  }

  return { connect, params, fmtMoney, fmtPrice, fmtPct, esc, VERDICTS, CHOICES, PUBLIC_FIELDS, newsHTML, clueHTML };
})();
