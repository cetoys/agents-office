// ops.mjs — budget gate + agent scorecard.
// Sits on top of usage.mjs (what was spent) and data/tasks.json (what was produced).
import fs from 'node:fs';
import path from 'node:path';
import { Ledger, summarise, spentBy, DEFAULT_PRICES, costOf } from './usage.mjs';

const WINDOWS = { h5: 5 * 3600e3, '1d': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3, all: 0 };

export function loadOpsConfig(root) {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return {}; } };
  const base = read('office.usage.json'), local = read('office.usage.local.json');
  const c = { window: '7d', defaultBudgetUSD: 0, warnAt: 0.8, enforce: true, agents: {}, departments: {}, prices: {}, ...base, ...local };
  c.agents = { ...(base.agents || {}), ...(local.agents || {}) };
  c.departments = { ...(base.departments || {}), ...(local.departments || {}) };
  c.prices = { ...DEFAULT_PRICES, ...(base.prices || {}), ...(local.prices || {}) };
  c.windowMs = WINDOWS[c.window] ?? WINDOWS['7d'];
  return c;
}

export class Ops {
  constructor({ root, agentDirRoot, tasksFile, agents, depts }) {
    this.root = root; this.tasksFile = tasksFile; this.agents = agents; this.depts = depts;
    this.cfg = loadOpsConfig(root);
    this.ledger = new Ledger({ cachePath: path.join(root, 'data', 'usage-cache.json'), agentDirRoot, prices: this.cfg.prices });
  }
  reloadConfig() { this.cfg = loadOpsConfig(this.root); this.ledger.prices = this.cfg.prices; return this.cfg; }
  rows() { return this.ledger.refresh().rows(); }
  tasks() { try { return JSON.parse(fs.readFileSync(this.tasksFile, 'utf8')); } catch { return []; } }

  budgetFor(agentId) {
    const a = this.agents.find(x => x.id === agentId);
    const per = this.cfg.agents[agentId]?.budgetUSD;
    if (Number.isFinite(per)) return { usd: per, from: 'agent' };
    const dep = a && this.cfg.departments[a.department]?.budgetUSD;
    if (Number.isFinite(dep)) return { usd: dep, from: 'department' };
    return { usd: +this.cfg.defaultBudgetUSD || 0, from: 'default' };
  }
  // the gate the server calls before letting an agent start work
  check(agentId, rows = this.rows()) {
    const b = this.budgetFor(agentId);
    const spent = spentBy(rows, agentId, this.cfg.windowMs, { prices: this.cfg.prices });
    if (!b.usd) return { ok: true, unlimited: true, spentUSD: spent.cost, tokens: spent.tokens, budgetUSD: 0, pct: 0, window: this.cfg.window };
    const pct = spent.cost / b.usd;
    return {
      ok: !(this.cfg.enforce && pct >= 1), unlimited: false, budgetUSD: b.usd, budgetFrom: b.from,
      spentUSD: spent.cost, tokens: spent.tokens, pct, warn: pct >= (+this.cfg.warnAt || 0.8),
      window: this.cfg.window, enforce: !!this.cfg.enforce,
    };
  }

  // one row per agent: what it cost, what it produced, and how often it had to be sent back
  scorecard(rows = this.rows()) {
    const tasks = this.tasks();
    const byAgent = new Map();
    for (const a of this.agents) byAgent.set(a.id, {
      id: a.id, name: a.name, role: a.role, department: a.department, does: a.does, lead: !!a.lead,
      tasks: 0, done: 0, failed: 0, revisions: 0, avgSecs: 0, tokens: 0, costUSD: 0, calls: 0,
      tokensPerTask: 0, costPerTask: 0, firstTimeRight: null, lastAt: 0, score: null,
    });
    let secs = new Map();
    for (const t of tasks) {
      const s = byAgent.get(t.agent); if (!s) continue;
      s.tasks++;
      if (t.state === 'done' && !t.error) s.done++;
      if (t.error) s.failed++;
      s.revisions += (+t.revisions || 0);
      if (t.startedAt && t.doneAt) { const arr = secs.get(t.agent) || []; arr.push((t.doneAt - t.startedAt) / 1000); secs.set(t.agent, arr); }
      s.lastAt = Math.max(s.lastAt, t.doneAt || t.addedAt || 0);
    }
    for (const r of rows) {
      const s = r.agent && byAgent.get(r.agent); if (!s) continue;
      s.calls++; s.tokens += r.in + r.out + r.cr + r.cw5 + r.cw1h; s.costUSD += costOf(r, this.cfg.prices);
    }
    for (const s of byAgent.values()) {
      const arr = secs.get(s.id) || [];
      s.avgSecs = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      s.tokensPerTask = s.tasks ? Math.round(s.tokens / s.tasks) : 0;
      s.costPerTask = s.tasks ? s.costUSD / s.tasks : 0;
      s.firstTimeRight = s.done ? Math.max(0, (s.done - s.revisions) / s.done) : null;
      // score: only for agents with a track record. 60% ilk seferde doğru, 40% hata yokluğu.
      if (s.tasks >= 3) {
        const reliability = 1 - (s.failed / s.tasks);
        s.score = Math.round(100 * (0.6 * (s.firstTimeRight ?? 0) + 0.4 * reliability));
      }
      const b = this.budgetFor(s.id);
      s.budgetUSD = b.usd; s.budgetFrom = b.from;
      const w = spentBy(rows, s.id, this.cfg.windowMs, { prices: this.cfg.prices });
      s.windowCostUSD = w.cost; s.windowTokens = w.tokens;
      s.budgetPct = b.usd ? w.cost / b.usd : 0;
    }
    return [...byAgent.values()];
  }

  report() {
    const rows = this.rows();
    const sum = summarise(rows, { prices: this.cfg.prices });
    const cards = this.scorecard(rows);
    const tasks = this.tasks();
    return {
      config: { window: this.cfg.window, defaultBudgetUSD: this.cfg.defaultBudgetUSD, warnAt: this.cfg.warnAt, enforce: this.cfg.enforce },
      usage: sum,
      agents: cards,
      queue: {
        next: tasks.filter(t => t.state === 'next').length,
        doing: tasks.filter(t => t.state === 'doing').length,
        done: tasks.filter(t => t.state === 'done' && !t.error).length,
        failed: tasks.filter(t => t.error).length,
        recent: tasks.slice(-15).reverse().map(t => ({ id: t.id, agent: t.agent, dept: t.dept, title: t.title, state: t.state, error: !!t.error, addedAt: t.addedAt, doneAt: t.doneAt || 0, revisions: +t.revisions || 0 })),
      },
    };
  }
}
