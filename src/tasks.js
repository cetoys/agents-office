// Agents Office V3 — the work layer.
// V3.3 (AJ, 6 Sep 2026): a PERMANENT Task Status panel on the right — a one-line command bar
// (department dropdown + input, the office names the agent as you type) over a live feed of
// every task, newest change first, with status chips as filters. The flying tickets are gone:
// new work and handoffs simply appear in the feed (and a 📋 pops over the desk). Each status
// carries its own honest meta — backlog: how long it has waited · in progress: a real progress
// bar · waiting: minutes waiting for AJ's tick · done: the time it finished. Company-wide
// Kanban still lives on B. DOING / NEXT / DONE rows stay on every pod card.
// Session-only theatre — nothing persists (AJ's call: gauge interest first).
import { DEPTS, AGENTS, DEPT_KEYS } from './data.js';
// (v1data bağı, SEGMENTS ve sahte görev havuzu POOL söküldü — gerçek-veri kuralı)

// keywords that route a typed task to the right agent inside the chosen department
const KEYS = {
  elead: ['summary', 'template', 'escalate', 'inbox'], cmail: ['client', 'customer', 'reply', 'scope', 'kickoff'],
  imail: ['team', 'internal', 'staff', 'calendar', 'thread'], vmail: ['vendor', 'supplier', 'sla', 'renewal', 'quote'],
  kmail: ['contractor', 'freelance', 'designer', 'developer', 'copywriter'],
  lexi: ['pipeline', 'call list', 'rep', 'review', 'deal'], enzo: ['enrich', 'signup', 'verify', 'data'],
  ilm: ['inbound', 'qualify', 'route', 'website lead', 'discovery'], pros: ['prospect', 'list', 'mine', 'find', 'companies', 'icp'],
  piper: ['proposal', 'pricing', 'seat', 'quote'], folo: ['follow', 'chase', 'nudge', 'demo'],
  mlead: ['content plan', 'calendar', 'budget', 'marketing summary', 'line-up'], riley: ['research', 'scan', 'trend', 'stat', 'source'], newt: ['newsletter', 'issue', 'subscriber', 'welcome'],
  gfx: ['design', 'graphic', 'thumbnail', 'image', 'creative', 'banner', 'card', 'cover'], ada: ['ad', 'ads', 'meta', 'campaign', 'spend', 'budget', 'variant'],
  iggy: ['instagram', 'post', 'hook', 'dm', 'story', 'carousel', 'schedule'], vid: ['video', 'reel', 'cut', 'render', 'edit', 'caption', 'clip', 'footage', 'teaser'],
  olead: ['renewal', 'escalate', 'board pack', 'operations summary', 'checklist'], scout: ['intel', 'competitor', 'rival', 'market', 'memo'], legal: ['contract', 'msa', 'terms', 'legal', 'clause', 'agreement'],
  comply: ['compliance', 'regulation', 'consent', 'privacy', 'retention', 'cookie'], report: ['report', 'kpi', 'board pack', 'roll-up', 'summary'],
  dash: ['dashboard', 'chart', 'tile', 'metric', 'view'],
  alead: ['cash', 'vendor', 'forecast', 'month-end', 'approve'], invo: ['invoice', 'overdue', 'credit note'],
  apay: ['bill', 'pay', 'payable', 'charge', 'contractor', 'subscription'], recon: ['reconcile', 'bank', 'stripe', 'match', 'statement'],
  dlead: ['risk', 'timeline', 'handover', 'staff', 'summary'], pco: ['plan', 'milestone', 'schedule', 'sign-off', 'hours'],
  qa: ['qa', 'test', 'check', 'proof', 'bug', 'regression'], crep: ['report', 'status', 'results', 'monthly'],
  cass: ['asset', 'file', 'portal', 'library', 'export', 'logo'], dasst: ['design', 'mock', 'template', 'banner', 'brand sheet', 'resize'],
  ona: ['onboard', 'kickoff', 'checklist', 'welcome'],
};

// (sahte devir zincirleri CHAINS, fill(), vars() söküldü)
function timeStr(ts) {
  return new Date(ts).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}
