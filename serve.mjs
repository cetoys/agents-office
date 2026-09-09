// Agents Office — the local server (Beta).
// Serves the office and makes it real on your own Claude login:
//   · the command bar routes a typed task through Claude to the right agent in the department
//   · the agent produces the deliverable, which is saved as a note in your brain folder
//   · the Brain is your vault's real wiki-link graph, rebuilt live as notes are written
//   · chat with any agent is a real conversation in that agent's persona, grounded in your notes
// Everything stays on this machine: data/tasks.json and <brain>/Agents Office/*.md.
//
//   npm start                 → http://localhost:4520
//   PORT=4600 npm start       → another port
//
// Claude backend: the Claude Code CLI (`claude -p`, your existing login) — or the official SDK
// if ANTHROPIC_API_KEY is set. AO_MODEL=<model> overrides the model.
//
// V3.1: the connectors are real — the MCP servers your Claude Code is connected to are what the
// top bar shows and what the agents can call (mcp.mjs); the roster is yours (office.agents.json,
// roster.mjs). Tool calls only happen on the CLI backend: the SDK path has no MCP servers.
// V3.2: how the work is done is yours too — each agent's `brief` (roster.mjs) and the skills
// bound to it (skills.mjs: skills/ + <brain>/Agents Office/skills/) go into every task and chat.
// V3.3: the agents learn — every "revise: …" is recorded and standing rules come back into the
// prompt (learn.mjs); a department lead interviews the owner in chat and writes the briefs and a
// skill for its team (onboard.mjs). Roster, skills and lessons are re-read before every task.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, ROOT } from './config.mjs';
import { layoutGraph, readVault, readOfficeNotes } from './graph-build.mjs';
import { DEPTS, DEPT_KEYS } from './src/data.js';
import * as mcp from './mcp.mjs';
import { loadRoster } from './roster.mjs';
import { loadSkills } from './skills.mjs';
import * as learn from './learn.mjs';
import * as onboard from './onboard.mjs';
import * as bb from './blackboard.mjs'; // kara tahta: ajanlar arası ortak not havuzu
import { Ops } from './ops.mjs'; // V3.4-ops: token ledger, budgets, agent scorecard
import { rowFromUsage } from './usage.mjs';
import { loadEngines, callEngine } from './engines.mjs'; // bir ajan, bir motor
import { loadPreflight, check as preflightCheck } from './preflight.mjs'; // uydurmayı kesen ön kapı
import * as patron from './patron.mjs'; // tek muhatap: sen patronla konuşursun, işi o dağıtır

const cfg = loadConfig();
const HTML = path.join(ROOT, 'dist', 'command-centre-v2.html'); // built by build.mjs; shipped so npm start works without a build
const DATA = path.join(ROOT, 'data');
const FILE = path.join(DATA, 'tasks.json');
const BRAIN = cfg.brainPath;
const NOTES_DIR = path.join(BRAIN, 'Agents Office');
const CLI_ROOT = path.join(os.tmpdir(), 'agents-office-cli'); // an empty cwd: no CLAUDE.md, no repo context
// One folder per agent under that root. Claude Code names its log folder after the cwd, so this is
// what makes per-agent token attribution possible at all — see usage.mjs.
const cliCwd = id => { const p = path.join(CLI_ROOT, String(id || '_office')); fs.mkdirSync(p, { recursive: true }); return p; };
const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const RUN_TIMEOUT = Math.max(60, +cfg.timeout || 300) * 1000; // agents with tools take longer than a plain draft
mcp.configure(cfg);
const roster = loadRoster(BRAIN);
const AGENTS = roster.agents; // id · department · lead · name · role · does · tools · brief
for (const w of roster.problems) console.warn('agents:', w);
let skills = loadSkills(BRAIN, AGENTS); // reloaded before every task and chat, so a new skill needs no restart
for (const w of skills.problems) console.warn('skills:', w);
// the roster's editable fields are re-read too (a brief written by the lead's interview, or by hand, lands without a restart)
function reloadRoster() {
  const r = loadRoster(BRAIN);
  for (const a of r.agents) { const cur = AGENTS.find(x => x.id === a.id); if (cur) Object.assign(cur, { name: a.name, role: a.role, does: a.does, tools: a.tools, brief: a.brief, engine: a.engine, model: a.model }); }
  if (r.problems.join() !== roster.problems.join()) for (const w of r.problems) console.warn('agents:', w);
  Object.assign(roster, { problems: r.problems, customised: r.customised, briefed: r.briefed, files: r.files });
}
const refreshSkills = () => { reloadRoster(); const s = loadSkills(BRAIN, AGENTS); if (s.problems.join() !== skills.problems.join()) for (const w of s.problems) console.warn('skills:', w); skills = s; return s; };
/* ---------- ops: the ledger, the budgets, the scorecard (ops.mjs · usage.mjs) ---------- */
const ops = new Ops({ root: ROOT, agentDirRoot: CLI_ROOT, tasksFile: FILE, agents: AGENTS, depts: DEPTS });
let engines = loadEngines(ROOT); // office.engines.json — hangi ajan hangi sağlayıcıda koşar
let preflight = loadPreflight(engines);

