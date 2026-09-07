// usage.mjs — the token ledger.
// Reads Claude Code's own session logs (~/.claude/projects/**/*.jsonl), attributes every
// assistant message to an agent (via the cwd the CLI ran in), prices it, and answers:
//   who spent what, on which model, in which window, and how much budget is left.
// Nothing leaves the machine. Incremental: each file is re-read only past its last byte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ---------- pricing (USD per 1M tokens) — platform.claude.com/docs/en/about-claude/pricing ---------- */
// keys are matched as prefixes against the model id, longest first.
export const DEFAULT_PRICES = {
  'claude-fable-5-1':  { in: 10, out: 50, cw5: 12.50, cw1h: 20, cr: 0.25 },
  'claude-mythos-5-1': { in: 10, out: 50, cw5: 12.50, cw1h: 20, cr: 0.25 },
  'claude-fable-5':    { in: 10, out: 50, cw5: 12.50, cw1h: 20, cr: 1.00 },
  'claude-mythos-5':   { in: 10, out: 50, cw5: 12.50, cw1h: 20, cr: 1.00 },
  'claude-opus-5':     { in: 5,  out: 25, cw5: 6.25,  cw1h: 10, cr: 0.50 },
  'claude-opus-4-8':   { in: 5,  out: 25, cw5: 6.25,  cw1h: 10, cr: 0.50 },
  'claude-opus-4-7':   { in: 5,  out: 25, cw5: 6.25,  cw1h: 10, cr: 0.50 },
  'claude-opus-4-6':   { in: 5,  out: 25, cw5: 6.25,  cw1h: 10, cr: 0.50 },
  'claude-opus-4-5':   { in: 5,  out: 25, cw5: 6.25,  cw1h: 10, cr: 0.50 },
  'claude-opus-4-1':   { in: 15, out: 75, cw5: 18.75, cw1h: 30, cr: 1.50 },
  'claude-opus-4':     { in: 15, out: 75, cw5: 18.75, cw1h: 30, cr: 1.50 },
  'claude-sonnet-5':   { in: 2,  out: 10, cw5: 2.50,  cw1h: 4,  cr: 0.20 },
  'claude-sonnet-4-6': { in: 3,  out: 15, cw5: 3.75,  cw1h: 6,  cr: 0.30 },
  'claude-sonnet-4-5': { in: 3,  out: 15, cw5: 3.75,  cw1h: 6,  cr: 0.30 },
  'claude-sonnet-4':   { in: 3,  out: 15, cw5: 3.75,  cw1h: 6,  cr: 0.30 },
  'claude-haiku-4-5':  { in: 1,  out: 5,  cw5: 1.25,  cw1h: 2,  cr: 0.10 },
  'claude-haiku-3-5':  { in: 0.80, out: 4, cw5: 1, cw1h: 1.60, cr: 0.08 },
};
const UNKNOWN = { in: 5, out: 25, cw5: 6.25, cw1h: 10, cr: 0.50 }; // assume Opus-class rather than zero

export function priceOf(model, prices = DEFAULT_PRICES) {
  if (!model || model === '<synthetic>') return null;
  const id = String(model).toLowerCase();
  let best = null, bestLen = -1;
  for (const k of Object.keys(prices)) if (id.startsWith(k) && k.length > bestLen) { best = prices[k]; bestLen = k.length; }
  return best || UNKNOWN;
}
export const costOf = (r, prices) => {
  const p = priceOf(r.model, prices); if (!p) return 0;
  return (r.in * p.in + r.out * p.out + r.cw5 * p.cw5 + r.cw1h * p.cw1h + r.cr * p.cr) / 1e6;
};

/* ---------- where Claude Code keeps its logs ---------- */
export const projectsDir = () => process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
  : path.join(os.homedir(), '.claude', 'projects');

// Claude Code encodes the cwd into the folder name: C:\Users\x\y → C--Users-x-y  (/a/b → -a-b)
const decodeDir = d => d.replace(/^([A-Za-z])--/, '$1:/').replace(/-/g, '/');

function listLogs(dir) {
  const out = [];
  const walk = d => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (e.name.endsWith('.jsonl')) out.push(f); } };
  walk(dir); return out;
}