function span(ms) { // "4 min" · "1 h 12 m" · "3 h"
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} m` : `${h} h`;
}
const agentOf = id => AGENTS.find(a => a.id === id);
const STATE_LABEL = { next: 'Backlog', doing: 'In progress', waiting: 'Waiting', done: 'Done' };

export function initTasks(ctx) {
  const { R, deptRT, spawnEmote, chatPush, chatHist, feedPush, zoomToApproval, enterFocus, openAgent,
          getFocused, esc, brainWrite, brain, onLive, onTools } = ctx;
  // LIVE mode (served by serve.mjs): the bar routes through Claude, agents produce real
  // deliverables saved as notes in the brain, and tasks persist. Opened as a file it stays demo.
  let live = false;
  const API = '/api';
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

  const tasks = [];
  let seq = 1;
  const doneCount = Object.fromEntries(DEPT_KEYS.map(k => [k, 0]));
  const board = { open: false };
  let dirty = false, lastBadge = 0, lastBar = 0, lastAgo = 0;

  /* ---------- model ---------- */
  function mk(o) {
    const a = agentOf(o.agent);
    const now = Date.now();
    const t = { id: seq++, dept: a.dept, state: 'next', progress: 0, addedAt: now, changedAt: now, ...o };
    tasks.push(t);
    return t;
  }
  const touch = (t, ev) => { t.changedAt = Date.now(); t.last = ev; dirty = true; };
  const agentTasks = (id, st) => tasks.filter(t => t.agent === id && t.state === st);
  const deptTasks = (k, st) => tasks.filter(t => t.dept === k && t.state === st);
  function visibleTitles(id) { return new Set(tasks.filter(t => t.agent === id && t.state !== 'done').map(t => t.title)); }
  // (pick / freshTask söküldü — görev üretilmez, yalnızca senin verdiğin iş vardır)
  function start(t, now) {
    t.state = 'doing'; t.startedAt = now; t.progress = 0; t.running = false; t.ready = false;
    t.pausedAt = null;
    touch(t, 'started');
  }
  function prune(k) {
    const done = tasks.filter(t => t.dept === k && t.state === 'done' && !t.live).sort((a, b) => b.doneAt - a.doneAt);
    for (const t of done.slice(14)) tasks.splice(tasks.indexOf(t), 1);
  }
  function complete(t) {
    t.state = 'done'; t.doneAt = Date.now(); t.progress = 1;
    doneCount[t.dept]++;
    const r = R[t.agent];
    spawnEmote(r, '✓');
    feedPush(r, '✓', 'Done: ' + t.title);
    if (chatHist[t.agent]) chatPush(t.agent, { who: 'work', i: '✓', text: 'done — ' + t.title });
    if (t.live) deliver(t); // gerçek çıktı ajanın sohbetine düşer; notu sunucu zaten yazdı
    // (sahte beyin yazımı söküldü — beyne yalnızca gerçek bir koşunun çıktısı yazılır)
    touch(t, 'done');
    if (t.chain && t.chainI < t.chain.length - 1) { // hand the work to the next desk — it appears in their backlog
      const [nid, ntitle] = t.chain[t.chainI + 1];
      const nt = mk({ agent: nid, title: ntitle, chain: t.chain, chainI: t.chainI + 1, from: t.agent });
      touch(nt, 'handoff');
      spawnEmote(R[nid], '📋');
    }
    prune(t.dept);
  }
  function deliver(t) {
    const a = agentOf(t.agent);
    chatPush(t.agent, { who: 'file', icon: t.error ? '⚠' : '📄', name: (t.note || slug(t.title)) + '.md',
      meta: `${t.error ? 'could not complete' : 'delivered · saved to your brain'} · ${timeStr(t.doneAt)} · click to view`, content: t.result });
    if (!t.error) chatPush(t.agent, { who: 'agent', text: `Done — "${t.title}" is ready above${t.read && t.read.length ? ` (I read ${t.read.slice(0, 3).join(', ')})` : ''}${t.used && t.used.length ? `. Used ${t.used.join(', ')}` : ''}. Say "revise: …" and I'll change it.` });
    feedPush(R[t.agent], '📄', `Delivered: ${t.title}`);
    if (brain && t.read) for (const n of t.read.slice(0, 2)) brain.readNote(t.agent, n);
  }
  // (brainSend söküldü — Beyin kendiliğinden ajana iş atmaz)

  /* ---------- açılış: BOŞ ----------
     Depo burada her ajana sahte görev dağıtıp "inandırıcı bir sabah" kuruyordu. Söküldü.
     Ofis boş başlar; ne görürsen gerçekten senin verdiğin iştir. */
  for (const k of DEPT_KEYS) doneCount[k] = 0;

  /* ---------- badge rows (far-zoom layer): DOING · NEXT · DONE per pod ---------- */
  function rowHTML(k) {
    return `<div class="b-tasks" data-tkrow="${k}" title="show ${DEPTS[k].short} in the task panel">
      <span>DOING<b data-tk="${k}-doing">${deptTasks(k, 'doing').length}</b></span>
      <span>NEXT<b data-tk="${k}-next">${deptTasks(k, 'next').length}</b></span>
      <span>DONE<b data-tk="${k}-done">${doneCount[k]}</b></span></div>`;
  }
  for (const k of DEPT_KEYS) deptRT[k].apprRow.insertAdjacentHTML('beforebegin', rowHTML(k));
  function syncBadges() {
    for (const k of DEPT_KEYS) {
      const vals = { doing: deptTasks(k, 'doing').length, next: deptTasks(k, 'next').length, done: doneCount[k] };
      for (const [s, n] of Object.entries(vals)) {
        document.querySelectorAll(`[data-tk="${k}-${s}"]`).forEach(b => {
          if (b.textContent !== String(n)) {
            b.textContent = n;
            b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
          }
        });
      }
    }
  }

  /* ---------- the TASK STATUS panel (always on, right side) ---------- */
  const panel = document.getElementById('tpanel');
  const P_ = {
    dd: panel.querySelector('.tp-dd'), ddName: panel.querySelector('.tp-dd .tp-ddn'), ddDot: panel.querySelector('.tp-dd .dot'),
    menu: panel.querySelector('.tp-menu'), input: panel.querySelector('.tp-in'), add: panel.querySelector('.tp-add'),
    hint: panel.querySelector('.tp-hint'), chips: panel.querySelector('.tp-chips'), rows: panel.querySelector('.tp-rows'),
    scope: panel.querySelector('.tp-scope'),
  };
  let dept = 'marketing', filter = 'all';
  P_.menu.innerHTML = DEPT_KEYS.map(k => `<button data-k="${k}"><span class="dot" style="background:${DEPTS[k].chip}"></span>${DEPTS[k].name}</button>`).join('');
  P_.menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setDept(b.dataset.k); P_.menu.classList.remove('on'); P_.input.focus(); }));
  P_.dd.addEventListener('click', (e) => { e.stopPropagation(); P_.menu.classList.toggle('on'); });
  document.addEventListener('click', () => P_.menu.classList.remove('on'));
  function setDept(k) {
    dept = k;
    P_.ddName.textContent = DEPTS[k].short;
    P_.ddDot.style.background = DEPTS[k].chip;
    P_.input.placeholder = `Type a task for ${DEPTS[k].name.toLowerCase()}…`;
    updateHint();
  }
  // routing: keywords → the right agent in the chosen dept; fallback = the dept lead (or first agent)
  function route(k, title) {
    const low = title.toLowerCase();
    const pool = AGENTS.filter(x => x.dept === k);
    let best = pool.find(x => x.lead) || pool[0], bestN = 0;
    for (const a of pool) {
      const n = (KEYS[a.id] || []).filter(w => low.includes(w)).length;
      if (n > bestN) { bestN = n; best = a; }
    }
    return { agent: best, matched: bestN > 0 };
  }
  function updateHint() {
    const text = P_.input.value.trim();
    if (!text) { P_.hint.innerHTML = ''; P_.hint.classList.remove('on'); return; }
    const { agent: a, matched } = route(dept, text);
    const busy = agentTasks(a.id, 'doing').length > 0 || R[a.id].state === 'stuck';
    const chip = DEPTS[a.dept].chip;
    P_.hint.innerHTML = `<span class="tp-av" style="border-color:${chip};background:${chip}55">${a.name[0]}</span>` +
      (live ? `Probably <b>${a.name}</b> · Claude confirms when you press Add`
            : `Goes to <b>${a.name}</b> · ${busy ? 'starts after their current job' : 'starts straight away'}${matched ? '' : ' · say more and I’ll pick a specialist'}`);
    P_.hint.className = 'tp-hint on';
  }
  P_.input.addEventListener('input', updateHint);
  P_.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); if (e.key === 'Escape') P_.input.blur(); });
  P_.add.addEventListener('click', submit);
  function say(html, cls) { P_.hint.innerHTML = html; P_.hint.className = 'tp-hint on' + (cls ? ' ' + cls : ''); }
  async function submit() {
    let title = P_.input.value.trim().replace(/[.!]+$/, '');
    if (!title) return;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (live) {
      const text = title, k = dept;
      P_.input.value = ''; P_.input.disabled = true; P_.add.disabled = true;
      say(`Routing through Claude — ${DEPTS[k].name.toLowerCase()} is reading it…`, 'busy');
      try {
        const r = await fetch(API + '/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dept: k, text }) });
        if (!r.ok) throw new Error((await r.json()).error || r.statusText);
        const st = await r.json();
        const t = mk({ agent: st.agent, title: st.title, text: st.text, plan: st.plan, why: st.why, by: 'you', live: true, sid: st.id });
        touch(t, 'added'); spawnEmote(R[t.agent], '📋');
        say(`Added — <b>${agentOf(t.agent).name}</b> has it${st.why ? ' · ' + esc(st.why) : ''}`);
        setTimeout(() => { if (!P_.input.value) P_.hint.classList.remove('on'); }, 7000);
      } catch (e) {
        // GERÇEK-VERİ KURALI: iş alınamadıysa panoya sahte bir görev EKLENMEZ.
        say(`Alınamadı: ${esc(e.message)} — görev kaydedilmedi.`, 'err');
        P_.input.value = text;
      }
      P_.input.disabled = false; P_.add.disabled = false; P_.input.blur(); // hand the keys back to the office
      return;
    }
    // Sunucu bağlı değil: simülasyon YOK. Ofis kapalıysa iş verilemez.
    say(`Ofis bağlı değil — sunucu kapalı. <b>OFISI-AC.bat</b> ile aç, sonra tekrar dene.`, 'err');
  }
  // LIVE: the agent picks the task up → Claude does it on the server → the result lands in the chat
  async function runLive(t, feedback) {
    t.running = true; t.ready = false;
    try {
      const r = await fetch(`${API}/tasks/${t.sid}/${feedback ? 'revise' : 'run'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(feedback ? { feedback } : {}) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      const st = await r.json();
      t.result = st.result; t.error = !!st.error; t.read = st.read || []; t.note = st.note; t.tools = st.tools || []; t.used = st.used || [];
      if (t.tools.length && onTools) onTools(t.agent, t.tools); // the connectors the agent really pulled on light up
      if (brain && !t.error) fetch(API + '/brain').then(r => r.json()).then(g => brain.setGraph(g)).catch(() => {}); // the new note joins the graph
    } catch (e) { t.result = 'Could not complete this task: ' + e.message; t.error = true; }
    t.ready = true;
  }
  function revise(agentId, feedback) { // "revise: …" in chat re-runs that agent's last live deliverable
    const t = [...tasks].reverse().find(x => x.live && x.agent === agentId && x.state === 'done' && !x.error);
    if (!t) return false;
    t.state = 'doing'; t.startedAt = performance.now(); t.progress = 0; t.pausedAt = null; touch(t, 'started');
    runLive(t, feedback);
    return true;
  }
  async function connect() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const h = await (await fetch(API + '/health')).json();
      if (!h.ok) return;
      live = true;
      const mode = panel.querySelector('.tp-mode');
      if (mode) { mode.hidden = false; mode.textContent = 'LIVE · ' + (h.backend === 'anthropic-sdk' ? 'CLAUDE API' : 'CLAUDE'); mode.classList.add('live'); mode.title = `${h.name} · ${h.backend} · ${h.model} · brain: ${h.brain}`; }
      if (brain) { try { brain.setGraph(await (await fetch(API + '/brain')).json()); } catch {} }
      const list = await (await fetch(API + '/tasks')).json();
      for (const st of list) {
        if (!agentOf(st.agent)) continue;
        if (st.state === 'done') {
          const t = mk({ agent: st.agent, title: st.title, text: st.text, plan: st.plan, by: 'you', live: true, sid: st.id, state: 'done',
            doneAt: st.doneAt, changedAt: st.doneAt, addedAt: st.addedAt, result: st.result, read: st.read, note: st.note, tools: st.tools || [], used: st.used || [], error: !!st.error, last: 'done' });
          deliver(t);
        } else { // waiting, or a run that was in flight when the page closed — pick it up again
          mk({ agent: st.agent, title: st.title, text: st.text, plan: st.plan, by: 'you', live: true, sid: st.id, addedAt: st.addedAt, changedAt: st.addedAt, last: 'added' });
        }
      }
      dirty = true;
      if (onLive) onLive(h);
    } catch (e) { console.warn('office server not reachable — running offline:', e.message); }
  }
  connect();
  function addTask(agentId, title, by = 'you') {
    if (agentTasks(agentId, 'next').length >= 5) return null;
    const t = mk({ agent: agentId, title, by });
    touch(t, 'added');
    spawnEmote(R[agentId], '📋');
    return t;
  }
  // chips: filters with live counts
  const CHIPS = [['all', 'All'], ['next', 'Backlog'], ['doing', 'In progress'], ['waiting', 'Waiting'], ['done', 'Done']];
  function chipsHTML() {
    const scope = scoped();
    const cnt = st => st === 'all' ? scope.length : scope.filter(t => t.state === st).length;
    return CHIPS.map(([st, lab]) => `<button class="tp-chip${filter === st ? ' on' : ''}${st === 'waiting' ? ' w' : ''}" data-f="${st}">${lab}<b>${cnt(st)}</b></button>`).join('');
  }
  P_.chips.addEventListener('click', (e) => { const b = e.target.closest('.tp-chip'); if (!b) return; filter = b.dataset.f; render(true); });
  function scoped() {
    const f = getFocused();
    return (f && f !== 'brain') ? tasks.filter(t => t.dept === f) : tasks;
  }
  function metaFor(t) {
    const a = agentOf(t.agent), now = Date.now();
    const f = getFocused();
    const who = (f && f !== 'brain') ? a.name : `${a.name} · ${DEPTS[t.dept].short}`;
    switch (t.state) {
      case 'next': {
        const src = t.by === 'you' ? (t.live ? 'added by you · live' : 'added by you') : t.last === 'handoff' && t.from ? `from ${agentOf(t.from).name}` : t.revised ? 'sent back to revise' : 'from the Brain';
        const w = now - t.addedAt;
        return `${who} · ${w < 60000 ? 'just added' : 'waiting ' + span(w)} · ${src}`;
      }
      case 'doing': return `${who}${t.live ? ' · working with Claude' : t.agent === 'vid' ? ' · rendering' : ''}`;
      case 'waiting': return `<span class="tp-amber">waiting ${span(now - t.changedAt)} for your tick</span> · ${who}`;
      case 'done': return `${who} · done ${timeStr(t.doneAt)}${t.approved ? ' · approved' : ''}${t.live ? (t.error ? ' · <span class="tp-amber">failed</span>' : ' · <span class="tp-res">result ready →</span>') : ''}`;
    }
    return who;
  }
  function rowHTMLp(t) {
    const pct = Math.round(t.progress * 100);
    const chip = `<span class="tp-st ${t.state}">${t.state === 'doing' ? `<span data-pct="${t.id}">${pct}%</span>` : STATE_LABEL[t.state]}</span>`;
    const bar = t.state === 'doing' ? `<div class="tp-bar"><i data-bar="${t.id}" style="width:${pct}%"></i></div>` : '';
    return `<div class="tp-row ${t.state}${t.last === 'handoff' ? ' handoff' : ''}${t.live ? ' live' : ''}" data-id="${t.id}" data-dept="${t.dept}" data-agent="${t.agent}">
      ${chip}<div class="tp-body"><div class="tp-t">${esc(t.title)}</div><div class="tp-m">${metaFor(t)}</div>${bar}</div>
      <span class="tp-ago" data-ago="${t.id}">${span(Date.now() - t.changedAt)}</span></div>`;
  }
  function rects() {
    const m = {};
    P_.rows.querySelectorAll('.tp-row').forEach(n => { m[n.dataset.id] = n.getBoundingClientRect(); });
    return m;
  }
  function flip(before) {
    P_.rows.querySelectorAll('.tp-row').forEach(n => {
      const b = before[n.dataset.id];
      if (!b) { n.classList.add('tp-new'); return; }
      const a = n.getBoundingClientRect();
      const dy = b.top - a.top;
      if (Math.abs(dy) < 1) return;
      n.style.transition = 'none'; n.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = 'transform .65s var(--ease)'; n.style.transform = ''; }));
    });
  }
  function render(structural) {
    const f = getFocused();
    P_.scope.textContent = (f && f !== 'brain') ? DEPTS[f].name : 'WHOLE OFFICE';
    P_.chips.innerHTML = chipsHTML();
    const list = scoped().filter(t => filter === 'all' || t.state === filter)
      .sort((a, b) => b.changedAt - a.changedAt).slice(0, 60);
    const before = structural ? {} : rects();
    P_.rows.innerHTML = list.map(rowHTMLp).join('') ||
      `<div class="tp-empty">Nothing here right now.</div>`;
    P_.rows.querySelectorAll('.tp-row.waiting').forEach(n => n.addEventListener('click', () => zoomToApproval(n.dataset.dept)));
    P_.rows.querySelectorAll('.tp-row.live.done').forEach(n => n.addEventListener('click', () => openAgent && openAgent(n.dataset.agent, 'chat')));
    if (!structural) flip(before);
  }
  function refreshBars() {
    for (const t of tasks) {
      if (t.state !== 'doing') continue;
      const bar = P_.rows.querySelector(`[data-bar="${t.id}"]`);
      if (!bar) continue;
      const pct = Math.round(t.progress * 100);
      bar.style.width = pct + '%';
      const p = P_.rows.querySelector(`[data-pct="${t.id}"]`);
      if (p) p.textContent = pct + '%';
    }
  }
  function refreshAgo() {
    const now = Date.now();
    for (const t of tasks) {
      const el = P_.rows.querySelector(`[data-ago="${t.id}"]`);
      if (el) el.textContent = span(now - t.changedAt);
    }
    // waiting / backlog metas carry a duration too — cheap to re-render those lines
    P_.rows.querySelectorAll('.tp-row.waiting .tp-m, .tp-row.next .tp-m').forEach(m => {
      const t = tasks.find(x => x.id === +m.closest('.tp-row').dataset.id);
      if (t) m.innerHTML = metaFor(t);
    });
  }
  setDept('marketing');
  render(true);

  /* ---------- the company board (B) ---------- */
  const el = document.createElement('div'); el.id = 'board'; document.body.appendChild(el);
  const dim = document.createElement('div'); dim.id = 'boardDim'; document.body.appendChild(dim);
  dim.addEventListener('click', close);
  function cardHTML(t) {
    const a = agentOf(t.agent), chip = DEPTS[t.dept].chip;
    const pct = Math.round(t.progress * 100);
    const av = `<span class="tk-av" style="border-color:${chip};background:${chip}55">${a.name[0]}</span>`;
    let meta;
    if (t.state === 'done') meta = `<span class="tk-tick">✓</span><span>${a.name}</span><span class="tk-pct">${t.approved ? 'APPROVED · ' : ''}${timeStr(t.doneAt)}</span>`;
    else if (t.state === 'waiting') meta = `${av}<span>${a.name}</span><span class="tk-chip">WAITING ${span(Date.now() - t.changedAt).toUpperCase()}</span>`;
    else if (t.state === 'doing') meta = `${av}<span>${a.name}</span><span class="tk-pct" data-pct="${t.id}">${t.agent === 'vid' ? 'RENDER · ' : ''}${pct}%</span>`;
    else meta = `${av}<span>${a.name}</span><span class="tk-pct">${span(Date.now() - t.addedAt).toUpperCase()} IN BACKLOG</span>`;
    return `<div class="tk ${t.state}${t.revised ? ' rev' : ''}" data-id="${t.id}" data-dept="${t.dept}">
      <div class="tk-t">${esc(t.title)}</div><div class="tk-m">${meta}</div>
      ${t.state === 'doing' ? `<div class="tk-bar"><i data-bar="${t.id}" style="width:${pct}%"></i></div>` : ''}</div>`;
  }
  const byState = (k, st) => {
    const l = deptTasks(k, st);
    if (st === 'doing') l.sort((a, b) => b.progress - a.progress);
    else if (st === 'done') l.sort((a, b) => b.doneAt - a.doneAt);
    else l.sort((a, b) => a.id - b.id);
    return l;
  };
  const COLS = [['next', 'BACKLOG'], ['doing', 'IN PROGRESS'], ['waiting', 'WAITING ON APPROVAL'], ['done', 'DONE']];
  function companyHTML() {
    const tot = st => DEPT_KEYS.reduce((s, k) => s + deptTasks(k, st).length, 0);
    const doneAll = DEPT_KEYS.reduce((s, k) => s + doneCount[k], 0);
    return `<div class="bd-head">
        <span class="b-name"><span class="bd-title">Agents Office</span>Today's board</span>
        <span class="bd-stats"><span>IN PROGRESS<b>${tot('doing')}</b></span><span>BACKLOG<b>${tot('next')}</b></span><span>WAITING<b>${tot('waiting')}</b></span><span>DONE<b>${doneAll}</b></span></span></div>
      <div class="bd-lanes"><div class="lh"></div>${COLS.map(([, lab]) => `<div class="lh">${lab}</div>`).join('')}
      ${DEPT_KEYS.map(k => {
        const d = DEPTS[k], n = AGENTS.filter(a => a.dept === k).length;
        return `<div class="ld"><span><span class="dot" style="background:${d.chip}"></span>${d.short}</span><b>${n} agents</b></div>` +
          COLS.map(([st]) => {
            const list = byState(k, st), show = list.slice(0, 2);
            return `<div class="lc">${show.map(cardHTML).join('')}${list.length > 2 ? `<div class="more">+${list.length - 2} more</div>` : ''}</div>`;
          }).join('');
      }).join('')}</div>`;
  }
  function renderBoard() {
    if (!board.open) return;
    el.innerHTML = companyHTML();
    el.querySelectorAll('.tk.waiting').forEach(n => n.addEventListener('click', () => { close(); zoomToApproval(n.dataset.dept); }));
  }
  function open() {
    board.open = true;
    el.className = 'company';
    renderBoard();
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); dim.classList.add('on'); }));
  }
  function close() { if (!board.open) return; board.open = false; el.classList.remove('on'); dim.classList.remove('on'); }
  function toggle() { board.open ? close() : open(); }
  const isOpen = () => board.open;
  const boardWidth = () => 0; // the dept-side board is retired — the panel is the department view
  function openFor(k) { if (getFocused() !== k) enterFocus(k); }
  function onFocusChange(k) { if (board.open) close(); if (k && k !== 'brain') setDept(k); render(true); }

  /* ---------- approvals feed the WAITING state ---------- */
  function onStuck(id, ask) {
    const d = agentTasks(id, 'doing')[0];
    if (d) d.pausedAt = performance.now();
    const w = mk({ agent: id, title: ask, state: 'waiting', isAsk: true });
    touch(w, 'waiting');
  }
  function onResolve(id, approved) {
    const d = agentTasks(id, 'doing')[0];
    if (d && d.pausedAt) { d.startedAt += performance.now() - d.pausedAt; d.pausedAt = null; }
    const w = tasks.find(t => t.agent === id && t.state === 'waiting');
    if (w) {
      if (approved) { w.state = 'done'; w.approved = true; w.doneAt = Date.now(); doneCount[w.dept]++; touch(w, 'done'); prune(w.dept); }
      else { w.state = 'next'; w.revised = true; w.addedAt = Date.now(); touch(w, 'added'); }
    }
  }

  /* ---------- chat intake still works: "add task: …" in any agent's rail ---------- */
  function handleChat(agentId, text) {
    const m = text.match(/^\s*(?:add\s+(?:a\s+)?(?:new\s+)?task|new\s+task|task|todo)\s*[:\-–—]?\s*(.+)$/i);
    const k = R[agentId].a.dept;
    if (m) {
      let title = m[1].trim().replace(/[.!]+$/, '');
      title = title.charAt(0).toUpperCase() + title.slice(1);
      const { agent: a, matched } = route(k, title);
      const to = matched ? a.id : agentId;
      const t = addTask(to, title, 'you');
      if (!t) return `${agentOf(to).name} already has five queued — let one finish first, or give it to someone else in ${DEPTS[k].short}.`;
      const busy = agentTasks(to, 'doing').length > 0;
      const who = to === agentId ? "I've got it" : `${agentOf(to).name} has it`;
      return `Added to the ${DEPTS[k].short} backlog — ${who}, ${busy ? 'up next after the current job' : 'starting now'}. It's in the task panel on the right.`;
    }
    if (/\b(board|what'?s next|next up|what are (you|we) (all )?(doing|working))\b/i.test(text)) {
      const list = st => byState(k, st).slice(0, 3).map(t => `• ${t.title} (${agentOf(t.agent).name})`).join('\n');
      const doing = list('doing'), next = list('next'), waiting = list('waiting');
      return `${DEPTS[k].name} right now:\n\nIN PROGRESS\n${doing || '—'}\n\nBACKLOG\n${next || '—'}` +
        (waiting ? `\n\nWAITING ON YOU\n${waiting}` : '') + `\n\nDone today: ${doneCount[k]}. Say "add task: …" to put something on the list.`;
    }
    return null;
  }

  /* ---------- per-frame ---------- */
  function tick(now) {
    for (const id in R) {
      const r = R[id];
      if (r.state === 'stuck') continue;
      const d = agentTasks(id, 'doing')[0];
      if (d) {
        if (d.live) {
          if (!d.running) runLive(d);
          if (d.ready) { d.progress = 1; complete(d); }
          else d.progress = Math.min(0.92, (now - (d.startedAt || now)) / 45000);
        }
        // (canlı olmayan sahte ilerleme çubuğu söküldü — iş yalnızca sunucuda gerçekten koşar)
      } else {
        // GERÇEK-VERİ KURALI: boşta kalan ajana kendiliğinden iş ÜRETİLMEZ.
        // (Eskiden burada her 6-22 sn'de bir uydurma görev dağıtılıyordu. Söküldü.)
        const nx = agentTasks(id, 'next').sort((a, b) => a.addedAt - b.addedAt)[0];
        if (nx) start(nx, now);
        r.nextBrainAt = null;
      }
    }
    if (now - lastBadge > 400) { syncBadges(); lastBadge = now; }
    if (dirty) { render(false); renderBoard(); dirty = false; }
    else {
      if (now - lastBar > 250) { refreshBars(); lastBar = now; }
      if (now - lastAgo > 15000) { refreshAgo(); lastAgo = now; }
    }
  }

  return { tick, toggle, open, close, openFor, isOpen, boardWidth, onFocusChange, onStuck, onResolve,
           handleChat, addTask, revise, rowHTML, setDept, tasks, panelWidth: () => panel.offsetWidth, isLive: () => live };
}
