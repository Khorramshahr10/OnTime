#!/usr/bin/env node
/**
 * Local grunt-work delegate — sends a bounded task to the local Ollama
 * model instead of burning API tokens on it.
 *
 * ── What this is ─────────────────────────────────────────────────────
 *
 * Talks to Ollama's OpenAI-compatible endpoint (keyless, local) running
 * qwen3.8-code-worker — a 27B model with a 32k context window. This
 * script assembles the prompt itself (reads --file contents, builds
 * --diff) so the caller never has to paste file bodies into a Claude
 * prompt just to hand them to qwen.
 *
 * qwen is a grunt worker, never the author of record. Every output it
 * produces gets reviewed before use, and every task gets dispositioned
 * in docs/qwen-task-log.jsonl — accepted / rewritten / rejected — so
 * "how is qwen doing" is answerable from evidence, not vibes. See
 * docs/qwen-workflow.md for the division-of-labor rules.
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *
 *   node scripts/qwen-worker.mjs "instruction" --file src/services/x.ts
 *   node scripts/qwen-worker.mjs "instruction" --file a.ts --file b.ts
 *   node scripts/qwen-worker.mjs "review this diff" --diff              # vs HEAD
 *   node scripts/qwen-worker.mjs "review this diff" --diff main         # vs a ref
 *   node scripts/qwen-worker.mjs "..." --file x.ts --out src/__tests__/x.test.ts
 *   node scripts/qwen-worker.mjs "..." --file x.ts --system "custom system prompt"
 *   node scripts/qwen-worker.mjs "..." --file x.ts --max-output 16000  # reasoning-heavy task
 *
 * Requires Ollama running locally with qwen3.8-code-worker pulled
 * (`ollama list` to check, `ollama run qwen3.8-code-worker "hi"` to warm
 * it). CPU inference is slow (minutes) — run this in the background.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Agent } from 'undici';

const OLLAMA_URL = 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = 'qwen3.8-code-worker';
// Baked into the model (num_predict 8192), but the server honors a higher
// client-supplied max_tokens (verified: a request with max_tokens=16000
// returned finish_reason=stop, not capped at 8192). Thinking is always-on
// via the /v1 endpoint and eats into whatever budget is set — a
// reasoning-heavy task can silently exhaust 8192 tokens on thinking alone
// and return empty content with finish_reason=length. Pass --max-output
// for those tasks; keep --file/--diff input small enough that
// input + output stays under the model's 32768 num_ctx.
const DEFAULT_MAX_TOKENS = 8192;
// Baked into the model (num_ctx 32768); leave headroom for output.
const MAX_CONTEXT_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // CPU inference is slow

const DEFAULT_SYSTEM_PROMPT =
  'You are a grunt-work coding assistant for OnTime, a React + TypeScript + Vite ' +
  'prayer-times app (Capacitor for Android/iOS). Tests use Vitest + React Testing ' +
  'Library, written as user stories (see existing tests in src/__tests__/ for style ' +
  '— describe blocks named "User story: ..."). Capacitor plugins are mocked in ' +
  'src/test/setup.ts. Follow the existing code style exactly: no comments unless ' +
  'explaining a non-obvious WHY, no unnecessary abstractions. Output ONLY the ' +
  'requested code or review — no preamble, no "Here is...", no markdown fences ' +
  'around file output unless explicitly asked for a fenced snippet.';

function parseArgs(argv) {
  const args = { files: [], diff: undefined, out: undefined, system: undefined, timeoutMs: DEFAULT_TIMEOUT_MS, maxTokens: DEFAULT_MAX_TOKENS, task: undefined };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') {
      args.files.push(argv[++i]);
    } else if (a === '--diff') {
      // Optional ref may follow; if the next token looks like another flag
      // or is missing, default to HEAD.
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.diff = next;
        i++;
      } else {
        args.diff = true; // bare --diff: working tree vs HEAD
      }
    } else if (a === '--out') {
      args.out = argv[++i];
    } else if (a === '--system') {
      args.system = argv[++i];
    } else if (a === '--timeout') {
      args.timeoutMs = Number(argv[++i]) * 1000;
    } else if (a === '--max-output') {
      args.maxTokens = Number(argv[++i]);
    } else {
      rest.push(a);
    }
  }
  args.task = rest.join(' ');
  return args;
}

function git(...cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Read --file paths and/or a --diff, dropping largest content first if over budget. */
function buildPrompt(task, { files, diff }) {
  const sections = [`## Task\n${task}\n`];
  const truncated = [];
  let budget = MAX_CONTEXT_CHARS - sections[0].length;

  if (diff) {
    // `diff === true` means bare `--diff`: working tree vs HEAD (one-arg
    // form). A ref string means comparing two commits (`git diff ref HEAD`).
    const diffText = diff === true ? git('diff', 'HEAD') : git('diff', diff, 'HEAD');
    const label = diff === true ? 'working tree vs HEAD' : `${diff}..HEAD`;
    const block = `## Diff (${label})\n\`\`\`diff\n${diffText}\n\`\`\`\n`;
    sections.push(block);
    budget -= block.length;
  }

  const fileBlocks = files.map((path) => {
    if (!existsSync(path)) throw new Error(`--file not found: ${path}`);
    const content = readFileSync(path, 'utf8');
    return { path, content, block: `## Current content of ${path}\n\`\`\`\n${content}\n\`\`\`\n` };
  });
  // Smallest first: keep as much as fits, drop the largest when over budget.
  const bySize = [...fileBlocks].sort((a, b) => a.block.length - b.block.length);
  for (const f of bySize) {
    if (f.block.length <= budget) {
      sections.push(f.block);
      budget -= f.block.length;
    } else {
      truncated.push(f.path);
    }
  }
  if (truncated.length) {
    sections.push(`(Content of ${truncated.join(', ')} omitted for length.)\n`);
  }
  return { prompt: sections.join('\n'), truncated };
}

