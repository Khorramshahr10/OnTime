# DeepSeek V4 Pro Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that lets Claude Code delegate implementation tasks to DeepSeek V4 Pro, manages the Q&A loop, commits DeepSeek's output to a dedicated branch, runs review checks, and opens a PR to `dev`.

**Architecture:** Node.js + TypeScript run via `tsx` (no build step). Lives at `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/`. Per-project config in `<project>/.deepseek-orchestrator.json`. Talks to DeepSeek's OpenAI-compatible `/v1/chat/completions`. Uses `git worktree` for isolation, `gh` for PR creation. Light unit tests for the response parser and API client (the risky parts); thin shells over `git`/`gh` are validated by the smoke test.

**Tech Stack:** Node 20+, TypeScript 5, `tsx`, `vitest`, `zod` for response validation, `node:child_process` for git/gh, `fetch` for DeepSeek API.

---

## File Structure

```
~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── bin/deepseek-orchestrator      # tsx shim
├── src/
│   ├── cli.ts                     # arg parsing, dispatches to handlers
│   ├── config.ts                  # loads ~/.deepseek/key + project config
│   ├── api.ts                     # DeepSeek HTTP client
│   ├── parser.ts                  # parses DeepSeek's QUESTIONS/PLAN/FILES output
│   ├── context.ts                 # builds curated prompt
│   ├── git.ts                     # branch/worktree/commit/PR helpers
│   ├── review.ts                  # runs lint/tsc/test, classifies failures
│   ├── session.ts                 # one task lifecycle, persists to transcripts/
│   ├── transcript.ts              # append-only JSONL log per task
│   └── prompts/
│       ├── system.md
│       ├── brief.md
│       └── code-review.md
├── tests/
│   ├── parser.test.ts
│   └── api.test.ts
└── transcripts/                   # gitignored
```

In OnTime:
```
OnTime/.deepseek-orchestrator.json   # per-project config
OnTime/.gitignore                    # add transcripts/ exclusion if relevant
```

---

## Task 1: Scaffold tool directory and package

