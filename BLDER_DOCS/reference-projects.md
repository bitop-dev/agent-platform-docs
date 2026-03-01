# Reference Projects

The `opensrc/` directory contains four projects we are using as references. This document summarizes each one and maps their components to our platform needs.

---

## 1. `gastown` — Multi-Agent Orchestration (Go)

**Repo**: `opensrc/repos/github.com/steveyegge/gastown`
**Language**: Go
**Most relevant to**: Multi-agent orchestration, workflow/convoy patterns, activity monitoring dashboard

### Key Concepts We're Borrowing

| Gastown Concept | Our Platform Equivalent |
|---|---|
| **Mayor** | Orchestrator agent that coordinates workers |
| **Polecats** (worker agents) | Sub-agents spawned by orchestrator |
| **Hooks** (git-backed persistent state) | Run state persisted in DB |
| **Convoys** (work tracking units) | Workflow runs (Phase 2) |
| **Beads** (structured work items) | Scheduled jobs + run records |
| **Feed** (TUI activity dashboard) | Run Monitor (web-based) |
| **Formulas** (TOML workflow templates) | Workflow definitions (Phase 2) |
| **Mailbox** (inter-agent messaging) | Sub-agent context passing |

### Specific Files to Study

```
gastown/cmd/gt/              - CLI entrypoint structure
gastown/internal/convoy/     - Work tracking patterns
gastown/internal/formula/    - Workflow template system
gastown/internal/dashboard/  - Web dashboard (Go HTTP serving)
gastown/docs/                - Architecture and concept docs
```

### What We're Doing Differently

- Gastown is CLI-first (tmux-based). We are web portal-first.
- Gastown uses git worktrees for state persistence. We use a database.
- Gastown is designed around Claude Code CLI. We wrap any LLM API.

---

## 2. `openclaw` — Personal AI Assistant (TypeScript/Node.js)

**Repo**: `opensrc/repos/github.com/openclaw/openclaw`
**Language**: TypeScript (Node.js)
**Most relevant to**: Skill system, cron scheduler, agent session management, tool sandbox

### Key Concepts We're Borrowing

| OpenClaw Concept | Our Platform Equivalent |
|---|---|
| **Gateway** | Platform API server |
| **Skills** (SKILL.md + tools) | Skills (identical concept) |
| **Cron service** | Scheduler engine |
| **Isolated agent sessions** | Agent runs (isolated goroutines) |
| **Tool sandbox** | Tool engine sandboxing |
| **Compaction** | Context window management |
| **Sub-agent registry** | Sub-run tracking |
| **Delivery** (webhook/channel) | Run delivery (webhook/email) |
| **Auth profiles** | API key management |

### Specific Files to Study

```
openclaw/src/cron/types.ts           - Cron job type definitions (our CronJob schema)
openclaw/src/cron/service.ts         - Scheduler engine (our Scheduler implementation)
openclaw/src/cron/schedule.ts        - Next-run computation
openclaw/src/cron/stagger.ts         - Load staggering
openclaw/skills/                     - 50+ real skill examples
openclaw/src/gateway/skills.ts       - Skill loading and workspace merge
openclaw/src/gateway/skills-install.ts - Community skill installation
openclaw/src/gateway/compaction.ts   - Context window compaction
openclaw/src/gateway/subagent-registry.ts - Sub-agent lifecycle
openclaw/src/gateway/bash-tools.ts   - Bash tool execution + sandboxing
openclaw/src/gateway/sandbox.ts      - Sandbox policy and scoping
```

### Skill Examples to Bootstrap Our Registry

The `openclaw/skills/` directory has 50+ skills we can adapt:

| Skill | Our Use |
|---|---|
| `web_search` / `xurl` | Web search + URL fetching |
| `github` | GitHub integration |
| `summarize` | Text summarization |
| `weather` | Weather API |
| `slack` | Slack messaging |
| `discord` | Discord messaging |
| `notion` | Notion integration |
| `coding-agent` | Code execution skill |
| `healthcheck` | Service health monitoring |

---

## 3. `zeroclaw` — Agentic Runtime (Rust)

**Repo**: `opensrc/repos/github.com/zeroclaw-labs/zeroclaw`
**Language**: Rust
**Most relevant to**: Trait-driven provider architecture, lean runtime design

### Key Concepts We're Borrowing

| ZeroClaw Concept | Our Platform Equivalent |
|---|---|
| **Trait-driven providers** | `LLMProvider` interface in Go |
| **Swappable channels** | Delivery channels (webhook, email, etc.) |
| **Swappable tools** | Tool engine plugin design |
| **Research phase** | Pre-response information gathering (agent behavior pattern) |
| **Secure-by-default** | Sandbox policy: deny-first, explicit allow |
| **Single binary** | Single Go binary deployment option |

### Architecture Patterns

ZeroClaw's core philosophy — everything is a trait (interface), every component is swappable — strongly informs our interface design:

```go
// Like ZeroClaw's trait pattern, but in Go:
type LLMProvider interface { Complete(...) }
type ToolHandler  interface { Execute(...) }
type LogStore     interface { Write(...) Read(...) }
type RunQueue     interface { Enqueue(...) Dequeue(...) }
```

---

## 4. `pi-mono` — AI Agent Toolkit (TypeScript)

**Repo**: `opensrc/repos/github.com/badlogic/pi-mono`
**Language**: TypeScript (Node.js)
**Most relevant to**: Agent core architecture, multi-provider LLM API, run event model

### Key Concepts We're Borrowing

| Pi-Mono Package | Our Platform Equivalent |
|---|---|
| `@pi/ai` | Multi-provider LLM unified API design |
| `@pi/agent-core` | Agent turn loop and event model |
| `@pi/web-ui` | Frontend AI chat components |
| `@pi/tui` | Reference for activity monitor design |
| `@pi/mom` (Slack bot) | Delivery integration patterns |

### Specific Code to Study

```
pi-mono/packages/agent/src/       - Agent turn loop implementation
pi-mono/packages/agent/README.md  - Event model documentation
pi-mono/packages/ai/              - Provider abstraction
pi-mono/packages/web-ui/          - React components for AI chat
```

### Event Model (Direct Reference)

The pi-mono event model is what we're mirroring for run streaming:

```
agent_start → turn_start → message_start → message_update (streaming) → 
message_end → [tool calls] → turn_end → agent_end
```

This maps directly to our `RunEvent` types.

---

## Cross-Reference Summary

| Platform Component | Primary Reference | Secondary Reference |
|---|---|---|
| Agent Core / Turn Loop | `pi-mono/packages/agent` | `openclaw/src/gateway/pi-embedded-runner.ts` |
| Multi-Provider LLM API | `pi-mono/packages/ai` | `zeroclaw/crates/providers/` |
| Skill System | `openclaw/skills/` + `src/gateway/skills.ts` | — |
| Scheduler / Cron | `openclaw/src/cron/` | — |
| Context Compaction | `openclaw/src/gateway/compaction.ts` | — |
| Tool Sandboxing | `openclaw/src/gateway/sandbox.ts` + `bash-tools.ts` | — |
| Sub-agent Orchestration | `openclaw/src/gateway/subagent-registry.ts` | `gastown` |
| Workflow / Convoy | `gastown/internal/convoy/` + `formula/` | — |
| Web UI | `pi-mono/packages/web-ui` | `openclaw/ui/` |
| Single-binary Deployment | `zeroclaw` (Rust reference) | `gastown` (Go reference) |