const leadOf = dept => AGENTS.find(a => a.department === dept && a.lead) || AGENTS.find(a => a.department === dept);
const setupMap = () => Object.fromEntries(DEPT_KEYS.map(k => [k, onboard.isSetUp(AGENTS, skills, k)]));

let backend = 'claude-cli', sdk = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    sdk = new Anthropic(); backend = 'anthropic-sdk';
  } catch (e) { console.warn('SDK not installed (npm install @anthropic-ai/sdk) — using the Claude CLI:', e.message.split('\n')[0]); }
}

/* ---------- storage ---------- */
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = list => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); };
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* ---------- ask Claude ---------- */
// askX → { text, tools }: tools = the MCP/web tools the agent actually called (for the office to
// light up). On the CLI the agent gets --allowedTools = every connected server the config allows
// (+ web); file tools, Bash and sub-agents stay off — the office is not a coding session.
// LIVE: şu an kim çalışıyor. 3B ofisin masaları bunu okuyup yanıyor.
const live = new Map(); // agent -> { agent, engine, kind, model, since, what }
export const liveList = () => [...live.values()];

async function askX(system, user, { maxTokens = 4000, tools = true, timeout = RUN_TIMEOUT, agent = '_office', what = '' } = {}) {
  const a = AGENTS.find(x => x.id === agent);
  const name = (a?.engine || '').trim() || engines.default;
  const e = engines.engines?.[name];
  const runId = agent + ':' + Date.now();
  live.set(runId, { agent, name: a?.name || agent, engine: name, kind: e?.kind || '?', model: a?.model || e?.model || '', since: Date.now(), what: String(what).slice(0, 120) });
  try {
    if (sdk && (e?.kind === 'claude-cli' || !e)) { // API anahtarı yolu: SDK
      const res = await sdk.messages.create({ model: cfg.model || 'claude-opus-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
      if (res.usage) ops.record(agent, [rowFromUsage(agent, res.model, res.usage, { engine: 'sdk' })]);
      if (res.stop_reason === 'refusal') throw new Error('Claude declined this request');
      return { text: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), tools: [], engine: 'sdk' };
    }
    const r = await callEngine(engines, name, {
      system, user, agent, maxTokens, timeout,
      modelOverride: (a?.model || '').trim() || undefined,
      allowedTools: tools ? mcp.allowedTools(a?.tools) : [],
      allowSkills: tools && cfg.tools?.skills !== false, // Claude Code eklenti skill'leri
      skillHints: a?.skills || [],
      cwdRoot: CLI_ROOT,
      onInit: j => mcp.fromInit(j),
    });
    ops.record(agent, r.usage || []);
    if (!r.text) throw new Error(`${name} boş yanıt döndü`);
    return { text: r.text, tools: r.tools || [], engine: name, kind: r.kind, ms: r.ms };
  } catch (err) {
    if (err?.usage?.length) ops.record(agent, err.usage); // başarısız da olsa harcanan yazılır
    err.message = `[${name}] ` + err.message;
    throw err;
  } finally { live.delete(runId); }
}
const ask = async (system, user, opts) => (await askX(system, user, { tools: false, ...opts })).text;
function parseJSON(text) {
  const s = text.replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}

/* ---------- the brain: graph + context ---------- */
let graph = { notes: 0, nodes: [], links: [], floor: [] };
async function rebuildGraph() {
  try { graph = await layoutGraph(BRAIN); } catch (e) { console.warn('brain graph failed:', e.message); }
  return graph;
}
function vaultIndex() { // name → text (vault notes + live office notes)
  const { notes } = readVault(BRAIN); const m = new Map();
  for (const [name, n] of notes) m.set(name, n.text);
  for (const n of readOfficeNotes(BRAIN)) m.set(n.name, n.text);
  return m;
}
// SADECE senin notların — ajanların yazdığı teslimatlar hariç.
// Neden: bir ajan uydurduğu bir fiyatı teslimata yazdı, teslimat beyne not olarak düştü, ve
// sonraki koşularda o uydurma "şirket bilgisi" gibi okundu. Ajan çıktısı taslaktır, kanıt değil —
// "bu bilgi elimizde var mı" sorusu yalnızca senin notlarına bakarak cevaplanmalı.
function ownerIndex() {
  const { notes } = readVault(BRAIN); const m = new Map();
  for (const [name, n] of notes) m.set(name, n.text);
  return m;
}
function businessContext(index) {
  const bits = [];
  for (const k of ['CLAUDE', 'index', 'business-model', 'voice']) if (index.has(k)) bits.push(`--- ${k}.md ---\n${index.get(k).slice(0, 1200)}`);
  return bits.join('\n\n');
}
// the notes an agent would read for this task: name/word overlap, department MOC first
function relevantNotes(index, dept, text, n = 4) {
  const words = new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const mocName = { emails: 'MOC-Emails', sales: 'MOC-Sales', marketing: 'MOC-Marketing', ops: 'MOC-Operations', fin: 'MOC-Finance', delivery: 'MOC-Delivery' }[dept];
  const scored = [];
  for (const [name, txt] of index) {
    if (['CLAUDE', 'index', 'log'].includes(name)) continue;
    const hay = (name + ' ' + txt.slice(0, 1500)).toLowerCase();
    let s = 0; for (const w of words) if (hay.includes(w)) s += name.toLowerCase().includes(w) ? 3 : 1;
    if (name === mocName) s += 2;
    if (s) scored.push([s, name]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const picks = scored.slice(0, n).map(x => x[1]);
  if (mocName && index.has(mocName) && !picks.includes(mocName)) picks.push(mocName);
  return picks;
}
function contextText(index, names) {
  return names.map(n => `--- ${n}.md ---\n${(index.get(n) || '').slice(0, 1800)}`).join('\n\n');
}

/* ---------- the roster, as Claude sees it ---------- */
const persona = a => `${a.name}${a.lead ? ' (lead)' : ''} · ${a.role} · ${a.does}`;
function rosterText(dept) { return AGENTS.filter(a => a.department === dept).map(a => { const sk = skills.names(a); return `- ${a.id} · ${persona(a)}${sk.length ? ' · skills: ' + sk.join(', ') : ''}`; }).join('\n'); }
// what an agent is told about itself: the job, the owner's standing instructions, the skills it follows
function agentBrief(a) {
  const lessons = learn.promptText(BRAIN, a);
  return (a.brief ? `\nSTANDING INSTRUCTIONS FROM THE OWNER\n${a.brief}\n` : '') + (skills.promptText(a) ? `\n${skills.promptText(a)}\n` : '') + (lessons ? `\n${lessons}\n` : '');
}
const toolKeys = names => [...new Set(names.map(n => /^mcp__/.test(n) ? mcp.keyOf(n) : n === 'WebSearch' || n === 'WebFetch' ? 'web' : null).filter(Boolean))];
async function route(dept, text) {
  const d = DEPTS[dept]; refreshSkills();
  const system = `You are the router for ${cfg.name}, a business whose departments are run by AI agents. ` +
    'Pick the single best agent for the owner\'s request — an agent whose skills match the request is the right one — and return ONLY a JSON object — no prose, no code fences.';
  const user = `Department: ${d.name}\nAgents (id · name · role · what they do):\n${rosterText(dept)}\n\nOwner's request: "${text}"\n\n` +
    'Return: {"agent":"<id from the list>","title":"<clean imperative task title, max 70 characters>","plan":["<step>","<step>","<step>"],"eta_minutes":<integer>,"why":"<one short sentence>"}';
  const j = parseJSON(await ask(system, user, { maxTokens: 800, timeout: 150000 }));
  const valid = AGENTS.find(a => a.id === j.agent && a.department === dept);
  const agent = valid ? valid.id : (AGENTS.find(a => a.department === dept && a.lead) || AGENTS.find(a => a.department === dept)).id;
  return { agent, title: String(j.title || text).slice(0, 90), plan: Array.isArray(j.plan) ? j.plan.slice(0, 4).map(String) : [],
    eta: Number.isFinite(j.eta_minutes) ? j.eta_minutes : 30, why: String(j.why || '') };
}
async function run(task, feedback) {
  const a = AGENTS.find(x => x.id === task.agent), d = DEPTS[a.department];
  refreshSkills();
  const index = vaultIndex();
  const read = relevantNotes(index, a.department, task.title + ' ' + task.text);
  const system = `You are ${a.name}, ${a.role || 'an agent'}, in the ${d.name} department of ${cfg.name}. ${a.does}\n${agentBrief(a)}` +
    'Write the finished deliverable itself, not a description of what you would do. Plain text: a short heading, then short sections or bullets. ' +
    'At most 260 words unless a skill or the owner\'s instructions set a different shape — those win. No preamble, no sign-off. Ground it in the company notes below; where a fact is missing, make a reasonable assumption and mark it (assumed). ' +
    'If you used a tool, say so in one line at the end ("Used: Gmail — searched the client thread").\n\n' +
    `${bb.RULES}\n\nKARA TAHTA\n${bb.fmt(ROOT, { exclude: a.id })}\n\n` +
    `${mcp.promptText(a.tools)}\n\nCOMPANY NOTES\n${businessContext(index)}\n\nNOTES YOU READ FOR THIS TASK\n${contextText(index, read)}`;
  const user = `Task: ${task.title}\nOwner's request: ${task.text}` + (task.plan?.length ? `\nAgreed plan: ${task.plan.join(' → ')}` : '') +
    (task.answer ? `\n\nSordun, sahibi cevapladı: "${task.answer}" — artık teslimatı yaz, tekrar soru sorma.` : '') +
    (feedback ? `\n\nThe owner reviewed your previous version and asked for changes: "${feedback}"\nPrevious version:\n${task.result}` : '');
  // ÖN KAPI: pahalı ajanı çalıştırmadan önce, ucuz modelle "uydurmadan yapılabilir mi" kontrolü.
  // Sadece ilk turda; cevaplanmış veya revize edilen görev doğrudan geçer.
  if (!task.answer && !feedback && !preflight.skipEngines.includes((a.engine || engines.default))) {
    const own = ownerIndex();
    const ownRead = relevantNotes(own, a.department, task.title + ' ' + task.text);
    const pf = await preflightCheck({ callEngine, engines, cfg: preflight, task, agent: a,
      board: bb.fmt(ROOT, { exclude: a.id }), notes: contextText(own, ownRead) });
    if (!pf.ok) return { result: '', question: pf.question, preflight: pf, read, tools: [], used: [], skills: skills.names(a) };
    if (pf.skipped) console.log(`  ön kapı atlandı (${a.id}): ${pf.skipped}`);
  }
  const { text, tools } = await askX(system, user, { agent: a.id, what: task.title });
  if (!text) throw new Error('Claude returned nothing');
  const h = bb.harvest(text);
  for (const n of h.notes) bb.write(ROOT, { ...n, agent: a.id, agentName: a.name, task: task.id });
  // Cevabı verilmiş bir görev bir daha soru soramaz — sonsuz döngüyü burada kesiyoruz.
  const question = task.answer ? null : h.question;
  return { result: h.text || text, question, boardNotes: h.notes.length,
    read, tools: toolKeys(tools), used: mcp.namesOf(tools), skills: skills.names(a) };
}
function writeNote(task) { // the deliverable becomes a note in the brain, linked to what was read
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const a = AGENTS.find(x => x.id === task.agent);
  const name = `${new Date(task.doneAt).toISOString().slice(0, 10)} ${slug(task.title)}`;
  const body = `---\nagent: ${a.name}\ndepartment: ${DEPTS[a.department].name}\ntask: ${task.id}\ndone: ${new Date(task.doneAt).toISOString()}${task.used?.length ? '\ntools: ' + task.used.join(', ') : ''}${task.skills?.length ? '\nskills: ' + task.skills.join(', ') : ''}\n---\n` +
    `# ${task.title}\n\n${task.result}\n\n---\nRead: ${(task.read || []).map(n => `[[${n}]]`).join(' · ') || '—'}\n`;
  fs.writeFileSync(path.join(NOTES_DIR, name + '.md'), body);
  return name;
}
async function chat(agentId, text, history) {
  const a = AGENTS.find(x => x.id === agentId); if (!a) throw new Error('unknown agent');
  const d = DEPTS[a.department]; refreshSkills();
  const index = vaultIndex();
  const read = relevantNotes(index, a.department, text, 3);
  const mine = load().filter(t => t.agent === agentId).slice(-6).map(t => `- [${t.state}] ${t.title}`).join('\n');
  const system = `You are ${a.name}, ${a.role || 'an agent'}, in the ${d.name} department of ${cfg.name}. ${a.does}\n${agentBrief(a)}` +
    'You are talking to the owner. Answer as this agent, in first person, briefly (under 120 words unless asked for detail), plainly, no hype. ' +
    'Use the company notes; say when something is not in them. If the owner asks you to look something up, use your tools. Nothing outbound is sent without the owner\'s explicit say-so.\n\n' +
    `${mcp.promptText(a.tools)}\n\nCOMPANY NOTES\n${businessContext(index)}\n\nRELEVANT NOTES\n${contextText(index, read)}\n\nYOUR RECENT TASKS\n${mine || '—'}`;
  const convo = (history || []).slice(-8).map(m => `${m.who === 'user' ? 'Owner' : a.name}: ${m.text}`).join('\n');
  const { text: reply, tools } = await askX(system, (convo ? convo + '\n' : '') + `Owner: ${text}\n${a.name}:`, { maxTokens: 1200, agent: a.id });
  return { reply, read, tools: toolKeys(tools), used: mcp.namesOf(tools) };
}

/* ---------- http ---------- */
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve, reject) => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); });

