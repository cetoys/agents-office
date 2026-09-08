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

export function initLive({ R, spawnEmote, feedPush }) {
  const bar = document.createElement('div');
  bar.id = 'livebar';
  bar.innerHTML = '<span class="lb-idle">ofis boşta</span>';
  document.body.appendChild(bar);

  const running = new Map(); // agentId -> { engine, kind, model, what, since, lastPulse }
  let stopped = false;

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
    if (!running.size) { bar.innerHTML = '<span class="lb-idle">ofis boşta</span>'; bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const now = Date.now();
    bar.innerHTML = [...running.entries()].map(([id, v]) => {
      const name = R[id]?.a?.name || id;
      return `<span class="lb-item" style="--t:${tintOf(v.engine)}">
        <i class="lb-dot"></i><b>${name}</b>
        <em>${v.engine}${v.model ? ' · ' + String(v.model).split('/').pop().slice(0, 22) : ''}</em>
        <span class="lb-what">${(v.what || '').slice(0, 46)}</span>
        <span class="lb-t">${secs(now - v.since)}</span></span>`;
    }).join('');
  }

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(API + '/live', { cache: 'no-store' });
      if (res.ok) {
        const { running: list = [] } = await res.json();
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
  };
}
