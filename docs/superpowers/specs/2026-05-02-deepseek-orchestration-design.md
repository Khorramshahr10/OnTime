# DeepSeek V4 Pro Orchestration — Design Spec

**Date:** 2026-05-02
**Status:** Approved
**Project:** OnTime (initial); reusable across projects under `~/Desktop/Projects/Development Project/`

---

## 1. Purpose

Set up a workflow where the user delegates implementation work to DeepSeek V4 Pro (acting as an "employee"), while Claude Code acts as the tech lead: refining the user's brief into a spec, curating context, answering codebase questions, reviewing the diff, and deciding when to open a PR.

The user owns product direction and merge approval. Claude Code owns spec quality, context curation, code review, and PR composition. DeepSeek owns implementation.

## 2. Roles

| Actor | Responsibility |
|---|---|
| **User** | Plain-English task descriptions; product decisions; final merge click. |
| **Claude Code** | Refines task into spec; curates code context; answers codebase questions; reviews diff; runs lint/tests; bounces substantive issues back; fixes trivial issues in place; opens PR. |
| **DeepSeek V4 Pro** | Reads spec + curated context; asks clarifying questions; implements code; emits per-file blocks; pushes fix-ups when bounced. |

## 3. Architecture

A small Node.js + TypeScript CLI tool, run via `tsx` (no build step), invoked from inside any project's working tree.

**Tool location:** `~/Desktop/Projects/Development Project/.tools/deepseek-orchestrator/` — reusable across all projects in the parent folder.

**Per-task lifecycle:**
1. User describes task in chat → Claude writes `task-spec.md`.
2. `git` creates `deepseek/<slug>` branch off `dev`, checked out in a worktree (main checkout untouched).
3. Orchestrator builds prompt: system role + spec + curated files + project conventions.
4. POST to DeepSeek `/chat/completions` with `model: deepseek-v4-pro`.
5. Q&A loop: codebase questions answered by Claude; product questions surfaced to user. Loop until DeepSeek says "ready to implement."
6. DeepSeek emits structured per-file code blocks → orchestrator writes them to the worktree → commits authored as `DeepSeek V4 Pro <deepseek@local>`.
7. Claude reviews: diff read, `lint`, `tsc --noEmit`, `test`. Trivial failures (lint/format/typo) Claude patches in place; substantive failures (logic, tests, spec deviations, architecture) are bounced back to DeepSeek with a structured code-review prompt → DeepSeek pushes fix-up commit → re-review.
8. When green, Claude opens PR `deepseek/<slug>` → `dev` with summary of what DeepSeek did, what Claude changed, and what user should sanity-check. **No auto-merge.** User clicks merge.

## 4. Components & file layout

```
.tools/deepseek-orchestrator/
├── package.json
├── README.md
├── bin/
│   └── deepseek-orchestrator     # entrypoint shim → src/cli.ts
├── src/
│   ├── cli.ts                    # arg parsing, subcommands
│   ├── config.ts                 # loads ~/.deepseek/key, model = deepseek-v4-pro
│   ├── api.ts                    # DeepSeek HTTP client (chat completions, retries)
│   ├── context.ts                # builds prompt: spec + files + conventions
│   ├── session.ts                # one task lifecycle: brief → Q&A → implement → commit
│   ├── review.ts                 # runs lint/tsc/tests, classifies failures
│   ├── git.ts                    # branch/worktree/commit/PR helpers (git + gh)
│   └── prompts/
│       ├── system.md             # DeepSeek's persistent role + protocol
│       ├── brief.md              # template for initial task brief
│       ├── question.md           # template for "what questions do you have?"
│       └── code-review.md        # template for fix-up cycle
└── transcripts/                  # gitignored; one folder per task = audit trail
    └── <task-slug>/
        ├── spec.md
        ├── context.md
        ├── messages.jsonl        # full request/response log
        └── review-notes.md
```

## 5. CLI subcommands

| Command | Purpose |
|---|---|
| `start <spec.md>` | Kicks off task: creates worktree, sends initial brief, enters Q&A. |
| `answer "<text>"` | Feeds a reply (user's or Claude's) back to DeepSeek when it has questions. |
| `implement` | Tells DeepSeek "you have enough, write the code now." |
| `review` | Runs lint/tsc/tests; prints diff summary; classifies failures. |
| `bounce "<feedback>"` | Sends review feedback back for a fix-up commit. |
| `pr` | Opens PR to `dev` with auto-generated summary. |
| `status` | Shows current task, branch, last DeepSeek message. |

