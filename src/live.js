// live.js — "şu an kim çalışıyor" katmanı.
// Sunucudaki /api/live'ı yoklar; koşan her ajanın masası yanar, adının yanında motoru yazar,
// üstteki şeritte kim-hangi-motorda-ne-yapıyor canlı listelenir. Ofisin sahte kıpırtısı değil,
// gerçek iş budur.
const API = '/api';
const POLL_MS = 1200;
const PULSE_MS = 3000;

// motor → renk. Bir bakışta "bu masa yerelde mi, Claude'da mı" ayrılsın.
const ENGINE_TINT = {
  claude:  '#C8763A',
  yerel:   '#3E8E6E',
  'yerel-hizli': '#3E8E6E',
  'yerel-buyuk': '#3E8E6E',
  openclaw: '#6B5BD2',
  cerebras: '#B03A5B',
};
const tintOf = e => ENGINE_TINT[e] || '#7A7A7A';
const secs = ms => (ms < 60000 ? Math.round(ms / 1000) + 's' : Math.floor(ms / 60000) + 'd ' + Math.round((ms % 60000) / 1000) + 's');

export function initLive({ R, spawnEmote, feedPush, AGENTS, real, onReal }) {
  const bar = document.createElement('div');
  bar.id = 'livebar';
  bar.innerHTML = '<span class="lb-idle">ofis boşta</span>';
  document.body.appendChild(bar);

  const running = new Map(); // agentId -> { engine, kind, model, what, since, lastPulse }
  let waiting = [];          // [{ id, agent, name, question, title }]
  let stopped = false;

  // soru soran ajana cevap yazma kutusu
  const ask = document.createElement('div');
  ask.id = 'askbox'; ask.style.display = 'none';
  ask.innerHTML = '<div class="ab-q"></div><input class="ab-in" placeholder="cevabını yaz…" /><button class="ab-go">Gönder</button><button class="ab-x">×</button>';
  document.body.appendChild(ask);
  let asking = null;
  const closeAsk = () => { ask.style.display = 'none'; asking = null; };
  ask.querySelector('.ab-x').onclick = closeAsk;
  ask.querySelector('.ab-go').onclick = send;
  ask.querySelector('.ab-in').addEventListener('keydown', e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') closeAsk(); });
  async function send() {
    const input = ask.querySelector('.ab-in');
    const answer = input.value.trim();
    if (!asking || !answer) return;
    const id = asking.id;
    input.value = ''; input.disabled = true;
    try {
      await fetch(`${API}/tasks/${id}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer }) });
      await fetch(`${API}/tasks/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    } catch {}
    input.disabled = false; closeAsk();
  }
  function openAsk(w) {
    asking = w;
    ask.querySelector('.ab-q').textContent = `${w.name}: ${w.question}`;
    ask.style.display = 'flex';
    ask.querySelector('.ab-in').focus();
  }

  function paintPill(id, on, engine) {
    const r = R[id]; if (!r || !r.pill) return;
    r.pill.classList.toggle('live', !!on);
    if (on) {
      r.pill.style.setProperty('--live-tint', tintOf(engine));
      if (!r.pill.querySelector('.eng')) {
        const s = document.createElement('span');
        s.className = 'eng';
        r.pill.appendChild(s);
      }
      r.pill.querySelector('.eng').textContent = engine;
    } else {
      r.pill.querySelector('.eng')?.remove();
      r.pill.style.removeProperty('--live-tint');
    }
  }

  function renderBar() {
    if (!running.size && !waiting.length) { bar.innerHTML = '<span class="lb-idle">ofis boşta</span>'; bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const now = Date.now();
    const asks = waiting.map(w =>
      `<span class="lb-ask" data-id="${w.id}">❓ <b>${w.name}</b> <span class="lb-what">${(w.question || '').slice(0, 60)}</span> <u>cevapla</u></span>`).join('');
    bar.innerHTML = asks + [...running.entries()].map(([id, v]) => {
      const name = R[id]?.a?.name || id;
      return `<span class="lb-item" style="--t:${tintOf(v.engine)}">
        <i class="lb-dot"></i><b>${name}</b>
        <em>${v.engine}${v.model ? ' · ' + String(v.model).split('/').pop().slice(0, 22) : ''}</em>
        <span class="lb-what">${(v.what || '').slice(0, 46)}</span>
        <span class="lb-t">${secs(now - v.since)}</span></span>`;
    }).join('');
    for (const el of bar.querySelectorAll('.lb-ask')) {
      el.onclick = () => { const w = waiting.find(x => x.id === el.dataset.id); if (w) openAsk(w); };
    }
  }

  // Gerçek sayılar: token defteri + bekleyen soru sayısı, departman bazında toplanır.
  const deptOf = id => (AGENTS || []).find(a => a.id === id)?.dept || null;
  let opsAt = 0;
  async function pollOps() {
    if (!real || Date.now() - opsAt < 15000) return;
    opsAt = Date.now();
    try {
      const r = await fetch(API + '/ops', { cache: 'no-store' });
      if (!r.ok) return;
      const { agents = [] } = await r.json();
      const tok = {}, usd = {};
      for (const a of agents) {
        const d = deptOf(a.id); if (!d) continue;
        tok[d] = (tok[d] || 0) + (a.tokens || 0);
        usd[d] = (usd[d] || 0) + (a.costUSD || 0);
      }
      Object.assign(real.tok, tok); Object.assign(real.usd, usd);
      try { const h = await (await fetch(API + '/health', { cache: 'no-store' })).json();
        if (Number.isFinite(h.notes)) real.notes = h.notes; } catch {}
      onReal?.();
    } catch {}
  }

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(API + '/live', { cache: 'no-store' });
      if (res.ok) {
        const { running: list = [], waiting: waits = [] } = await res.json();
        waiting = waits;
        if (real) { const ask = {};
          for (const w of waits) { const d = deptOf(w.agent); if (d) ask[d] = (ask[d] || 0) + 1; }
          for (const k of Object.keys(real.ask)) delete real.ask[k];
          Object.assign(real.ask, ask); onReal?.(); }
        for (const w of waits) { const rig = R[w.agent]; if (rig?.pill) { rig.pill.classList.add('asking'); } }
        for (const id of Object.keys(R)) if (!waits.some(w => w.agent === id)) R[id]?.pill?.classList.remove('asking');
        const seen = new Set();
        for (const r of list) {
          seen.add(r.agent);
          if (!running.has(r.agent)) {                       // yeni başladı
            running.set(r.agent, { ...r, lastPulse: 0 });
            paintPill(r.agent, true, r.engine);
            const rig = R[r.agent];
            if (rig) { spawnEmote(rig, '⚙️'); feedPush?.(rig, '⚙️', `${r.engine} üzerinde: ${r.what || 'çalışıyor'}`); }
          } else {
            Object.assign(running.get(r.agent), { what: r.what, engine: r.engine, model: r.model });
          }
        }
        for (const id of [...running.keys()]) if (!seen.has(id)) { // bitti
          running.delete(id);
          paintPill(id, false);
        }
      }
    } catch { /* sunucu yoksa demo modundayız, sessizce geç */ }
    renderBar();
    pollOps();
    setTimeout(poll, POLL_MS);
  }
  poll();

  // koşarken masanın üstünde nabız gibi ikon
  return {
    tick(now) {
      if (!running.size) return;
      for (const [id, v] of running) {
        if (now - v.lastPulse < PULSE_MS) continue;
        v.lastPulse = now;
        const rig = R[id]; if (rig) spawnEmote(rig, v.kind === 'ollama' ? '🖥️' : '✨');
      }
      renderBar();
    },
    stop() { stopped = true; },
    isBusy: id => running.has(id),
    waiting: () => waiting,
  };
}
