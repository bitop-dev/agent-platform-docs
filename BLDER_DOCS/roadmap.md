# Build Roadmap

A phased plan that delivers real value at each milestone, building toward the full vision.

Each phase is labeled with the repo(s) it primarily lives in. See [repository-structure.md](../repository-structure.md) for repo boundaries.

---

## Phase 0 — Agent Core (`agent-core`) (Week 1–2)
**Goal**: A standalone agent binary that can run a mission from a YAML config and stream output to the terminal. No database, no web UI, no API — just the core runtime working end-to-end.

### Deliverables
- [x] `agent-core` repo: Go module, directory structure, Makefile
- [x] `AgentConfig` YAML schema + loader + validator
- [x] `Provider` interface + Anthropic streaming implementation
- [x] Basic turn loop (text only — no tool calling yet)
- [x] `RunEvent` channel-based event stream
- [x] Text output renderer (streaming to stdout, with color)
- [x] `agent-core run --config myagent.yaml --mission "..."` works end-to-end
- [x] `agent-core validate` command
- [x] Example agent YAML configs in `examples/`

### Success Criteria ✅
`agent-core run --config examples/basic.yaml --mission "Explain what a goroutine is"` streams a response to the terminal from Claude.

---

## Phase 1 — Agent Core: Tools + Skills (`agent-core`) (Week 3–4) ✅
**Goal**: Agents can call tools and load skills. The binary is fully useful for real tasks.

### Deliverables
- [x] `Tool` interface + `ToolEngine` with parallel execution
- [x] Built-in tools: `bash` (opt-out), `read_file`, `write_file`, `edit_file`, `list_dir`, `grep`, `http_fetch`, `tasks`
- [x] Subprocess tool runner (external tools via stdin/stdout JSON)
- [x] Tool sandboxing: path scope, env allowlist, output truncation, timeout
- [x] Tool calling in the turn loop (native tool calling)
- [x] Skill loader: reads `SKILL.md`, injects into system prompt
- [x] 7 bundled skill reference implementations in planning docs
- [x] Loop detection (no-progress, ping-pong, failure streak)
- [x] Deferred-action detection + retry prompt
- [x] Credential scrubbing from tool output
- [x] Approval manager (CLI prompts for dangerous tools, --approve flag)
- [x] Safety heartbeat (re-inject constraints every N turns)
- [x] `agent-core chat` interactive mode + session persistence
- [x] JSON + JSONL output formats (`--format json|jsonl`)
- [x] OpenAI + Anthropic + OpenAI Responses + Ollama providers
- [x] `pkg/agent` public API exported for `platform-api` to import
- [x] MCP support (stdio + HTTP transports)
- [x] Cost tracking (token usage + USD estimation)
- [x] Context compaction (proactive + reactive)
- [x] ReliableProvider (retry, backoff, key rotation, model fallback)

### Success Criteria ✅
Tested with real MCP servers (context7, tanstack), real LLM APIs, multi-tool agent runs.
111 tests passing. 22 commits on main.

---

## Phase 2 — Platform API: Foundation (`platform-api`) (Week 5–7) ✅
**Goal**: REST API that wraps agent-core — agents and runs are persistent, streamable over WebSocket.

### Deliverables
- [x] `platform-api` repo: Go module, directory structure
- [x] Database schema + migrations (SQLite dev, PostgreSQL prod)
- [x] Agent CRUD API (`/api/v1/agents`)
- [x] Runs API (`/api/v1/runs`) — triggers `agent-core/pkg/agent` in-process
- [x] WebSocket run streaming (`/ws/runs/:id`)
- [x] Run persistence (run records + events stored in DB)
- [x] JWT authentication (register/login/refresh)
- [x] Skills CRUD API (`/api/v1/skills`)
- [x] API key management with encryption at rest
- [x] Rate limiting (10/min auth, 120/min API)
- [x] Models catalog endpoint
- [x] Dashboard stats endpoint
- [x] Run cancellation
- [x] OpenAPI spec
- [x] Docker support (Dockerfile + docker-compose.yml)
- [x] Structured logging (slog)

### Success Criteria ✅
Created agent via API, triggered run, verified LLM execution with real tool calls, events persisted. 22 tests passing.

---

## Phase 3 — Web Portal: First UI (`platform-web`) (Week 8–9) ✅
**Goal**: A browser you can use to create agents and watch runs live.