## 6. Per-project config

Each project has `<project>/.deepseek-orchestrator.json`:

```json
{
  "dev_branch": "dev",
  "lint_cmd": "npm run lint",
  "typecheck_cmd": "npx tsc --noEmit",
  "test_cmd": "npm test",
  "conventions_path": "docs/CONVENTIONS.md",
  "context_excludes": ["node_modules", "dist", "*.aab", "*.png", "*.zip", "android/build", "ios/Pods"]
}
```

This is how the orchestrator learns each project's commands and exclusions without hardcoding any one project's setup.

## 7. Prompt protocol (DeepSeek-side contract)

DeepSeek's `system.md` enforces a strict response format:

- When uncertain: reply with a `QUESTIONS:` block listing each question on its own line. Do not write code.
- When ready: reply with a `PLAN:` paragraph, then `FILES:` block listing each touched file with full new contents inside fenced blocks tagged with the file path.
- For fix-up rounds: same `FILES:` shape, only include files that change.
- Never edit files outside the spec's "files in scope."

Malformed output → orchestrator refuses to commit and sends a format-correction prompt.

## 8. Git workflow

- Setup creates `dev` branch off `main` in OnTime (does not exist yet) and pushes to `origin`.
- Each task: `git worktree add ../OnTime-deepseek-<slug> -b deepseek/<slug> dev`.
- DeepSeek's commits authored `DeepSeek V4 Pro <deepseek@local>`. Claude's review fix-ups authored as the user.
- PR opened via `gh pr create --base dev`.
- Worktree removed (`git worktree remove`) after PR is merged.

## 9. Error handling

| Failure | Response |
|---|---|
| DeepSeek API 5xx / rate limit | Retry with exponential backoff (3 tries), then surface to user. |
| Malformed DeepSeek output | Refuse to commit; send format-correction prompt. |
| Lint / type / test failure | Trivial → Claude patches in place. Substantive → bounce to DeepSeek. |
| Merge conflict against `dev` | Claude rebases the worktree branch; never DeepSeek. |
| Missing or invalid API key | Fail fast on startup with clear error. |
| DeepSeek edits files outside scope | Reject the diff; send "you went out of scope" prompt. |

## 10. Auditability

- Every API call appended to `transcripts/<slug>/messages.jsonl`.
- Every commit attributed to its author (DeepSeek vs Claude vs user).
- PR description summarizes who did what.
- Token usage logged per call (DeepSeek API returns it).

## 11. Out of scope (YAGNI)

- No queue / no concurrent tasks — one task at a time.
- No web UI — CLI only.
- No model auto-fallback — `deepseek-v4-pro` only.
- No cost dashboard — token counts in transcripts is enough.
- No autonomous mode — every PR needs the user's merge click.
- No formal test suite for the orchestrator — it's internal tooling; first real run is a smoke test.

## 12. Setup checklist (one-time)

1. Create `dev` branch off `main` in OnTime; push to origin.
2. Scaffold `.tools/deepseek-orchestrator/` with files above.
3. Create `OnTime/.deepseek-orchestrator.json`.
4. Verify `gh auth status`.
5. Run a smoke test (e.g., "add a comment to README") end-to-end before trusting it on real features.

## 13. First real task (post-setup)

A production-readiness audit of the OnTime codebase, run through this orchestrator. Scope to be defined in its own `task-spec.md` once the orchestrator is operational. Expected coverage: security (secrets, dependencies, Capacitor/Android config), correctness (type coverage, test coverage, error paths), performance (bundle size, audio loading, notification scheduling), accessibility (touch targets, screen reader labels, contrast), and store-readiness (privacy policy, manifest, icons, version code). DeepSeek produces an audit report markdown + a prioritized issue list; subsequent tasks fix issues one PR at a time.

## 14. Open assumptions

- DeepSeek's `/v1/chat/completions` schema is OpenAI-compatible (current public API). If `deepseek-v4-pro` requires a different endpoint shape, `api.ts` adapts.
- `deepseek-v4-pro` is the highest-reasoning model exposed today (verified at design time via `GET /models`). If a higher one ships, swap via config.
- The user's API key lives at `~/.deepseek/key` (mode 600), sourced into the tool's env at runtime.