await rebuildGraph();
const discovering = mcp.discover().then(l => { console.log(`  connectors: ${l.filter(s => s.status === 'connected').length} connected of ${l.length} (claude mcp list)`); return l; });
const agentsOut = () => { const setup = setupMap(); return AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role, does: a.does, tools: a.tools, brief: a.brief || '', skills: skills.names(a), lessons: learn.count(BRAIN, a.id), department: a.department, lead: a.lead,
  interviewer: leadOf(a.department).id === a.id, setUp: setup[a.department] })); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/command-centre-v2.html' || url.pathname === '/dark')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      const page = fs.readFileSync(HTML, 'utf8');
      return res.end(url.pathname === '/dark' ? page.replace('<body>', '<body class="dark">') : page); // /dark: the same file, opened in dark mode
    }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version, backend, model: cfg.model || (sdk ? 'claude-opus-5' : 'your Claude Code default'), name: cfg.name, brain: BRAIN, notes: graph.notes, depts: DEPT_KEYS,
      agents: agentsOut(), setup: setupMap(), roster: { customised: roster.customised, briefed: roster.briefed, files: roster.files, problems: roster.problems }, skills: (({ count, shipped, brain, problems }) => ({ count, shipped, brain, problems }))(skills.summary()), tools: backend === 'claude-cli', mcp: mcp.summary() });
    if (url.pathname === '/api/agents') return json(res, 200, { agents: agentsOut(), problems: roster.problems, files: roster.files });
    if (url.pathname === '/api/skills') return json(res, 200, refreshSkills().summary()); // reloads from disk: edit a skill, hit this, see it
    if (url.pathname === '/api/lessons') return json(res, 200, { dir: learn.dir(BRAIN), agents: AGENTS.map(a => ({ id: a.id, name: a.name, ...learn.read(BRAIN, a.id) })).filter(x => x.rules.length || x.oneOffs.length) });
    if (url.pathname === '/api/mcp') { if (url.searchParams.get('refresh') === '1') await mcp.discover(); else await discovering; return json(res, 200, { ...mcp.summary(), tools: backend === 'claude-cli' }); }
    if (url.pathname === '/api/brain') return json(res, 200, graph);
    if (url.pathname === '/api/live') { const w = load().filter(t => t.state === 'waiting')
        .map(t => ({ id: t.id, agent: t.agent, name: AGENTS.find(a => a.id === t.agent)?.name || t.agent, question: t.question, title: t.title, since: t.askedAt || 0 }));
      return json(res, 200, { running: liveList(), waiting: w, at: Date.now() }); }
    if (url.pathname === '/api/blackboard' && req.method === 'GET') return json(res, 200, { rows: bb.read(ROOT, +url.searchParams.get('n') || 60) });
    if (url.pathname === '/api/blackboard' && req.method === 'POST') { const b = await body(req);
      const row = bb.write(ROOT, { agent: b.agent || 'owner', agentName: b.agentName || 'SEN', kind: b.kind || 'not', text: b.text });
      return json(res, row ? 200 : 400, row || { error: 'boş not' }); }
    if (url.pathname === '/api/blackboard' && req.method === 'DELETE') { bb.clear(ROOT); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/engines') { if (url.searchParams.get('reload') === '1') { engines = loadEngines(ROOT); preflight = loadPreflight(engines); }
      return json(res, 200, { default: engines.default, engines: Object.fromEntries(Object.entries(engines.engines || {}).map(([k, v]) => [k, { kind: v.kind, label: v.label || k, model: v.model || '', needsEnv: v.apiKeyEnv || null, envSet: v.apiKeyEnv ? !!process.env[v.apiKeyEnv] : true }])),
        agents: AGENTS.map(a => ({ id: a.id, name: a.name, department: a.department, engine: (a.engine || '').trim() || engines.default, model: a.model || '' })) }); }
    if (url.pathname === '/api/ops') { if (url.searchParams.get('reload') === '1') ops.reloadConfig(); return json(res, 200, ops.report()); }
    if (url.pathname === '/api/ops/usage') return json(res, 200, ops.report().usage);
    if (url.pathname === '/api/ops/agents') return json(res, 200, { agents: ops.scorecard() });
    if (url.pathname === '/api/ops/check') return json(res, 200, ops.check(url.searchParams.get('agent') || ''));
    if (req.method === 'GET' && (url.pathname === '/ops' || url.pathname === '/ops.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(ROOT, 'ops.html'), 'utf8'));
    }
    if (url.pathname === '/api/tasks' && req.method === 'GET')
      return json(res, 200, load().map(t => ({ ...t, agentName: AGENTS.find(a => a.id === t.agent)?.name || t.agent })));
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      const { dept, text } = await body(req);
      if (!DEPTS[dept] || dept === 'brain') return json(res, 400, { error: 'unknown department' });
      if (!text || !String(text).trim()) return json(res, 400, { error: 'empty task' });
      const r = await route(dept, String(text).trim());
      const task = { id: nid(), dept, agent: r.agent, title: r.title, text: String(text).trim(), plan: r.plan, eta: r.eta, why: r.why, state: 'next', addedAt: Date.now(), by: 'you' };
      const list = load(); list.push(task); save(list);
      console.log(`+ ${task.id} → ${task.agent}: ${task.title}`);
      return json(res, 200, task);
    }
    const m = url.pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(run|revise|answer))?$/);
    if (m && req.method === 'POST' && m[2] === 'answer') { // ajanın sorusuna sahibi cevap veriyor
      const list = load(); const task = list.find(t => t.id === m[1]);
      if (!task) return json(res, 404, { error: 'no such task' });
      const { answer } = await body(req);
      if (!answer || !String(answer).trim()) return json(res, 400, { error: 'boş cevap' });
      task.answer = String(answer).trim(); task.state = 'next'; task.answeredAt = Date.now();
      const ag = AGENTS.find(x => x.id === task.agent);
      bb.write(ROOT, { agent: 'owner', agentName: 'SEN', kind: 'cevap', text: `${ag?.name || task.agent} sorusuna: ${task.answer}`, task: task.id });
      save(list);
      console.log(`> ${task.id} cevaplandı: ${task.answer.slice(0, 80)}`);
      return json(res, 200, task);
    }
    if (m && req.method === 'POST' && (m[2] === 'run' || m[2] === 'revise')) {
      const list = load(); const task = list.find(t => t.id === m[1]);
      if (!task) return json(res, 404, { error: 'no such task' });
      const { feedback } = m[2] === 'revise' ? await body(req) : {};
      const gate = ops.check(task.agent); // budget: an agent over its allowance does not start
      if (!gate.ok) { task.state = 'blocked'; task.blocked = gate; save(list);
        return json(res, 402, { error: `Bütçe aşıldı: ${task.agent} son ${gate.window} içinde $${gate.spentUSD.toFixed(2)} / $${gate.budgetUSD} harcadı.`, gate, task }); }
      if (m[2] === 'revise') task.revisions = (+task.revisions || 0) + 1;
      task.state = 'doing'; task.startedAt = Date.now(); task.budget = gate; save(list);
      try {
        const { result, question, boardNotes, preflight: pf, read, tools, used, skills: sk } = await run(task, feedback);
        if (question) { // ajan tıkandı: teslimat yok, sahibine soru var
          Object.assign(task, { state: 'waiting', askedAt: Date.now(), question, result: '', read, tools, used, skills: sk, error: false, preflight: pf || null });
          const ag = AGENTS.find(x => x.id === task.agent);
          bb.write(ROOT, { agent: task.agent, agentName: ag?.name, kind: 'soru', text: question, task: task.id });
          const l3 = load(); const k = l3.findIndex(t => t.id === task.id); if (k >= 0) l3[k] = task; save(l3);
          console.log(`? ${task.id} ${task.agent} soruyor: ${question.slice(0, 90)}`);
          if (task.preflight) console.log(`  (ön kapı durdurdu, pahalı çağrı yapılmadı — eksik: ${(task.preflight.missing || []).join(', ')})`);
          return json(res, 200, task);
        }
        Object.assign(task, { state: 'done', doneAt: Date.now(), result, read, tools, used, skills: sk, error: false, boardNotes });
        task.note = writeNote(task);
        await rebuildGraph();
      } catch (e) {
        Object.assign(task, { state: 'done', doneAt: Date.now(), result: 'Could not complete this task: ' + e.message, error: true });
      }
      const l2 = load(); const i = l2.findIndex(t => t.id === task.id); if (i >= 0) l2[i] = task; save(l2);
      console.log(`${task.error ? '✗' : '✓'} ${task.id} ${task.error ? 'failed' : 'done'} (${task.result.length} chars${task.tools?.length ? ', tools: ' + task.tools.join(' ') : ''}${task.note ? ', note: ' + task.note : ''})`);
      json(res, 200, task);
      if (feedback && !task.error) { // learn from the correction, after the reply is out the door
        const a = AGENTS.find(x => x.id === task.agent);
        learn.classify(ask, a, task, feedback).then(v => { const r = learn.record(BRAIN, a, task, feedback, v); console.log(`  ↳ ${a.name} ${r.standing ? 'learned a rule' : 'noted a one-off'}: ${r.line.slice(0, 100)}`); })
          .catch(e => console.warn('learn:', e.message));
      }
      return;
    }
    if (m && req.method === 'DELETE') { save(load().filter(t => t.id !== m[1])); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { agent, text, history } = await body(req);
      if (!text || !String(text).trim()) return json(res, 400, { error: 'empty message' });
      const a = AGENTS.find(x => x.id === agent); if (!a) return json(res, 400, { error: 'unknown agent' });
      if (leadOf(a.department).id === a.id) { // the department lead can run the set-up interview
        refreshSkills();
        const o = await onboard.handle(String(text).trim(), { dept: a.department, deptName: DEPTS[a.department].name, lead: a, agents: AGENTS.filter(x => x.department === a.department),
          connected: mcp.summary().servers?.filter(x => x.status === 'connected').map(x => x.name || x.key) || [], brainPath: BRAIN, dataDir: DATA, ask, business: cfg.name, afterWrite: refreshSkills });
        if (o) { if (o.wrote) console.log(`★ ${a.name} set up ${DEPTS[a.department].name}: ${o.wrote.briefs.length} briefs${o.wrote.skill ? ', skill ' + o.wrote.skill.name : ''}`); return json(res, 200, { reply: o.reply, read: [], tools: [], interview: !o.wrote, setup: setupMap() }); }
      }
      const r = await chat(agent, String(text).trim(), history);
      return json(res, 200, { ...r, interview: false });
    }
    if (url.pathname === '/api/brief' && req.method === 'POST') { // PATRON: tek talimat → iş bölümü → birleştirilmiş cevap
      const { text, dept } = await body(req);
      if (!text || !String(text).trim()) return json(res, 400, { error: 'boş brief' });
      const brief = String(text).trim();
      const pool = AGENTS.filter(a => !dept || a.department === dept);
      const roster = pool.map(a => `${a.id} · ${a.name} (${DEPTS[a.department].name}) — ${a.does}`).join('\n');

      // 1) plan
      const planSys = `Sen ${cfg.name} ofisinin patronusun. Sahibinin tek cümlelik talimatını, ekibindeki ajanlara ` +
        `2-4 adımlık bir iş bölümüne çevir. Adımlar SIRAYLA çalışacak; sonraki adım öncekinin çıktısını kara tahtada görecek, ` +
        `o yüzden mantıklı bir sıra kur. Sadece JSON döndür:\n` +
        `{"why":"tek cümle gerekçe","steps":[{"agent":"<id>","title":"<kısa başlık>","text":"<o ajana net talimat>"}]}\n\nEKİP\n${roster}`;
      let plan; try { plan = parseJSON(await ask(planSys, `Talimat: ${brief}`, { maxTokens: 900, timeout: 180000 })); }
      catch (e) { return json(res, 500, { error: 'patron plan üretemedi: ' + e.message }); }
      const steps = (Array.isArray(plan.steps) ? plan.steps : []).slice(0, 4)
        .map(x => ({ ...x, agent: pool.find(a => a.id === x.agent)?.id }))
        .filter(x => x.agent && x.text);
      if (!steps.length) return json(res, 500, { error: 'patron geçerli bir adım üretemedi' });

      bb.write(ROOT, { agent: 'boss', agentName: 'PATRON', kind: 'karar', text: `Brief: ${brief} → ${steps.map(s2 => s2.agent).join(', ')}` });
      console.log(`※ brief → ${steps.map(s2 => s2.agent).join(' → ')}`);

      // 2) adımları sırayla çalıştır — her biri gerçek görev, bütçeye ve deftere tabi
      const done = [];
      for (const st of steps) {
        const a = AGENTS.find(x => x.id === st.agent);
        const gate = ops.check(st.agent);
        if (!gate.ok) { done.push({ ...st, name: a.name, error: true, result: `Bütçe aşıldı ($${gate.spentUSD.toFixed(2)}/$${gate.budgetUSD})` }); continue; }
        const task = { id: nid(), dept: a.department, agent: a.id, title: String(st.title || brief).slice(0, 90), text: st.text,
          plan: [], eta: 10, why: plan.why || '', state: 'doing', addedAt: Date.now(), startedAt: Date.now(), by: 'patron', brief: true };
        const l = load(); l.push(task); save(l);
        try {
          const r = await run(task, null);
          if (r.question) { Object.assign(task, { state: 'waiting', askedAt: Date.now(), question: r.question, result: '' });
            bb.write(ROOT, { agent: a.id, agentName: a.name, kind: 'soru', text: r.question, task: task.id });
            done.push({ ...st, name: a.name, waiting: true, question: r.question, id: task.id });
          } else {
            Object.assign(task, { state: 'done', doneAt: Date.now(), result: r.result, read: r.read, tools: r.tools, used: r.used, skills: r.skills, error: false });
            task.note = writeNote(task);
            bb.write(ROOT, { agent: a.id, agentName: a.name, kind: 'not', text: r.result.replace(/\s+/g, ' ').slice(0, 300), task: task.id });
            done.push({ ...st, name: a.name, result: r.result, id: task.id });
          }
        } catch (e) {
          Object.assign(task, { state: 'done', doneAt: Date.now(), error: true, result: 'Olmadı: ' + e.message });
          done.push({ ...st, name: a.name, error: true, result: task.result, id: task.id });
        }
        const l2 = load(); const i2 = l2.findIndex(t => t.id === task.id); if (i2 >= 0) l2[i2] = task; save(l2);
      }
      await rebuildGraph();

      // 3) patron birleştirir
      let summary = '';
      const usable = done.filter(d => d.result && !d.error && !d.waiting);
      if (usable.length) {
        try {
          summary = await ask(
            `Sen ${cfg.name} ofisinin patronusun. Ekibinin çıktılarını sahibine tek bir cevap olarak birleştir. ` +
            'Kim ne yaptı diye anlatma; işin kendisini ver. En fazla 200 kelime, düz metin, önsöz yok.',
            `Sahibinin talimatı: ${brief}\n\n` + usable.map(d => `--- ${d.name} ---\n${d.result}`).join('\n\n'),
            { maxTokens: 1200, timeout: 240000 });
        } catch (e) { summary = '(patron birleştiremedi: ' + e.message + ')'; }
      }
      return json(res, 200, { brief, why: plan.why || '', steps: done, summary,
        waiting: done.filter(d => d.waiting).map(d => ({ id: d.id, agent: d.agent, question: d.question })) });
    }
    /* ---------- PATRON: tek muhatap ----------
       Sen 35 ajanla tek tek konuşmuyorsun. Patronla konuşuyorsun; işi o dağıtıyor,
       sonucu o topluyor. Sohbet sunucuda durur — telefondan da masaüstünden de aynı sohbet. */
    if (url.pathname === '/api/patron' && req.method === 'GET')
      return json(res, 200, { history: patron.readHistory(DATA), name: cfg.name });

    if (url.pathname === '/api/patron' && req.method === 'DELETE') {
      patron.clearHistory(DATA);
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/patron' && req.method === 'POST') {
      const { text } = await body(req);
      if (!text || !String(text).trim()) return json(res, 400, { error: 'boş mesaj' });
      const msg = String(text).trim();
      refreshSkills();

      const hist = patron.readHistory(DATA);
      hist.push({ who: 'sen', text: msg, ts: Date.now() });

      const list = load();
      const board = patron.boardText({ tasks: list, agents: AGENTS, depts: DEPTS, ops: ops.report() });
      const rosterTxt = AGENTS.map(a => `${a.id} · ${a.name} (${DEPTS[a.department].name}) — ${a.does}`).join('\n');
      const business = businessContext(ownerIndex()); // SADECE senin notların — ajan çıktısı değil
      const system = patron.systemPrompt({ name: cfg.name, board, roster: rosterTxt, business });
      const convo = hist.slice(-10).map(m => `${m.who === 'sen' ? 'SAHİBİ' : 'PATRON'}: ${m.text}`).join('\n');

      let raw;
      try { raw = await ask(system, convo + '\nPATRON:', { maxTokens: 1400, timeout: 240000, agent: '_office' }); }
      catch (e) {
        patron.writeHistory(DATA, hist);
        return json(res, 500, { error: 'patron cevap veremedi: ' + e.message });
      }

      const { reply, orders } = patron.harvestOrders(raw, DEPT_KEYS);

      // GÖREV satırlarını GERÇEK göreve çevir — aynı yönlendirici, aynı bütçe, aynı defter.
      const created = [];
      for (const o of orders) {
        try {
          const r = await route(o.dept, o.text);
          const task = { id: nid(), dept: o.dept, agent: r.agent, title: r.title, text: o.text,
            plan: r.plan, eta: r.eta, why: r.why, state: 'next', addedAt: Date.now(), by: 'patron' };
          const l = load(); l.push(task); save(l);
          const ag = AGENTS.find(x => x.id === r.agent);
          created.push({ id: task.id, agent: r.agent, agentName: ag?.name || r.agent, dept: o.dept, title: r.title });
          bb.write(ROOT, { agent: 'boss', agentName: 'PATRON', kind: 'karar', text: `${ag?.name || r.agent} → ${r.title}` });
        } catch (e) {
          created.push({ error: 'dağıtılamadı: ' + e.message, dept: o.dept, title: o.text });
        }
      }

      const full = reply + (created.length
        ? '\n\n' + created.map(c => c.error ? `⚠ ${c.title} — ${c.error}` : `→ ${c.agentName}: ${c.title}`).join('\n')
        : '');
      hist.push({ who: 'patron', text: full, ts: Date.now(), tasks: created.filter(c => !c.error) });
      patron.writeHistory(DATA, hist);
      return json(res, 200, { reply: full, tasks: created, history: hist.slice(-10) });
    }

    // Telefon için sade sayfa — 3B ofis mobilde ağır; burası sadece patron sohbeti.
    if (url.pathname === '/patron' || url.pathname === '/telefon') {
      const p = path.join(ROOT, 'patron.html');
      if (fs.existsSync(p)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(p)); }
      return json(res, 404, { error: 'patron.html yok' });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
});
server.listen(cfg.port, () => {
  console.log(`Agents Office ${version} → http://localhost:${cfg.port}`);
  console.log(`  business: ${cfg.name}   brain: ${BRAIN} (${graph.notes} notes, ${graph.links.length} links)   claude: ${backend}${cfg.model ? ' · ' + cfg.model : ''}`);
  console.log(`  tasks: ${FILE}   notes the agents write: ${NOTES_DIR}`);
  console.log(`  agents: 35 (${roster.customised} customised${roster.briefed ? ', ' + roster.briefed + ' briefed' : ''}${roster.files.length ? ' via ' + roster.files.join(' + ') : ''})   tools: ${backend === 'claude-cli' ? 'connected MCP servers' + (cfg.tools?.web === false ? '' : ' + web') : 'none on the API backend'}`);
  const sk = skills.summary(); const setup = setupMap(); const notYet = DEPT_KEYS.filter(k => !setup[k]);
  console.log(`  skills: ${sk.count} (${sk.shipped} shipped in skills/, ${sk.brain} in ${path.join(NOTES_DIR, 'skills')})${sk.problems.length ? '   ⚠ ' + sk.problems.length + ' problem' + (sk.problems.length > 1 ? 's' : '') + ' — see npm run check' : ''}`);
  console.log(`  set up: ${notYet.length === DEPT_KEYS.length ? 'no department yet — open a lead\'s chat and say "set up"' : notYet.length ? DEPT_KEYS.length - notYet.length + ' of 6 departments (not yet: ' + notYet.map(k => DEPTS[k].name).join(', ') + ')' : 'all six departments'}   lessons: ${learn.dir(BRAIN)}`);
});