**Files:**
- Create: `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/package.json`
- Create: `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/tsconfig.json`
- Create: `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/.gitignore`
- Create: `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator`

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p "/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator"
cd "/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator"
mkdir -p src/prompts tests bin transcripts
```

`package.json`:
```json
{
  "name": "deepseek-orchestrator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "deepseek-orchestrator": "./bin/deepseek-orchestrator"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tsx": "^4.19.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
transcripts/
*.log
```

- [ ] **Step 4: Create executable shim at bin/deepseek-orchestrator**

```bash
#!/usr/bin/env -S npx tsx
import "../src/cli.ts";
```

Then: `chmod +x bin/deepseek-orchestrator`

- [ ] **Step 5: Install deps**

Run: `npm install`
Expected: lockfile created, no errors.

- [ ] **Step 6: Init git inside the tool directory and commit**

```bash
git init -b main
git add .
git commit -m "chore: scaffold deepseek-orchestrator package"
```

---

## Task 2: Config loader (TDD)

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing test for config loading**

`tests/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadConfig", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ds-cfg-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loads project config and resolves API key", () => {
    const keyFile = join(dir, "key");
    writeFileSync(keyFile, "DEEPSEEK_API_KEY=sk-test\n");
    const projectFile = join(dir, ".deepseek-orchestrator.json");
    writeFileSync(projectFile, JSON.stringify({
      dev_branch: "dev",
      lint_cmd: "npm run lint",
      typecheck_cmd: "npx tsc --noEmit",
      test_cmd: "npm test",
      context_excludes: ["node_modules"]
    }));
    const cfg = loadConfig({ projectDir: dir, keyPath: keyFile });
    expect(cfg.apiKey).toBe("sk-test");
    expect(cfg.project.dev_branch).toBe("dev");
    expect(cfg.model).toBe("deepseek-v4-pro");
  });

  it("throws clearly when key is missing", () => {
    expect(() => loadConfig({ projectDir: dir, keyPath: join(dir, "nope") }))
      .toThrow(/API key not found/);
  });

  it("throws clearly when project config is missing", () => {
    const keyFile = join(dir, "key");
    writeFileSync(keyFile, "DEEPSEEK_API_KEY=sk-x\n");
    expect(() => loadConfig({ projectDir: dir, keyPath: keyFile }))
      .toThrow(/\.deepseek-orchestrator\.json not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `loadConfig` is not defined.

- [ ] **Step 3: Implement src/config.ts**

```typescript
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ProjectConfigSchema = z.object({
  dev_branch: z.string().default("dev"),
  lint_cmd: z.string(),
  typecheck_cmd: z.string(),
  test_cmd: z.string(),
  conventions_path: z.string().optional(),
  context_excludes: z.array(z.string()).default([])
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export interface OrchestratorConfig {
  apiKey: string;
  model: string;
  apiBase: string;
  projectDir: string;
  project: ProjectConfig;
}

export function loadConfig(opts: {
  projectDir: string;
  keyPath?: string;
}): OrchestratorConfig {
  const keyPath = opts.keyPath ?? `${process.env.HOME}/.deepseek/key`;
  if (!existsSync(keyPath)) {
    throw new Error(`API key not found at ${keyPath}`);
  }
  const raw = readFileSync(keyPath, "utf8");
  const match = raw.match(/^DEEPSEEK_API_KEY=(.+)$/m);
  if (!match) throw new Error(`API key not found in ${keyPath}`);
  const apiKey = match[1].trim();

  const projectFile = join(opts.projectDir, ".deepseek-orchestrator.json");
  if (!existsSync(projectFile)) {
    throw new Error(`.deepseek-orchestrator.json not found in ${opts.projectDir}`);
  }
  const project = ProjectConfigSchema.parse(
    JSON.parse(readFileSync(projectFile, "utf8"))
  );

  return {
    apiKey,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    apiBase: process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com",
    projectDir: opts.projectDir,
    project
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/config.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(config): load API key and project config"
```

---

## Task 3: Response parser (TDD — riskiest piece)

DeepSeek returns free-form text. We need a strict parser for the protocol: either a `QUESTIONS:` block or a `PLAN:` + `FILES:` block.

**Files:**
- Create: `src/parser.ts`
- Create: `tests/parser.test.ts`

- [ ] **Step 1: Write failing tests covering all parser shapes**

`tests/parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseDeepseekResponse } from "../src/parser.ts";

describe("parseDeepseekResponse", () => {
  it("parses a QUESTIONS block", () => {
    const text = `QUESTIONS:
- What's the existing toast component?
- Should the snooze default to 5 or 10 minutes?`;
    const r = parseDeepseekResponse(text);
    expect(r.kind).toBe("questions");
    if (r.kind !== "questions") return;
    expect(r.questions).toEqual([
      "What's the existing toast component?",
      "Should the snooze default to 5 or 10 minutes?"
    ]);
  });

  it("parses a PLAN + FILES block with one file", () => {
    const text = [
      "PLAN: Add snooze button to notification handler.",
      "",
      "FILES:",
      "",
      "\`\`\`ts path=src/notifications/handler.ts",
      "export function handler() { return 1; }",
      "\`\`\`"
    ].join("\n");
    const r = parseDeepseekResponse(text);
    expect(r.kind).toBe("implementation");
    if (r.kind !== "implementation") return;
    expect(r.plan).toMatch(/snooze/);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].path).toBe("src/notifications/handler.ts");
    expect(r.files[0].contents).toContain("export function handler");
  });

  it("parses multiple files", () => {
    const text = [
      "PLAN: x",
      "FILES:",
      "\`\`\`ts path=a.ts",
      "export const a = 1;",
      "\`\`\`",
      "\`\`\`ts path=b.ts",
      "export const b = 2;",
      "\`\`\`"
    ].join("\n");
    const r = parseDeepseekResponse(text);
    if (r.kind !== "implementation") throw new Error("wrong kind");
    expect(r.files.map(f => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns malformed when output has neither block", () => {
    const r = parseDeepseekResponse("hello, I'm DeepSeek!");
    expect(r.kind).toBe("malformed");
  });

  it("returns malformed when FILES block has no path tag", () => {
    const text = [
      "PLAN: x",
      "FILES:",
      "\`\`\`ts",
      "code",
      "\`\`\`"
    ].join("\n");
    const r = parseDeepseekResponse(text);
    expect(r.kind).toBe("malformed");
  });

  it("rejects path tags that escape the working tree", () => {
    const text = [
      "PLAN: x",
      "FILES:",
      "\`\`\`ts path=../escape.ts",
      "x",
      "\`\`\`"
    ].join("\n");
    const r = parseDeepseekResponse(text);
    expect(r.kind).toBe("malformed");
  });

  it("rejects absolute path tags", () => {
    const text = [
      "PLAN: x",
      "FILES:",
      "\`\`\`ts path=/etc/passwd",
      "x",
      "\`\`\`"
    ].join("\n");
    const r = parseDeepseekResponse(text);
    expect(r.kind).toBe("malformed");
  });
});
```

> Note: backticks inside the test fixtures above are escaped as `\`\`\`` so they don't break the markdown plan; the test file should contain literal triple backticks. The agent implementing the task should write triple backticks (`` ``` ``) where the plan shows `\`\`\``.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/parser.test.ts`
Expected: FAIL — `parseDeepseekResponse` not defined.

- [ ] **Step 3: Implement src/parser.ts**

```typescript
export type ParsedResponse =
  | { kind: "questions"; questions: string[] }
  | { kind: "implementation"; plan: string; files: { path: string; contents: string }[] }
  | { kind: "malformed"; reason: string };

const FENCE = "```";

export function parseDeepseekResponse(text: string): ParsedResponse {
  const trimmed = text.trim();

  if (/^QUESTIONS:/m.test(trimmed)) {
    const after = trimmed.split(/^QUESTIONS:\s*$/m)[1] ?? "";
    const lines = after.split("\n").map(l => l.trim()).filter(Boolean);
    const questions = lines
      .filter(l => l.startsWith("-"))
      .map(l => l.replace(/^-\s*/, ""));
    if (questions.length === 0) {
      return { kind: "malformed", reason: "QUESTIONS block had no items" };
    }
    return { kind: "questions", questions };
  }

  if (/^PLAN:/m.test(trimmed) && /^FILES:/m.test(trimmed)) {
    const planMatch = trimmed.match(/^PLAN:\s*([\s\S]*?)(?=^FILES:)/m);
    const plan = planMatch?.[1]?.trim() ?? "";
    const filesSection = trimmed.split(/^FILES:\s*$/m)[1] ?? "";

    const files: { path: string; contents: string }[] = [];
    const fenceRegex = new RegExp(
      "```[a-zA-Z0-9_+-]*\\s+path=([^\\s`]+)\\n([\\s\\S]*?)\\n```",
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = fenceRegex.exec(filesSection)) !== null) {
      const path = m[1];
      if (path.startsWith("/") || path.includes("..") || path.startsWith("~")) {
        return { kind: "malformed", reason: `unsafe path: ${path}` };
      }
      files.push({ path, contents: m[2] });
    }
    if (files.length === 0) {
      return { kind: "malformed", reason: "FILES block contained no fenced files with path= tags" };
    }
    return { kind: "implementation", plan, files };
  }

  return { kind: "malformed", reason: "no QUESTIONS or PLAN+FILES block found" };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run tests/parser.test.ts`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts tests/parser.test.ts
git commit -m "feat(parser): parse DeepSeek QUESTIONS/PLAN+FILES protocol"
```

---

## Task 4: API client (TDD with mocked fetch)

**Files:**
- Create: `src/api.ts`
- Create: `tests/api.test.ts`

- [ ] **Step 1: Write failing test**

`tests/api.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chat } from "../src/api.ts";

describe("chat", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts to /v1/chat/completions and returns assistant content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "hello" } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await chat({
      apiKey: "sk-x",
      apiBase: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(r.content).toBe("hello");
    expect(r.usage.total_tokens).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer sk-x",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("retries on 5xx then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await chat({
      apiKey: "x", apiBase: "https://x", model: "m",
      messages: [{ role: "user", content: "hi" }],
      retryDelayMs: 0
    });
    expect(r.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 failed attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat({
      apiKey: "x", apiBase: "https://x", model: "m",
      messages: [{ role: "user", content: "hi" }],
      retryDelayMs: 0
    })).rejects.toThrow(/DeepSeek API failed after 3 attempts/);
  });

  it("does NOT retry on 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat({
      apiKey: "x", apiBase: "https://x", model: "m",
      messages: [{ role: "user", content: "hi" }],
      retryDelayMs: 0
    })).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/api.test.ts`
Expected: FAIL — `chat` not defined.

- [ ] **Step 3: Implement src/api.ts**

```typescript
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  apiKey: string;
  apiBase: string;
  model: string;
  messages: Message[];
  temperature?: number;
  retryDelayMs?: number;
}

export interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function chat(opts: ChatOpts): Promise<ChatResult> {
  const url = `${opts.apiBase}/v1/chat/completions`;
  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2
  });
  const delay = opts.retryDelayMs ?? 1000;

  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json"
      },
      body
    });
    if (res.ok) {
      const data = await res.json() as any;
      return {
        content: data.choices?.[0]?.message?.content ?? "",
        usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`DeepSeek API ${res.status}: ${await res.text()}`);
    }
    lastErr = `${res.status}: ${await res.text()}`;
    if (attempt < 3) await new Promise(r => setTimeout(r, delay * attempt));
  }
  throw new Error(`DeepSeek API failed after 3 attempts. Last: ${lastErr}`);
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/api.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts tests/api.test.ts
git commit -m "feat(api): chat completion client with retry on 5xx"
```

---

## Task 5: Prompt templates

**Files:**
- Create: `src/prompts/system.md`
- Create: `src/prompts/brief.md`
- Create: `src/prompts/code-review.md`

- [ ] **Step 1: Write src/prompts/system.md**

```markdown
You are DeepSeek V4 Pro working as a senior implementation engineer. Your tech lead is Claude Code, who briefs you, answers your codebase questions, reviews your code, and decides when to merge.

# Protocol — strict

You MUST reply in exactly one of these two shapes:

## Shape A — you have unanswered questions

Reply ONLY with:

QUESTIONS:
- <question 1>
- <question 2>

No code. No prose around it. One question per line, prefixed with "- ".

## Shape B — you are ready to implement

Reply with:

PLAN: <2-5 sentences describing your approach>

FILES:

```<lang> path=<relative/path/from/repo/root>
<full new file contents>
```

```<lang> path=<another/file>
<full new file contents>
```

Rules:
- Always include the full new contents of every file you modify, not a diff.
- Use a path= tag in the fence info string. Path is relative to the repo root, no `..`, no leading `/`.
- Touch only files in the spec's "Files in scope" list. If you need a file not listed, ask in QUESTIONS first.
- Keep changes minimal. No drive-by refactors. No new dependencies without asking.

# Style

- Match the existing codebase style. If unsure, ask.
- Add tests when the spec asks for them.
- Don't add comments for trivial code.
```

- [ ] **Step 2: Write src/prompts/brief.md**

Template (the orchestrator fills in the `{{...}}` tokens at runtime):

```markdown
# Task: {{task_title}}

## Spec

{{spec_body}}

## Project conventions

{{conventions}}

## Files in scope

{{files_in_scope}}

## Code context (read carefully)

{{code_context}}

---

Reply per the protocol in your system prompt. If you have any uncertainty about the spec, the conventions, or the files, send QUESTIONS first. Otherwise send PLAN + FILES.
```

- [ ] **Step 3: Write src/prompts/code-review.md**

```markdown
# Code review feedback

The code you wrote was reviewed. Here are the issues that need fixes:

{{issues}}

Push a fix-up. Reply with PLAN + FILES per the protocol, including only the files that change.
```

- [ ] **Step 4: Commit**

```bash
git add src/prompts/
git commit -m "feat(prompts): system, brief, and code-review templates"
```

---

## Task 6: Context builder

**Files:**
- Create: `src/context.ts`
- Create: `tests/context.test.ts`

- [ ] **Step 1: Write failing test**

`tests/context.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildBrief } from "../src/context.ts";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("buildBrief", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ds-ctx-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "src/b.ts"), "export const b = 2;\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("inlines files in scope and the spec", () => {
    const brief = buildBrief({
      projectDir: dir,
      taskTitle: "Test task",
      specBody: "Do the thing",
      filesInScope: ["src/a.ts", "src/b.ts"],
      conventions: "Use 2 spaces."
    });
    expect(brief).toContain("# Task: Test task");
    expect(brief).toContain("Do the thing");
    expect(brief).toContain("Use 2 spaces.");
    expect(brief).toContain("src/a.ts");
    expect(brief).toContain("export const a = 1;");
    expect(brief).toContain("src/b.ts");
    expect(brief).toContain("export const b = 2;");
  });

  it("notes missing files instead of crashing", () => {
    const brief = buildBrief({
      projectDir: dir,
      taskTitle: "T",
      specBody: "s",
      filesInScope: ["src/a.ts", "src/missing.ts"],
      conventions: ""
    });
    expect(brief).toContain("(file does not exist yet)");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement src/context.ts**

```typescript
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const TEMPLATE_PATH = new URL("./prompts/brief.md", import.meta.url);

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
  ".json": "json", ".md": "md", ".css": "css", ".html": "html",
  ".py": "python", ".java": "java", ".kt": "kotlin", ".swift": "swift"
};

export function buildBrief(opts: {
  projectDir: string;
  taskTitle: string;
  specBody: string;
  filesInScope: string[];
  conventions: string;
}): string {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const fileBlocks = opts.filesInScope.map(rel => {
    const abs = join(opts.projectDir, rel);
    if (!existsSync(abs)) {
      return `### ${rel}\n\n(file does not exist yet)\n`;
    }
    const lang = LANG_BY_EXT[extname(rel)] ?? "";
    const body = readFileSync(abs, "utf8");
    return `### ${rel}\n\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
  }).join("\n");

  return template
    .replace("{{task_title}}", opts.taskTitle)
    .replace("{{spec_body}}", opts.specBody)
    .replace("{{conventions}}", opts.conventions || "(none provided)")
    .replace("{{files_in_scope}}", opts.filesInScope.map(f => `- ${f}`).join("\n"))
    .replace("{{code_context}}", fileBlocks);
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/context.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/context.ts tests/context.test.ts
git commit -m "feat(context): build task brief by inlining in-scope files"
```

---

## Task 7: Git helpers (thin shells, no unit tests; smoke-tested in Task 11)

**Files:**
- Create: `src/git.ts`

- [ ] **Step 1: Implement src/git.ts**

```typescript
import { spawnSync } from "node:child_process";

function run(cwd: string, args: string[]): string {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${args.join(" ")} failed (${r.status}):\n${r.stderr}`);
  }
  return r.stdout.trim();
}

export function ensureDevBranch(repoDir: string, baseBranch: string, devBranch: string): void {
  const branches = run(repoDir, ["git", "branch", "--list", devBranch]);
  if (!branches.includes(devBranch)) {
    run(repoDir, ["git", "branch", devBranch, baseBranch]);
  }
}

export function createWorktree(repoDir: string, branch: string, baseBranch: string, worktreeDir: string): void {
  run(repoDir, ["git", "worktree", "add", "-b", branch, worktreeDir, baseBranch]);
}

export function removeWorktree(repoDir: string, worktreeDir: string): void {
  run(repoDir, ["git", "worktree", "remove", "--force", worktreeDir]);
}

export function commitAs(worktreeDir: string, author: string, message: string, paths: string[]): void {
  run(worktreeDir, ["git", "add", "--", ...paths]);
  const env = { ...process.env, GIT_AUTHOR_NAME: author.split(" <")[0], GIT_AUTHOR_EMAIL: author.match(/<(.+)>/)?.[1] ?? "deepseek@local" };
  const r = spawnSync("git", ["commit", "-m", message], { cwd: worktreeDir, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git commit failed: ${r.stderr}`);
}

export function pushBranch(repoDir: string, branch: string): void {
  run(repoDir, ["git", "push", "-u", "origin", branch]);
}

export function openPR(worktreeDir: string, baseBranch: string, title: string, body: string): string {
  const r = spawnSync("gh", ["pr", "create", "--base", baseBranch, "--title", title, "--body", body], { cwd: worktreeDir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh pr create failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function diffStat(worktreeDir: string, baseBranch: string): string {
  return run(worktreeDir, ["git", "diff", `${baseBranch}...HEAD`, "--stat"]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/git.ts
git commit -m "feat(git): worktree, branch, commit, push, and PR helpers"
```

---

## Task 8: Review runner

**Files:**
- Create: `src/review.ts`

- [ ] **Step 1: Implement src/review.ts**

```typescript
import { spawnSync } from "node:child_process";

export interface CheckResult {
  name: string;
  ok: boolean;
  output: string;
}

export function runChecks(worktreeDir: string, cmds: { lint: string; typecheck: string; test: string }): CheckResult[] {
  return [
    runOne(worktreeDir, "lint", cmds.lint),
    runOne(worktreeDir, "typecheck", cmds.typecheck),
    runOne(worktreeDir, "test", cmds.test)
  ];
}

function runOne(cwd: string, name: string, cmd: string): CheckResult {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8" });
  return {
    name,
    ok: r.status === 0,
    output: (r.stdout ?? "") + (r.stderr ?? "")
  };
}

export function summarize(results: CheckResult[]): string {
  return results.map(r => `${r.ok ? "PASS" : "FAIL"} ${r.name}`).join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/review.ts
git commit -m "feat(review): run lint/typecheck/test in the worktree"
```

---

## Task 9: Transcript log

**Files:**
- Create: `src/transcript.ts`

- [ ] **Step 1: Implement**

```typescript
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "./api.ts";

export interface TaskState {
  slug: string;
  worktreeDir: string;
  branch: string;
  messages: Message[];
}

export function transcriptDir(toolDir: string, slug: string): string {
  const dir = join(toolDir, "transcripts", slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendMessage(toolDir: string, slug: string, msg: Message, usage?: unknown): void {
  const dir = transcriptDir(toolDir, slug);
  appendFileSync(join(dir, "messages.jsonl"), JSON.stringify({ ts: new Date().toISOString(), msg, usage }) + "\n");
}

export function saveState(toolDir: string, slug: string, state: TaskState): void {
  const dir = transcriptDir(toolDir, slug);
  writeFileSync(join(dir, "state.json"), JSON.stringify(state, null, 2));
}

export function loadState(toolDir: string, slug: string): TaskState | null {
  const path = join(toolDir, "transcripts", slug, "state.json");
  if (!existsSync(path)) return null;
  return JSON.parse(require("node:fs").readFileSync(path, "utf8"));
}
```

> Note: replace the `require(...)` with `readFileSync` import — keeping consistent with the rest of the file.

Corrected `loadState`:
```typescript
import { readFileSync } from "node:fs";
// ...
export function loadState(toolDir: string, slug: string): TaskState | null {
  const path = join(toolDir, "transcripts", slug, "state.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/transcript.ts
git commit -m "feat(transcript): append-only message log + task state"
```

---

## Task 10: Session manager + CLI dispatcher

**Files:**
- Create: `src/session.ts`
- Create: `src/cli.ts`

- [ ] **Step 1: Implement src/session.ts**

```typescript
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadConfig } from "./config.ts";
import { chat, type Message } from "./api.ts";
import { parseDeepseekResponse } from "./parser.ts";
import { buildBrief } from "./context.ts";
import { ensureDevBranch, createWorktree, commitAs, pushBranch, openPR, diffStat } from "./git.ts";
import { runChecks, summarize } from "./review.ts";
import { appendMessage, saveState, loadState, transcriptDir, type TaskState } from "./transcript.ts";

const TOOL_DIR = new URL("..", import.meta.url).pathname;
const SYSTEM_PROMPT = readFileSync(new URL("./prompts/system.md", import.meta.url), "utf8");

interface TaskSpec {
  title: string;
  slug: string;
  body: string;
  filesInScope: string[];
}

function parseSpec(specPath: string): TaskSpec {
  const raw = readFileSync(specPath, "utf8");
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] ?? "Untitled task";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filesMatch = raw.match(/##\s+Files in scope\s*\n([\s\S]*?)(?=\n##\s|$)/);
  const filesInScope = (filesMatch?.[1] ?? "").split("\n")
    .map(l => l.replace(/^[\s\-*]+/, "").trim())
    .filter(Boolean);
  return { title, slug, body: raw, filesInScope };
}

export async function startTask(opts: { projectDir: string; specPath: string }): Promise<void> {
  const cfg = loadConfig({ projectDir: opts.projectDir });
  const spec = parseSpec(opts.specPath);
  const branch = `deepseek/${spec.slug}`;
  const worktreeDir = `${opts.projectDir}-deepseek-${spec.slug}`;

  ensureDevBranch(opts.projectDir, "main", cfg.project.dev_branch);
  createWorktree(opts.projectDir, branch, cfg.project.dev_branch, worktreeDir);

  const conventions = cfg.project.conventions_path
    ? readFileSync(join(opts.projectDir, cfg.project.conventions_path), "utf8")
    : "";

  const brief = buildBrief({
    projectDir: opts.projectDir,
    taskTitle: spec.title,
    specBody: spec.body,
    filesInScope: spec.filesInScope,
    conventions
  });

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: brief }
  ];

  const state: TaskState = { slug: spec.slug, worktreeDir, branch, messages };
  saveState(TOOL_DIR, spec.slug, state);
  for (const m of messages) appendMessage(TOOL_DIR, spec.slug, m);

  const r = await chat({ apiKey: cfg.apiKey, apiBase: cfg.apiBase, model: cfg.model, messages });
  const reply: Message = { role: "assistant", content: r.content };
  state.messages.push(reply);
  saveState(TOOL_DIR, spec.slug, state);
  appendMessage(TOOL_DIR, spec.slug, reply, r.usage);

  process.stdout.write(`\n=== Task: ${spec.title} ===\nBranch: ${branch}\nWorktree: ${worktreeDir}\n\n--- DeepSeek replied ---\n${r.content}\n`);
}

export async function answer(opts: { projectDir: string; slug: string; text: string }): Promise<void> {
  const cfg = loadConfig({ projectDir: opts.projectDir });
  const state = loadState(TOOL_DIR, opts.slug);
  if (!state) throw new Error(`No task with slug ${opts.slug}`);
  const userMsg: Message = { role: "user", content: opts.text };
  state.messages.push(userMsg);
  appendMessage(TOOL_DIR, opts.slug, userMsg);

  const r = await chat({ apiKey: cfg.apiKey, apiBase: cfg.apiBase, model: cfg.model, messages: state.messages });
  const reply: Message = { role: "assistant", content: r.content };
  state.messages.push(reply);
  saveState(TOOL_DIR, opts.slug, state);
  appendMessage(TOOL_DIR, opts.slug, reply, r.usage);
  process.stdout.write(`\n--- DeepSeek replied ---\n${r.content}\n`);
}

export function commitImplementation(opts: { projectDir: string; slug: string }): void {
  const state = loadState(TOOL_DIR, opts.slug);
  if (!state) throw new Error(`No task with slug ${opts.slug}`);
  const last = state.messages[state.messages.length - 1];
  if (last?.role !== "assistant") throw new Error("Last message is not from DeepSeek");
  const parsed = parseDeepseekResponse(last.content);
  if (parsed.kind !== "implementation") {
    throw new Error(`Last response is ${parsed.kind}, expected implementation`);
  }
  const writtenPaths: string[] = [];
  for (const f of parsed.files) {
    const abs = join(state.worktreeDir, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.contents);
    writtenPaths.push(f.path);
  }
  commitAs(state.worktreeDir, "DeepSeek V4 Pro <deepseek@local>", `feat: ${opts.slug}`, writtenPaths);
  process.stdout.write(`\nCommitted ${writtenPaths.length} file(s) on ${state.branch}\n`);
}

export function review(opts: { projectDir: string; slug: string }): void {
  const cfg = loadConfig({ projectDir: opts.projectDir });
  const state = loadState(TOOL_DIR, opts.slug);
  if (!state) throw new Error(`No task with slug ${opts.slug}`);
  process.stdout.write(`\n=== Diff vs ${cfg.project.dev_branch} ===\n${diffStat(state.worktreeDir, cfg.project.dev_branch)}\n\n`);
  const results = runChecks(state.worktreeDir, {
    lint: cfg.project.lint_cmd,
    typecheck: cfg.project.typecheck_cmd,
    test: cfg.project.test_cmd
  });
  process.stdout.write(`\n=== Review ===\n${summarize(results)}\n`);
  for (const r of results) {
    if (!r.ok) {
      process.stdout.write(`\n--- ${r.name} output ---\n${r.output}\n`);
    }
  }
}

export function pr(opts: { projectDir: string; slug: string; title: string; body: string }): void {
  const cfg = loadConfig({ projectDir: opts.projectDir });
  const state = loadState(TOOL_DIR, opts.slug);
  if (!state) throw new Error(`No task with slug ${opts.slug}`);
  pushBranch(state.worktreeDir, state.branch);
  const url = openPR(state.worktreeDir, cfg.project.dev_branch, opts.title, opts.body);
  process.stdout.write(`\nPR opened: ${url}\n`);
}
```

- [ ] **Step 2: Implement src/cli.ts**

```typescript
import { startTask, answer, commitImplementation, review, pr } from "./session.ts";

const [, , cmd, ...rest] = process.argv;
const projectDir = process.cwd();

async function main() {
  switch (cmd) {
    case "start": {
      const specPath = rest[0];
      if (!specPath) throw new Error("Usage: start <spec.md>");
      await startTask({ projectDir, specPath });
      break;
    }
    case "answer": {
      const slug = rest[0];
      const text = rest.slice(1).join(" ");
      if (!slug || !text) throw new Error("Usage: answer <slug> <text>");
      await answer({ projectDir, slug, text });
      break;
    }
    case "implement-commit": {
      const slug = rest[0];
      if (!slug) throw new Error("Usage: implement-commit <slug>");
      commitImplementation({ projectDir, slug });
      break;
    }
    case "review": {
      const slug = rest[0];
      if (!slug) throw new Error("Usage: review <slug>");
      review({ projectDir, slug });
      break;
    }
    case "pr": {
      const slug = rest[0];
      const title = rest[1];
      const body = rest.slice(2).join(" ");
      if (!slug || !title) throw new Error("Usage: pr <slug> <title> <body>");
      pr({ projectDir, slug, title, body });
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      process.stderr.write(`Commands: start <spec.md> | answer <slug> <text> | implement-commit <slug> | review <slug> | pr <slug> <title> <body>\n`);
      process.exit(1);
  }
}

main().catch(e => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: all tests pass (parser, api, config, context).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/session.ts
git commit -m "feat(cli,session): wire start/answer/implement-commit/review/pr"
```

---

## Task 11: Set up OnTime for the orchestrator + smoke test

**Files:**
- Create: `OnTime/.deepseek-orchestrator.json`
- Modify: OnTime git — create `dev` branch
- Create: `OnTime/scripts/dev/deepseek-smoke-task.md` (smoke test spec)

- [ ] **Step 1: Create dev branch in OnTime**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime"
git branch dev main
```

(We will not push to origin yet — wait until smoke test passes.)

- [ ] **Step 2: Create OnTime/.deepseek-orchestrator.json**

```json
{
  "dev_branch": "dev",
  "lint_cmd": "npm run lint",
  "typecheck_cmd": "npx tsc --noEmit",
  "test_cmd": "npm test",
  "context_excludes": [
    "node_modules",
    "dist",
    "android/build",
    "ios/Pods",
    "*.aab",
    "*.png",
    "*.zip",
    "*.svg"
  ]
}
```

- [ ] **Step 3: Commit OnTime config**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime"
git add .deepseek-orchestrator.json
git commit -m "chore: add deepseek-orchestrator config"
```

- [ ] **Step 4: Write the smoke test spec**

Create `OnTime/scripts/dev/deepseek-smoke-task.md`:
```markdown
# Smoke test: add a header comment to README

## Spec

Add a single-line HTML comment to the very top of `README.md` that says: `<!-- Maintained by OnTime team -->`. Do not change any other content. Do not modify any other file.

## Files in scope

- README.md
```

- [ ] **Step 5: Run the smoke test**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime"
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" start scripts/dev/deepseek-smoke-task.md
```

Expected: orchestrator creates `deepseek/smoke-test-add-a-header-comment-to-readme` branch + worktree, sends brief, prints DeepSeek's reply (likely PLAN+FILES with one file).

- [ ] **Step 6: Commit DeepSeek's output**

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" implement-commit smoke-test-add-a-header-comment-to-readme
```

Expected: a commit by `DeepSeek V4 Pro <deepseek@local>` lands on the branch.

- [ ] **Step 7: Run review**

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" review smoke-test-add-a-header-comment-to-readme
```

Expected: lint/typecheck/test all PASS (a README comment changes nothing).

- [ ] **Step 8: Verify diff manually**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime-deepseek-smoke-test-add-a-header-comment-to-readme"
git diff dev...HEAD
```

Expected: only README.md changed, only the comment added at the top.

- [ ] **Step 9: Clean up smoke test**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime"
git worktree remove --force "../OnTime-deepseek-smoke-test-add-a-header-comment-to-readme"
git branch -D deepseek/smoke-test-add-a-header-comment-to-readme
```

- [ ] **Step 10: STOP — report smoke test result to user**

If smoke test passed → orchestrator is operational. Proceed to Task 12.
If failed → fix the orchestrator before continuing.

---

## Task 12: Run the production-readiness audit (the first real task)

**Files:**
- Create: `OnTime/scripts/dev/audit-production-readiness.md`

- [ ] **Step 1: Write the audit task spec**

Create `OnTime/scripts/dev/audit-production-readiness.md`:

```markdown
# Production readiness audit of OnTime

## Spec

You are auditing the OnTime codebase (a Capacitor + Vite + React + TypeScript Islamic prayer-times app, targeted at Android & iOS) for production readiness. Produce a single audit report at `docs/audits/2026-05-02-production-readiness.md` covering, with concrete file:line references where applicable:

1. **Security**
   - Hardcoded secrets, API keys, tokens in source or config.
   - Dependency vulnerabilities — read `package.json` and flag any deps that are outdated by major versions or known to have advisories. Suggest a remediation plan.
   - Capacitor / Android / iOS native config issues (excessive permissions, debuggable=true, http allowed, missing network security config, signing config in repo).

2. **Correctness**
   - TypeScript type coverage — any `any`, `@ts-ignore`, missing return types in exported functions, unsafe casts.
   - Test coverage — what's tested, what's not, where the gaps are. Use the existing vitest tests under `src/` as ground truth.
   - Error handling — any unhandled promise rejections, missing try/catch around async I/O, swallowed errors.
   - Time / locale / DST hazards specific to a prayer times app.

3. **Performance**
   - Bundle size hot spots (read `package.json` deps and the Vite config; identify obvious bloat).
   - Audio asset loading strategy (`athan-audio/`) — preloaded vs on-demand.
   - Notification scheduling correctness vs battery drain (Capacitor LocalNotifications).
   - React render hotspots (large lists, missing memoization on expensive components).

4. **Accessibility**
   - Touch target sizes on interactive elements.
   - Screen reader labels on icon-only buttons.
   - Color contrast in both Classic and Islamic themes.
   - Reduced motion / dark mode handling.

5. **Store readiness**
   - Manifest, icons, splash, store listing files.
   - Privacy policy completeness vs what the app actually does (location, notifications, audio).
   - Version code / version name consistency across `package.json`, `android/`, and `ios/`.
   - Permissions justification (mic? motion? location? — does each have a user-visible reason).

## Output format

The report MUST be a single file: `docs/audits/2026-05-02-production-readiness.md`.

Structure:
- Executive summary (5-10 lines).
- Findings, grouped by the 5 categories above. Each finding has: severity (Blocker / High / Medium / Low), title, file:line evidence, recommendation.
- Prioritized fix list at the bottom — table of severity × estimated effort × suggested PR boundary, ordered by what we should ship first.

Do not change any source code. Do not run any commands. Read-only audit.

## Files in scope

- README.md
- package.json
- capacitor.config.ts
- vite.config.ts
- vitest.config.ts
- tsconfig.json
- tsconfig.app.json
- index.html
- PRIVACY_POLICY.md
- store-listing.md
- src/ (entire directory tree — orchestrator will inline all .ts/.tsx files)
- android/app/src/main/AndroidManifest.xml
- android/app/build.gradle
- ios/App/App/Info.plist
- docs/ (entire directory)
```

- [ ] **Step 2: Run the audit task**

```bash
cd "/home/rinux/Desktop/Projects/Development Project/OnTime"
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" start scripts/dev/audit-production-readiness.md
```

Expected: orchestrator creates branch + worktree; DeepSeek likely sends `QUESTIONS:` first (this is a big task) — relay to Claude to handle.

- [ ] **Step 3: Q&A loop until DeepSeek is ready**

For each `QUESTIONS:` reply, Claude reads the questions, answers codebase ones from the repo, escalates product/scope ones to the user, and runs:

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" answer <slug> "<answers>"
```

Until DeepSeek replies with `PLAN:` + `FILES:`.

- [ ] **Step 4: Commit DeepSeek's output**

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" implement-commit <slug>
```

- [ ] **Step 5: Review**

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" review <slug>
```

Since the audit produces only a markdown report, the review checks should all pass. Claude reads the report and:
- Verifies the file:line citations actually match the code.
- Spot-checks 3-5 findings for accuracy.
- Looks for false positives or missed obvious issues.

- [ ] **Step 6: Open PR to dev**

```bash
"/home/rinux/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/bin/deepseek-orchestrator" pr <slug> "audit: production readiness report" "Production-readiness audit by DeepSeek V4 Pro. Reviewed by Claude Code. Findings to be addressed in subsequent PRs, one per category."
```

- [ ] **Step 7: Hand PR URL to user**

Print the PR URL and remind: user clicks merge.

---

## Self-review notes (Claude's check before handoff)

- Spec coverage:
  - Sections 3–8 of the spec map to Tasks 2–10.
  - Section 12 setup checklist mapped to Task 11.
  - Section 13 first task mapped to Task 12.
- Placeholders: none. All code blocks are complete.
- Type consistency: `Message` defined in `api.ts`, imported by `session.ts` and `transcript.ts`. `TaskState` defined in `transcript.ts`. `parseDeepseekResponse` shape consistent across parser tests and `commitImplementation` consumer.
- Known caveat: triple-backtick fences in the parser test fixtures are written here as `\`\`\`` so the markdown plan renders. The implementing agent must use literal triple backticks in `tests/parser.test.ts`.