### Deliverables
- [x] `platform-web` repo: Next.js 15 App Router setup
- [x] Agent list + create + detail + edit pages
- [x] Run Monitor: live streaming output + collapsed event timeline
- [x] Run history page (table view)
- [x] Auth UI (login/register with JWT + refresh tokens)
- [x] API key management (add/delete, base URL, default toggle)
- [x] Dashboard with stat cards + recent runs
- [x] Skills browser page
- [x] Dark theme (shadcn/ui + Tailwind)

### Success Criteria ✅
Logged in via browser, created agent, triggered run, watched streaming output with tool call timeline. 12 pages, clean build.

---

## Phase 4 — Skills Repo + Skill Hub (`skills` + `platform-api` + `platform-web`) (Week 10–11) ✅
**Goal**: The skills registry is live and agents can be equipped with skills from the UI.

### Deliverables
- [x] `agent-platform-skills` repo: registry.json, CONTRIBUTING.md, LICENSE, 5 skills
- [x] Skills: `web_search` (DuckDuckGo), `web_fetch` (HTML→markdown), `github` (gh CLI), `summarize`, `report`
- [x] Multi-source skill registry: API syncs from any GitHub repo on startup
- [x] Skill Sources API: CRUD for custom GitHub repos, sync triggers
- [x] Skill Hub UI: browse skills from all sources, add custom repos, sync all
- [x] agent-core `skill install/remove/update/search` CLI commands
- [x] Auto-install: missing skills fetched from `skill_sources` on agent run
- [x] `skill_sources` config field in agent YAML
- [x] End-to-end tested: install → run → web_search + web_fetch with real LLM

### Success Criteria ✅
Skills installed from GitHub via CLI, agent ran web_search + web_fetch with real DuckDuckGo results and LLM summarization. Web UI shows skills synced from registry with source management.

---

## Phase 5 — Scheduler (`platform-api` + `platform-web`) (Week 12–13)
**Goal**: Agents run on a schedule without manual intervention.

### Deliverables
- [ ] `ScheduledJob` model + DB table
- [ ] Cron engine (`robfig/cron`): `every` / `cron` / `at` / `webhook` triggers
- [ ] Run queue (`riverqueue/river` on PostgreSQL)
- [ ] Worker pool: N concurrent agent runs
- [ ] Duplicate-run prevention (overlap policy)
- [ ] Schedule step added to Agent Builder wizard
- [ ] Schedule management UI (job list, enable/disable, run history per job)
- [ ] Webhook trigger endpoint
- [ ] Basic delivery: webhook POST on run completion

### Success Criteria
An agent fires automatically on `0 9 * * 1` (Monday 9am) and POSTs its output to a webhook URL.

---

## Phase 6 — Expanded Skill Library (`skills`) (Week 14–15)
**Goal**: Enough skills that the platform is genuinely useful for diverse real-world tasks.

### Target Skills

| Category | Skills |
|---|---|
| **Web** | `web_search`, `web_fetch`, `browser` (headless via MCP) |
| **Code** | `github`, `gitlab` |
| **Data** | `summarize`, `report` |
| **Communication** | `send_email`, `slack`, `discord` |
| **Productivity** | `notion`, `calendar`, `trello` |
| **Monitoring** | `healthcheck`, `uptime_check`, `log_reader` |
| **AI** | `image_gen`, `transcribe` |

Core tools (`bash`, `read_file`, `write_file`, `edit_file`, `list_dir`, `grep`, `http_fetch`, `tasks`) are built into the binary — not skills.

### Deliverables
- [ ] 15+ skills in the `skills` repo
- [ ] Skill version pinning (agents pin to `skill@version`)
- [ ] Skill testing sandbox in UI
- [ ] Required env vars declaration + setup UI guide

### Success Criteria
A "Daily Standup Bot" reads GitHub issues, checks Slack for blockers, and posts a summary to Slack — configured entirely through the web UI.

---

## Phase 7 — Multi-Agent Orchestration (`agent-core` + `platform-api` + `platform-web`) (Week 16–18)
**Goal**: Agents can spawn and coordinate sub-agents for complex tasks.

