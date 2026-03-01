# Architecture Overview

## System Boundaries

The platform is decomposed into six core subsystems that each own a clear slice of responsibility:

```
╔══════════════════════════════════════════════════════════════════════╗
║                          AGENT PLATFORM                              ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐    ║
║  │                    Web Portal (Frontend)                     │    ║
║  │  Next.js / React — Agent Builder · Run Monitor · Skill Hub  │    ║
║  └──────────────────────────┬───────────────────────────────────┘    ║
║                             │ HTTPS / WebSocket                      ║
║  ┌──────────────────────────▼───────────────────────────────────┐    ║
║  │                    Platform API Server (Go)                  │    ║
║  │                                                              │    ║
║  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │    ║
║  │  │  Auth/Users │  │ Agent Manager│  │  Skill Registry    │  │    ║
║  │  └─────────────┘  └──────┬───────┘  └────────┬───────────┘  │    ║
║  │                          │                   │               │    ║
║  │  ┌───────────────────────▼───────────────────▼───────────┐  │    ║
║  │  │                  Job / Run Manager                    │  │    ║
║  │  │   · Queue runs · Assign workers · Track run state     │  │    ║
║  │  └───────────────────────┬───────────────────────────────┘  │    ║
║  └──────────────────────────┼───────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼───────────────────────────────────┐    ║
║  │                    Agent Runtime (Go)                        │    ║
║  │                                                              │    ║
║  │  ┌─────────────────┐   ┌──────────────┐  ┌──────────────┐   │    ║
║  │  │   Agent Core    │   │  Tool Engine │  │  Skill Loader│   │    ║
║  │  │  · LLM calls    │   │  · Exec tools│  │  · Load SKILL│   │    ║
║  │  │  · Turn loop    │   │  · Sandbox   │  │  · Inject ctx│   │    ║
║  │  │  · State mgmt   │   │  · Approval  │  │  · Register  │   │    ║
║  │  └─────────────────┘   └──────────────┘  └──────────────┘   │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼───────────────────────────────────┐    ║
║  │                   Scheduler (Go)                             │    ║
║  │   Cron Engine · Event Triggers · Retry Logic · Run Log      │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼───────────────────────────────────┐    ║
║  │                   Storage Layer                              │    ║
║  │   PostgreSQL (agents, skills, runs) · S3/FS (logs, outputs)  │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Subsystem Responsibilities

### 1. Web Portal
The user-facing interface. Built as a modern React/Next.js SPA.
- **Agent Builder** — form-driven UI to define an agent: name, system prompt/mission, model, skills, schedule
- **Skill Hub** — browse the skill registry, install/remove skills per agent
- **Run Monitor** — live streaming view of an agent run (token stream, tool calls, logs)
- **Run History** — paginated list of past runs with status, duration, cost
- **Settings** — API keys, LLM provider credentials, team/user management

### 2. Platform API Server
The Go HTTP server that is the single source of truth for all platform state.
- REST endpoints for CRUD on agents, skills, runs
- WebSocket endpoint for streaming run output to the browser
- Auth middleware (JWT or session-based)
- Passes agent run requests to the Job/Run Manager

### 3. Agent Runtime
Where agents actually execute. Designed to run as isolated goroutines (or separate processes for sandboxing).
- **Agent Core**: manages the LLM conversation loop (prompt → response → tool calls → loop)
- **Tool Engine**: executes tools declared by loaded skills (bash, HTTP, file, browser, etc.)
- **Skill Loader**: reads SKILL.md + associated tool definitions from the registry, injects skill context into the agent's system prompt

### 4. Scheduler
Owns the timing of when agents run.
- Parses and evaluates cron expressions, one-shot schedules, and "on demand" triggers
- Creates Run records and enqueues them for the Agent Runtime
- Tracks run state transitions: `queued → running → succeeded | failed`
- Retry logic with exponential backoff for failed runs

### 5. Skill Registry
Centralized store of agent capabilities.
- Skills are self-describing packages: a `SKILL.md` instruction file + optional tool definitions
- Registry supports: **bundled** (shipped with platform), **workspace** (user-created), **community** (installed from external source)
- Skills are versioned so an agent is pinned to a skill version

### 6. Storage Layer
- **PostgreSQL** (or SQLite for dev): users, agents, skill index, scheduled jobs, run records
- **Object store** (S3-compatible or local FS): run output logs, file attachments

---

## Data Flow: An Agent Run

```
User triggers run (manual or cron fires)
        │
        ▼
Scheduler creates RunRecord { status: queued }
        │
        ▼
Job Manager picks up RunRecord, allocates worker goroutine
        │
        ▼
Agent Runtime initializes:
  · Loads agent config (system prompt, model, skills)
  · Skill Loader reads each skill → injects into system prompt
  · Builds initial message with agent's mission
        │
        ▼
Agent Core begins turn loop:
  ┌──────────────────────────────────────┐
  │  1. Send messages to LLM             │
  │  2. Stream response back             │
  │  3. If tool call → Tool Engine exec  │
  │  4. Append tool result, loop again   │
  │  5. If no tool call → done           │
  └──────────────────────────────────────┘
        │
        ▼
Output streamed via WebSocket to Portal (if user is watching)
Output stored in Object Store as run log
RunRecord updated { status: succeeded, duration, token_usage }
        │
        ▼
(Optional) Delivery: send result via webhook, email, Slack, etc.
```

---

## Deployment Topology (Initial)

```
  [Browser] ──HTTPS──► [Next.js Frontend] ──API──► [Go API Server]
                                                         │
                                              ┌──────────┴──────────┐
                                              │                     │
                                       [Agent Runtime]      [Scheduler]
                                              │                     │
                                        [PostgreSQL]         [Filesystem/S3]
```

For scale: agent runtime workers can be extracted into a separate pool, scheduled via a task queue (e.g., River, Asynq, or custom).

---

## Key Design Principles

1. **Skills are the extension point** — The platform's power grows with its skill library. Skills should be easy to create and test.
2. **Runs are observable** — Every run is logged, streamed, and stored. You should always be able to replay what an agent did.
3. **Agents are config, not code** — Agents are data records. A non-engineer should be able to create one.
4. **Scheduler-first** — Agents are designed to run unattended. The scheduler is a first-class citizen, not an afterthought.
5. **LLM provider agnostic** — The runtime supports multiple providers (Anthropic, OpenAI, Google, local Ollama) switchable per agent.
