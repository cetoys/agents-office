// engines.mjs — bir ajan, bir motor.
// Her ajan kendi sağlayıcısında koşar: Claude Code (abonelik), Ollama (yerel, bedava),
// OpenClaw gateway (çok sağlayıcılı), ya da OpenAI uyumlu herhangi bir uç (Cerebras, Groq,
// OpenRouter...). Hepsi aynı sözleşmeyi döndürür:  { text, tools, usage: [row...] }
//
// API anahtarları buraya YAZILMAZ. OpenAI uyumlu motorlar anahtarı yalnızca bir ortam
// değişkeni ADIYLA tanır (`apiKeyEnv`); değeri sen kabuğunda/sisteminde tanımlarsın.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const now = () => Date.now();
const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, '');

/* ---------- ortak: bir süreç çalıştır ---------- */
function exec(cmd, args, { cwd, timeout = 300000, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: env || process.env, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} ${timeout / 1000} saniyeyi aştı`)); }, timeout);
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); reject(new Error(e.code === 'ENOENT' ? `${cmd} bulunamadı (PATH'te yok)` : e.message)); });
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
  });
}
const row = (o) => ({ ts: now(), agent: o.agent || null, engine: o.engine, model: o.model || '?',
  in: o.in || 0, out: o.out || 0, cr: o.cr || 0, cw5: o.cw5 || 0, cw1h: o.cw1h || 0, costUSD: o.costUSD });

/* ---------- 1. Claude Code CLI (senin aboneliğin) ---------- */
async function claudeCli({ system, user, agent, model, maxTokens, timeout, allowedTools, allowSkills, cwdRoot, onInit }) {
  const cwd = path.join(cwdRoot, String(agent || '_office'));
  fs.mkdirSync(cwd, { recursive: true });
  const args = ['-p', user, '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--system-prompt', system,
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,Agent,NotebookEdit,Task' + (allowedTools?.includes('WebFetch') ? '' : ',WebFetch,WebSearch')];
  const allow = [...(allowedTools || [])];
  if (allowSkills) allow.push('Skill'); // kurulu eklentilerin hazır skill'leri (sales:, legal:, marketing: ...)
  if (allow.length) args.push('--allowedTools', allow.join(','));
  if (model) args.push('--model', model);
  const env = { ...process.env }; delete env.CLAUDECODE;

  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '', text = '', used = [], usage = [], got = false;
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`Claude ${timeout / 1000} saniyeyi aştı`)); }, timeout);
    const feed = line => {
      if (!line.trim()) return;
      let j; try { j = JSON.parse(line); } catch { return; }
      if (j.type === 'system' && j.subtype === 'init') onInit?.(j);
      if (j.type === 'assistant' && j.message?.content) for (const b of j.message.content) if (b.type === 'tool_use' && b.name && !used.includes(b.name)) used.push(b.name);
      if (j.type === 'assistant' && j.message?.usage && j.message.model !== '<synthetic>') {
        const u = j.message.usage;
        usage.push(row({ agent, engine: 'claude-cli', model: j.message.model,
          in: u.input_tokens, out: u.output_tokens, cr: u.cache_read_input_tokens,
          cw5: u.cache_creation?.ephemeral_5m_input_tokens ?? u.cache_creation_input_tokens,
          cw1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0 }));
      }
      if (j.type === 'result') { got = true; text = String(j.result || '').trim(); if (j.is_error && !text) text = ''; }
    };
    p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? 'Claude Code kurulu değil' : e.message)); });
    p.on('close', code => {
      clearTimeout(timer); feed(buf);
      if (code !== 0 && !got) return reject(Object.assign(new Error(`claude çıkış ${code}${err ? ': ' + err.trim().slice(0, 200) : ''}`), { usage }));
      resolve({ text, tools: used, usage });
    });
  });
}

/* ---------- 2. Ollama (yerel, bedava) ---------- */
async function ollama({ system, user, agent, model, host = 'http://127.0.0.1:11434', timeout }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(host + '/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await res.json();
    if (!res.ok || j.error) throw new Error('Ollama: ' + (j.error || res.status));
    return {
      text: String(j.message?.content || '').trim(), tools: [],
      usage: [row({ agent, engine: 'ollama', model: 'ollama/' + model, in: j.prompt_eval_count, out: j.eval_count, costUSD: 0 })],
    };
  } finally { clearTimeout(t); }
}

/* ---------- 3. OpenClaw gateway (çok sağlayıcı) ---------- */
async function openclaw({ system, user, agent, model, ocAgent = 'main', timeout }) {
  const f = path.join(os.tmpdir(), `oc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
  fs.writeFileSync(f, system + '\n\n---\n\n' + user, 'utf8');
  try {
    const args = ['agent', '--agent', ocAgent, '--message-file', f, '--json'];
    if (model) args.push('--model', model);
    const r = await exec('openclaw', args, { timeout });
    const s = strip(r.out).trim();
    let j = null; try { j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { /* düz metin */ }
    const text = String(j?.text ?? j?.reply ?? j?.message ?? j?.result ?? (j ? '' : s)).trim();
    if (!text) throw new Error('OpenClaw boş döndü: ' + strip(r.err || s).trim().split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 220));
    const u = j?.usage || {};
    return { text, tools: [], usage: [row({ agent, engine: 'openclaw', model: 'openclaw/' + (model || 'default'),
      in: u.input_tokens ?? u.prompt_tokens, out: u.output_tokens ?? u.completion_tokens })] };
  } finally { try { fs.unlinkSync(f); } catch {} }
}

/* ---------- 4. OpenAI uyumlu herhangi bir uç (Cerebras, Groq, OpenRouter, LM Studio...) ---------- */
async function openaiCompat({ system, user, agent, model, baseUrl, apiKeyEnv, maxTokens, timeout, priceIn = 0, priceOut = 0 }) {
  const key = apiKeyEnv ? process.env[apiKeyEnv] : null;
  if (apiKeyEnv && !key) throw new Error(`${apiKeyEnv} ortam değişkeni tanımlı değil — anahtarı sen tanımlamalısın`);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const text = String(j.choices?.[0]?.message?.content || '').trim();
    const u = j.usage || {};
    const inTok = u.prompt_tokens || 0, outTok = u.completion_tokens || 0;
    return { text, tools: [], usage: [row({ agent, engine: 'openai-compat', model: (j.model || model),
      in: inTok, out: outTok, costUSD: (inTok * priceIn + outTok * priceOut) / 1e6 })] };
  } finally { clearTimeout(t); }
}

/* ---------- yönlendirici ---------- */
export const ENGINE_KINDS = { 'claude-cli': claudeCli, ollama, openclaw, 'openai-compat': openaiCompat };

export function loadEngines(root) {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return null; } };
  const base = read('office.engines.json') || {};
  const local = read('office.engines.local.json') || {};
  return { default: 'claude', ...base, ...local, engines: { ...(base.engines || {}), ...(local.engines || {}) } };
}

// engineName → çalıştır. Bilinmeyen motor açıkça hata verir, sessizce Claude'a düşmez.
export async function callEngine(cfg, name, opts) {
  const e = cfg.engines?.[name];
  if (!e) throw new Error(`Bilinmeyen motor: "${name}" (office.engines.json içinde tanımlı değil)`);
  const fn = ENGINE_KINDS[e.kind];
  if (!fn) throw new Error(`Bilinmeyen motor türü: "${e.kind}"`);
  const t0 = now();
  const r = await fn({ ...e, ...opts, model: opts.modelOverride || e.model });
  return { ...r, engine: name, kind: e.kind, ms: now() - t0 };
}