### Deliverables
- [ ] `agent_spawn` tool added to `agent-core`
- [ ] Sub-run tracking in `platform-api` (`parent_run_id`, `depth`)
- [ ] Depth limit enforcement (max 3 levels)
- [ ] Sub-agent run tree in Run Monitor
- [ ] Workflow definitions (sequential pipeline)
- [ ] Workflow Builder UI

### Success Criteria
An orchestrator breaks "Write a market analysis" into 3 parallel research agents + 1 compiler — visible as a live tree in the browser.

---

## Phase 8 — Production Hardening (All repos) (Week 19–20)
**Goal**: Ready for real, reliable use.

### Deliverables
- [ ] Container-based sandboxing (Docker-per-run option) — `agent-core`
- [ ] LLM provider failover — `agent-core`
- [ ] Rate limiting on API endpoints — `platform-api`
- [ ] Run output archiving to S3/R2 — `platform-api`
- [ ] Metrics endpoint (Prometheus) — `platform-api`
- [ ] Graceful shutdown (drain in-flight runs) — `platform-api`
- [ ] Docker Compose production setup (all repos)
- [ ] Documentation site

### Success Criteria
Platform runs 20+ concurrent agents reliably with no run loss on restart.

---

## Phase 9 — Multi-User & Teams (Future)
**Goal**: Multiple users can share a platform instance.

### Deliverables
- [ ] Team model + membership roles — `platform-api`
- [ ] Resource scoping (agents/skills/jobs per team) — `platform-api`
- [ ] OAuth login (GitHub, Google) — `platform-api` + `platform-web`
- [ ] Community skill registry (hosted index) — `skills`

---

## Phase 2 — Skill Registry (Week 6–7)
**Goal**: Skills can be created, managed, and attached to agents.

### Deliverables
- [ ] `Skill` model + DB table
- [ ] Skills CRUD API
- [ ] Skill Loader: reads SKILL.md, registers tools, injects into system prompt
- [ ] `agent_skills` join table (ordered)
- [ ] Bundled skills (7): `web_search`, `web_fetch`, `summarize`, `github`, `gitlab`, `report`, `send_email`
- [ ] Skill Hub UI: browse, search, filter skills
- [ ] Agent Builder UI: skill picker + ordering
- [ ] Skill detail page

### Success Criteria
- An agent with the `github` skill can answer questions about a repo's open issues.
- Users can browse and add skills to agents in the UI.

---

## Phase 3 — Scheduler (Week 8–9)
**Goal**: Agents can run on a schedule without manual intervention.

### Deliverables
- [ ] `ScheduledJob` model + DB table
- [ ] Cron expression parser (`robfig/cron`)
- [ ] Scheduler engine: heap-based timer, run on `every` / `cron` / `at`
- [ ] Duplicate-run prevention (overlap policy)
- [ ] Run Queue (`riverqueue/river` on PostgreSQL)
- [ ] Worker pool: N concurrent agent runs
- [ ] Scheduled Job CRUD API
- [ ] Schedule UI: visual cron builder + job list
- [ ] Job run history: see past fires for a job
- [ ] Webhook trigger endpoint
- [ ] Basic delivery: webhook POST on run completion

### Success Criteria
- An agent is scheduled `0 9 * * 1` (Monday 9am), fires automatically, and the output is POSTed to a webhook URL.

---

## Phase 4 — Agent Builder UI (Week 10–11)
**Goal**: A non-engineer can create a fully-featured agent through the web portal without touching code or config files.

### Deliverables
- [ ] Multi-step Agent Builder wizard (Identity → Mission → Skills → Schedule → Review)
- [ ] System prompt / markdown editor
- [ ] Model selector (provider + model dropdown, fetches available models)
- [ ] API key management UI (add/remove/test LLM provider keys)
- [ ] Per-agent settings page
- [ ] Skill creator UI (basic: name, description, SKILL.md editor)
- [ ] "Test Run" button in agent builder
- [ ] Dashboard: recent runs, active agents, quick stats
- [ ] Cost tracking: token usage + estimated cost per run displayed in UI

### Success Criteria
- Full end-to-end: create agent → add skills → set schedule → monitor run, entirely through the web UI.

---

## Phase 5 — Expanded Skill Library (Week 12–13)
**Goal**: A rich enough skill library that the platform is genuinely useful for real-world tasks.

### Target Skills (adapting from openclaw reference)