async function callOllama(systemPrompt, userPrompt, timeoutMs, maxTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ollama', // keyless endpoint; header ignored but required by some clients
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
      // Node's default undici Agent kills the connection if no response
      // headers arrive within 5 minutes. A non-streaming chat completion
      // can't send headers until the model has FULLY finished (it needs the
      // final Content-Length), so any prompt whose prefill+generation runs
      // past 5 min gets killed as "fetch failed" even though the model is
      // still working. Match the dispatcher's timeouts to the caller's own
      // --timeout instead of Node's default.
      dispatcher: new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs }),
    });
    if (!res.ok) throw new Error(`Ollama API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const out = await res.json();
    return { out, wallSeconds: (Date.now() - t0) / 1000 };
  } finally {
    clearTimeout(timer);
  }
}

function logSkeleton(task, files, diff, usage, wallSeconds, truncated, finishReason) {
  return {
    date: new Date().toISOString().slice(0, 10),
    task: task.slice(0, 200),
    files,
    diff: diff === true ? 'working-tree' : (diff ?? null),
    model: MODEL,
    tokens_in: usage?.prompt_tokens ?? null,
    tokens_out: usage?.completion_tokens ?? null,
    wall_seconds: Math.round(wallSeconds),
    truncated_input: truncated.length ? truncated : undefined,
    finish_reason: finishReason,
    disposition: null, // fill in: 'accepted' | 'rewritten' | 'rejected'
    note: null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.task) {
    console.error('Usage: node scripts/qwen-worker.mjs "instruction" [--file path]... [--diff [ref]] [--out path] [--timeout seconds] [--max-output tokens]');
    process.exitCode = 1;
    return;
  }
  if (!args.files.length && !args.diff) {
    console.error('warning: no --file or --diff given — qwen will see only the task text, no code context');
  }

  const { prompt, truncated } = buildPrompt(args.task, args);
  if (truncated.length) {
    console.error(`note: file contents omitted for length: ${truncated.join(', ')}`);
  }

  console.error(`Sending to ${MODEL} (this can take minutes on CPU)...`);
  const { out, wallSeconds } = await callOllama(args.system ?? DEFAULT_SYSTEM_PROMPT, prompt, args.timeoutMs, args.maxTokens);

  const choice = out.choices?.[0];
  const content = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason;

  if (!content.trim()) {
    console.error(`empty response (finish_reason=${finishReason}) — model produced nothing, retry`);
    process.exitCode = 1;
    return;
  }
  if (finishReason && finishReason !== 'stop') {
    console.error(`WARNING: finish_reason=${finishReason} — output below is likely TRUNCATED (qwen's thinking mode can exhaust the token budget); treat as incomplete`);
  }

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, content);
    console.error(`Wrote output to ${args.out} (${wallSeconds.toFixed(0)}s, ${out.usage?.completion_tokens ?? '?'} tokens out)`);
  } else {
    console.log(content);
  }

  console.error('\n──── log entry skeleton (disposition it, append to docs/qwen-task-log.jsonl) ────');
  console.error(JSON.stringify(logSkeleton(args.task, args.files, args.diff, out.usage, wallSeconds, truncated, finishReason)));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
