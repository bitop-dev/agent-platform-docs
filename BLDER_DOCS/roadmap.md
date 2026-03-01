# Build Roadmap

A phased plan that delivers real value at each milestone, building toward the full vision.

Each phase is labeled with the repo(s) it primarily lives in. See [repository-structure.md](../repository-structure.md) for repo boundaries.

---

## Phase 0 — Agent Core (`agent-core`) (Week 1–2)
**Goal**: A standalone agent binary that can run a mission from a YAML config and stream output to the terminal. No database, no web UI, no API — just the core runtime working end-to-end.

### Deliverables
- [ ] `agent-core` repo: Go module, directory structure, Makefile
- [ ] `AgentConfig` YAML schema + loader + validator (`viper`)
- [ ] Structured logging (`zap`)
- [ ] `Provider` interface + Anthropic streaming implementation
- [ ] Basic turn loop (text only — no tool calling yet)
- [ ] `RunEvent` channel-based event stream
- [ ] Text output renderer (streaming to stdout, with color)
- [ ] `agent-core run --config myagent.yaml --mission "..."` works end-to-end
- [ ] `agent-core validate` command
- [ ] Example agent YAML configs in `examples/`

### Success Criteria
`agent-core run --config examples/basic.yaml --mission "Explain what a goroutine is"` streams a response to the terminal from Claude.

---

## Phase 1 — Agent Core: Tools + Skills (`agent-core`) (Week 3–4)
**Goal**: Agents can call tools and load skills. The binary is fully useful for real tasks.

### Deliverables
- [ ] `Tool` interface + `ToolEngine` with parallel execution
- [ ] Built-in tools: `bash`, `http_request`, `file_read`, `file_write`
- [ ] Subprocess tool runner (external tools via stdin/stdout JSON)
- [ ] Tool sandboxing: path scope, network allowlist, timeout
- [ ] Tool calling in the turn loop (native + prompt-guided fallback)
- [ ] Skill loader: reads `SKILL.md`, injects into system prompt
- [ ] First bundled skills: `github`, `web_search`, `summarize`
- [ ] Loop detection (no-progress, ping-pong, failure streak)
- [ ] Deferred-action detection + retry prompt
- [ ] Credential scrubbing from tool output
- [ ] Approval manager (CLI prompts for dangerous tools)
- [ ] `agent-core chat` interactive mode
- [ ] JSON + JSONL output formats (`--format json|jsonl`)
- [ ] OpenAI provider + Ollama provider
- [ ] `pkg/agent` public API exported for `platform-api` to import

### Success Criteria
`agent-core run --config examples/standup-bot.yaml` calls the GitHub skill, fetches real issues, and produces a standup summary.

---

## Phase 2 — Platform API: Foundation (`platform-api`) (Week 5–7)
**Goal**: REST API that wraps agent-core — agents and runs are persistent, streamable over WebSocket.

### Deliverables
- [ ] `platform-api` repo: Go module, directory structure
- [ ] Database schema + migrations (SQLite dev, PostgreSQL prod)
- [ ] Agent CRUD API (`/api/v1/agents`)
- [ ] Runs API (`/api/v1/runs`) — triggers `agent-core/pkg/agent` in-process
- [ ] WebSocket run streaming (`/api/v1/runs/:id/stream`)
- [ ] Run persistence (run records + events stored in DB)
- [ ] JWT authentication (login/logout/refresh)
- [ ] Skills sync from `skills` repo → local DB registry
- [ ] Skills CRUD API (`/api/v1/skills`)

### Success Criteria
Can create an agent via API call, trigger a run, and stream its events over WebSocket.

---

## Phase 3 — Web Portal: First UI (`platform-web`) (Week 8–9)
**Goal**: A browser you can use to create agents and watch runs live.

### Deliverables
- [ ] `platform-web` repo: Next.js App Router setup
- [ ] Agent list + create + detail pages
- [ ] Run Monitor: live streaming view (WebSocket → token-by-token display)
- [ ] Run history page (paginated, filterable)
- [ ] Basic auth UI (login/logout)
- [ ] API key management (add LLM provider keys)

### Success Criteria
Can log in, create an agent through the browser, trigger a run, and watch it stream in real time.

---

## Phase 4 — Skills Repo + Skill Hub (`skills` + `platform-api` + `platform-web`) (Week 10–11)
**Goal**: The skills registry is live and agents can be equipped with skills from the UI.

### Deliverables
- [ ] `skills` repo: structure, `registry.json`, `CONTRIBUTING.md`
- [ ] First 5 skills: `github`, `web_search`, `summarize`, `slack`, `healthcheck`
- [ ] Skill Hub UI: browse, search, filter by tier/tag
- [ ] Agent Builder UI: multi-step wizard (Identity → Mission → Skills → Review)
- [ ] Skill detail page (description, tools, which agents use it)
- [ ] Community skill install from Git URL

### Success Criteria
User browses the Skill Hub, adds the `github` skill to an agent, and runs it — without touching any files.

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
| **Web** | `web_search`, `browser` (headless), `http_request` |
| **Code** | `github`, `bash`, `file_ops` |
| **Data** | `summarize`, `csv_reader`, `json_parser` |
| **Communication** | `slack`, `discord`, `email_send` |
| **Productivity** | `notion`, `calendar`, `trello` |
| **Monitoring** | `healthcheck`, `uptime_check`, `log_reader` |
| **AI** | `image_gen`, `transcribe` |

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
- [ ] Bundled skills (start with 5): `web_search`, `summarize`, `http_request`, `file_ops`, `github`
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
| **Web** | `web_search`, `browser` (headless), `http_request` |
| **Code** | `github` (issues, PRs, code), `bash`, `file_ops` |
| **Data** | `summarize`, `csv_reader`, `json_parser` |
| **Communication** | `slack`, `discord`, `email_send` |
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