| Category | Skills |
|---|---|
| **Web** | `web_search`, `web_fetch`, `browser` (headless via MCP) |
| **Code** | `github`, `gitlab` |
| **Data** | `summarize`, `report` |
| **Communication** | `send_email`, `slack`, `discord` |
| **Productivity** | `notion`, `calendar`, `trello` |
| **Monitoring** | `healthcheck`, `uptime_check`, `log_reader` |
| **AI** | `image_gen` (OpenAI DALL-E), `transcribe` (Whisper) |

### Deliverables
- [ ] Implement 15+ bundled skills
- [ ] Community skill installer (from Git URL)
- [ ] Skill version pinning
- [ ] Skill testing sandbox in UI
- [ ] Required env vars declaration + setup UI

### Success Criteria
- A user can create a "Daily Standup Bot" that reads GitHub issues, checks Slack for blockers, and posts a summary to a Slack channel — using only the UI.

---

## Phase 6 — Multi-Agent Orchestration (Week 14–16)
**Goal**: Agents can spawn and coordinate sub-agents for complex tasks.

### Deliverables
- [ ] `agent_spawn` tool (core orchestration primitive)
- [ ] Sub-run tracking (`parent_run_id`, `depth`)
- [ ] Depth limit enforcement (max 3 levels)
- [ ] Sub-agent run tree in Run Monitor
- [ ] Workflow definitions (sequential pipeline)
- [ ] Workflow Builder UI (step-by-step with dependency arrows)
- [ ] Workflow run history

### Success Criteria
- An orchestrator agent can break down "Write a market analysis report" into 3 parallel research agents + 1 compiler agent, and the user can watch the full tree in the Run Monitor.

---

## Phase 7 — Production Hardening (Week 17–18)
**Goal**: Ready for real, reliable use.

### Deliverables
- [ ] Container-based sandboxing (Docker-per-run option)
- [ ] Rate limiting on API endpoints
- [ ] LLM provider failover (try backup key/provider on error)
- [ ] Run output archiving to S3/R2
- [ ] Metrics endpoint (Prometheus)
- [ ] Health check endpoint
- [ ] Graceful shutdown (drain in-flight runs)
- [ ] Audit log (all mutations recorded)
- [ ] Email delivery on run completion
- [ ] Slack delivery on run completion
- [ ] Docker Compose production setup
- [ ] Documentation site

### Success Criteria
- Platform can run 20+ concurrent agents reliably, with no run loss on restart.

---

## Phase 8 — Multi-User & Teams (Future)
**Goal**: Multiple users can share a platform instance with proper isolation.

### Deliverables
- [ ] Team model + membership roles (Admin, Editor, Viewer)
- [ ] Resource scoping (agents/skills/jobs belong to team)
- [ ] OAuth login (GitHub, Google)
- [ ] Usage billing tracking per team
- [ ] Team invitation workflow
- [ ] Community skill registry (hosted index)

---

## Milestone Summary

| Phase | Repo(s) | Weeks | Key Outcome |
|---|---|---|---|
| 0 — Agent Core: Runtime | `agent-core` | 1–2 | Agent runs from CLI, streams to terminal |
| 1 — Agent Core: Tools + Skills | `agent-core` | 3–4 | Tools, skills, full binary feature set |
| 2 — Platform API: Foundation | `platform-api` | 5–7 | REST API + persistent runs + WebSocket |
| 3 — Web Portal: First UI | `platform-web` | 8–9 | Browser-based agent creation + live run monitor |
| 4 — Skills Repo + Skill Hub | `skills` + both platform repos | 10–11 | Skill registry live, UI skill picker |
| 5 — Scheduler | `platform-api` + `platform-web` | 12–13 | Agents run on cron schedule |
| 6 — Skill Library | `skills` | 14–15 | 15+ real-world skills |
| 7 — Orchestration | all repos | 16–18 | Multi-agent workflows |
| 8 — Hardening | all repos | 19–20 | Production ready |
| 9 — Multi-user | all repos | Future | Teams & sharing |

---

## What to Build First

Start with **Phase 0** — `agent-core` as a standalone binary. This is the right first step because:
- It produces something immediately useful (run agents from your terminal today)
- It validates the core loop, provider integrations, and tool system before building the platform around it
- When `platform-api` is ready, it just imports `pkg/agent` — no rewrite needed
- Skills developed for the standalone binary work identically in the platform

Everything else builds on top of a proven core.