/* ---------- the ledger ---------- */
// A row is one billed assistant message:
//   { ts, model, cwd, agent, session, in, out, cr, cw5, cw1h, side }
export class Ledger {
  constructor({ dir = projectsDir(), cachePath, agentDirRoot = null, prices = DEFAULT_PRICES } = {}) {
    this.dir = dir; this.cachePath = cachePath; this.prices = prices;
    this.agentDirRoot = agentDirRoot ? path.resolve(agentDirRoot).replace(/\\/g, '/').toLowerCase() : null;
    this.files = new Map();       // absolute path → { size, rows }
    this.loadCache();
  }
  loadCache() {
    if (!this.cachePath) return;
    try { const c = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      for (const [f, v] of Object.entries(c.files || {})) this.files.set(f, v);
    } catch { /* first run */ }
  }
  saveCache() {
    if (!this.cachePath) return;
    try { fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify({ v: 1, files: Object.fromEntries(this.files) }));
    } catch { /* cache is an optimisation, never a requirement */ }
  }
  // agent id from the cwd the CLI ran in: <agentDirRoot>/<id> → id. Otherwise null.
  agentOf(cwd) {
    if (!this.agentDirRoot || !cwd) return null;
    const c = String(cwd).replace(/\\/g, '/').toLowerCase();
    if (!c.startsWith(this.agentDirRoot + '/')) return null;
    const rest = c.slice(this.agentDirRoot.length + 1).split('/')[0];
    return rest || null;
  }
  parseFile(file, fromByte) {
    const rows = [];
    let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return rows; }
    if (fromByte) { // resume: skip what we already counted (byte offset ≈ char offset for these logs)
      const cut = text.indexOf('\n', fromByte - 1);
      text = cut >= 0 ? text.slice(cut + 1) : '';
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const u = j.message?.usage; if (!u) continue;
      const model = j.message?.model || '?';
      if (model === '<synthetic>') continue;
      const cwd = j.cwd || decodeDir(path.basename(path.dirname(file)));
      rows.push({
        ts: Date.parse(j.timestamp || 0) || 0,
        model, cwd, agent: this.agentOf(cwd),
        session: j.sessionId || j.session_id || '',
        in: u.input_tokens || 0,
        out: u.output_tokens || 0,
        cr: u.cache_read_input_tokens || 0,
        cw5: u.cache_creation?.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens || 0),
        cw1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        side: !!j.isSidechain,
      });
    }
    return rows;
  }
  refresh() {
    const seen = new Set();
    for (const f of listLogs(this.dir)) {
      seen.add(f);
      let st; try { st = fs.statSync(f); } catch { continue; }
      const prev = this.files.get(f);
      if (prev && prev.size === st.size) continue;            // unchanged
      if (prev && st.size > prev.size) {                       // appended: read the tail only
        const add = this.parseFile(f, prev.size);
        this.files.set(f, { size: st.size, rows: prev.rows.concat(add) });
      } else {                                                 // new or rewritten: full read
        this.files.set(f, { size: st.size, rows: this.parseFile(f, 0) });
      }
    }
    for (const f of [...this.files.keys()]) if (!seen.has(f)) this.files.delete(f); // log deleted
    this.saveCache();
    return this;
  }
  rows() { const all = []; for (const v of this.files.values()) all.push(...v.rows); return all; }
}

/* ---------- aggregation ---------- */
const blank = () => ({ calls: 0, in: 0, out: 0, cr: 0, cw5: 0, cw1h: 0, tokens: 0, cost: 0 });
function add(acc, r, prices) {
  acc.calls++; acc.in += r.in; acc.out += r.out; acc.cr += r.cr; acc.cw5 += r.cw5; acc.cw1h += r.cw1h;
  acc.tokens += r.in + r.out + r.cr + r.cw5 + r.cw1h;
  acc.cost += costOf(r, prices);
  return acc;
}
export function summarise(rows, { prices = DEFAULT_PRICES, now = Date.now() } = {}) {
  const W = { h5: 5 * 3600e3, d1: 24 * 3600e3, d7: 7 * 24 * 3600e3, d30: 30 * 24 * 3600e3 };
  const out = {
    generatedAt: now,
    total: blank(), h5: blank(), d1: blank(), d7: blank(), d30: blank(),
    byAgent: {}, byModel: {}, byProject: {}, byDay: {}, sessions: 0,
  };
  const sess = new Set();
  for (const r of rows) {
    add(out.total, r, prices);
    const age = now - r.ts;
    if (age <= W.h5) add(out.h5, r, prices);
    if (age <= W.d1) add(out.d1, r, prices);
    if (age <= W.d7) add(out.d7, r, prices);
    if (age <= W.d30) add(out.d30, r, prices);
    const ag = r.agent || '(dışarıdan)';
    add(out.byAgent[ag] ||= blank(), r, prices);
    add(out.byModel[r.model] ||= blank(), r, prices);
    const pr = String(r.cwd || '?').replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] || '?';
    add(out.byProject[pr] ||= blank(), r, prices);
    if (r.ts) add(out.byDay[new Date(r.ts).toISOString().slice(0, 10)] ||= blank(), r, prices);
    if (r.session) sess.add(r.session);
  }
  out.sessions = sess.size;
  return out;
}
// spend for one agent inside a rolling window (ms) — what the budget gate reads
export function spentBy(rows, agentId, windowMs, { prices = DEFAULT_PRICES, now = Date.now() } = {}) {
  const acc = blank();
  for (const r of rows) if (r.agent === agentId && (!windowMs || now - r.ts <= windowMs)) add(acc, r, prices);
  return acc;
}
