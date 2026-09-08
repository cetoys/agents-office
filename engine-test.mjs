// engine-test.mjs — üç motoru da ayrı ayrı dene: OpenClaw gateway, Ollama, Claude Code CLI.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROMPT = 'Reply with exactly: OK';
const log = (...a) => console.log(...a);

function run(cmd, args, { timeout = 120000, cwd } = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill(); resolve({ code: -1, out, err: err + '\n[TIMEOUT]' }); }, timeout);
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); resolve({ code: -2, out, err: e.message }); });
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

// 1) OpenClaw — mesajı dosyadan ver, tırnak sorunu olmasın
const mf = path.join(os.tmpdir(), 'oc-msg.txt');
fs.writeFileSync(mf, PROMPT, 'utf8');
for (const model of ['zai/glm-4.7', 'openrouter/anthropic/claude-3.5-sonnet']) {
  const r = await run('openclaw', ['agent', '--agent', 'main', '--model', model, '--message-file', mf, '--json'], { timeout: 150000 });
  let brief = r.out.replace(/\x1b\[[0-9;]*m/g, '').trim();
  try { const j = JSON.parse(brief.slice(brief.indexOf('{'), brief.lastIndexOf('}') + 1)); brief = 'JSON keys=' + Object.keys(j).join(',') + ' | text=' + JSON.stringify(j.text || j.reply || j.message || j.result || '').slice(0, 120) + ' | usage=' + JSON.stringify(j.usage || j.tokens || null); } catch { brief = brief.slice(-400); }
  log(`\n[OPENCLAW ${model}] code=${r.code}\n  ${brief}${r.err ? '\n  ERR: ' + r.err.replace(/\x1b\[[0-9;]*m/g,'').trim().slice(-300) : ''}`);
}

// 2) Ollama — HTTP, yerel
for (const model of ['hf.co/llmfan46/gemma-4-E2B-it-ultra-uncensored-heretic-GGUF:Q4_K_M']) {
  try {
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], stream: false }),
    });
    const j = await res.json();
    log(`\n[OLLAMA ${model.split('/').pop()}] http=${res.status} ${((Date.now()-t0)/1000).toFixed(1)}s`);
    log('  yanit:', JSON.stringify((j.message?.content || j.error || '').slice(0, 120)));
    log('  tokens: prompt=' + j.prompt_eval_count + ' eval=' + j.eval_count);
  } catch (e) { log(`\n[OLLAMA] HATA: ${e.message}`); }
}

// 3) Claude Code CLI — mevcut abonelik
{
  const cwd = path.join(os.tmpdir(), 'agents-office-cli', '_probe');
  fs.mkdirSync(cwd, { recursive: true });
  const r = await run('claude', ['-p', PROMPT, '--output-format', 'json'], { cwd, timeout: 150000 });
  let brief = r.out.trim();
  try { const j = JSON.parse(brief); brief = (j.is_error ? 'FAIL ' : 'OK ') + String(j.result).slice(0, 80) + ' | cost=' + j.total_cost_usd; } catch { brief = brief.slice(-300); }
  log(`\n[CLAUDE CLI] code=${r.code}\n  ${brief}`);
}
log('\nBITTI');
