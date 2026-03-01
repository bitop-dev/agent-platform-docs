# Repository Structure

The platform is split into separate repositories. Each has a distinct purpose, release cycle, and potential contributor base. They are designed so that any one of them can be used independently of the others.

---

## The Repos

```
github.com/[org]/
├── agent-core          ← The standalone agent binary + Go library
├── skills              ← Community skill registry
├── platform-api        ← The orchestration API server (Go)
└── platform-web        ← The web portal (Next.js)
```

---

## Why Separate Repos?

| Concern | Implication |
|---|---|
| **Different consumers** | `agent-core` is useful on its own (devs, CLI users, server scripts). The web portal is useful without ever touching the core source. |
| **Different release cadence** | Skills can be updated constantly by the community. The API server changes less frequently. The core binary follows semver stability. |
| **Different contributors** | A skill author doesn't need to understand the agent loop. A web developer doesn't need to understand how Anthropic streaming works. |
| **Different deployment targets** | `agent-core` lives on a machine or server. `platform-web` deploys to a CDN. `platform-api` runs as a service. |
| **Cleaner dependency graphs** | `platform-api` can import `agent-core` as a Go module. The web layer only talks to the API over HTTP. No circular deps. |

---

## `agent-core` — `github.com/[org]/agent-core`

**What it is**: The agent runtime. A standalone Go binary you can install and run anywhere, and also a Go library that the `platform-api` imports.

**Who uses it**:
- Developers running agents from the CLI directly
- The `platform-api` imports it as a library to execute agent runs
- Anyone who wants to embed an agent runtime in their own Go project

**Can run without**: everything else

**Key outputs**:
- `agent-core` binary (installable via `go install`, Homebrew, etc.)
- Go package: `github.com/[org]/agent-core/pkg/agent`

```
agent-core/
├── cmd/agent-core/     ← CLI entrypoint
├── internal/           ← Private implementation
│   ├── agent/          ← Turn loop, events, detection
│   ├── provider/       ← LLM provider implementations
│   ├── tool/           ← Tool interface, built-in tools, subprocess runner
│   ├── skill/          ← SKILL.md loader
│   ├── config/         ← YAML config
│   └── output/         ← Text/JSON/JSONL renderers
├── pkg/
│   └── agent/          ← Public API (for platform-api to import)
├── skills/             ← Bundled skills shipped with the binary
├── examples/           ← Example agent YAML configs
└── go.mod              ← module github.com/[org]/agent-core
```

---

## `skills` — `github.com/[org]/skills`

**What it is**: The community skill registry. A collection of skills (SKILL.md + tool definitions) maintained separately from the runtime. Think of it like a package registry, but simpler — it's just a structured directory of skills in a Git repo.

**Who uses it**:
- Anyone adding skills to their agents
- The `platform-api` can pull skills from this repo (or a hosted mirror)
- `agent-core` users can point `--skills-repo` at this repo

**Can run without**: everything else — skills work with agent-core standalone

**Key outputs**:
- A directory of skills, each with a standard structure
- A `registry.json` index of all available skills (name, version, description, tags)
- Git tags per skill version (e.g., `skills/github@1.2.0`)

```
skills/
├── registry.json           ← Index of all skills
├── github/
│   ├── skill.json          ← Metadata: name, version, description, tags
│   ├── SKILL.md            ← Injected into agent system prompt
│   └── tools/
│       ├── list_issues.json     ← Tool JSON schema
│       └── list_issues.sh       ← Tool implementation
├── web_search/
│   ├── skill.json
│   ├── SKILL.md
│   └── tools/
│       └── search.go
├── slack/
├── summarize/
├── healthcheck/
├── ...
└── CONTRIBUTING.md         ← How to add a new skill
```

**Why separate from agent-core?**
Skills evolve constantly — new integrations, bug fixes, API updates. The runtime doesn't need to change for a skill to be updated. Community members can contribute skills without needing to understand the Go runtime.

---

## `platform-api` — `github.com/[org]/platform-api`

**What it is**: The Go API server. It orchestrates agents, manages the scheduler, stores run history, and serves the web portal's data. It imports `agent-core` as a library.

**Who uses it**:
- The `platform-web` frontend talks to it over HTTP/WebSocket
- Power users who want to drive the platform programmatically via REST API
- Automation scripts that want to trigger agent runs via webhook

**Depends on**: `agent-core` (imported as Go module)

**Can run without**: `platform-web` (headless API is fully useful on its own)

```
platform-api/
├── cmd/server/         ← API server entrypoint
├── internal/
│   ├── api/            ← HTTP handlers, routing, middleware
│   ├── runner/         ← Wraps agent-core, manages run workers
│   ├── scheduler/      ← Cron engine, job manager
│   ├── storage/        ← DB layer (sqlc-generated)
│   ├── skillsync/      ← Syncs from skills repo → local registry
│   └── auth/           ← JWT auth
├── migrations/         ← SQL schema migrations
└── go.mod              ← imports github.com/[org]/agent-core
```

---

## `platform-web` — `github.com/[org]/platform-web`

**What it is**: The Next.js web portal. The UI for creating agents, assigning skills, setting schedules, and watching runs in real-time.

**Who uses it**: End users who want a no-code interface for the platform.

**Depends on**: `platform-api` (via HTTP/WebSocket only — no code imports)

**Can run without**: none of the others (just needs the API URL configured)

```
platform-web/
├── app/                ← Next.js App Router pages
│   ├── agents/
│   ├── skills/
│   ├── runs/
│   └── settings/
├── components/         ← Shared React components
│   ├── AgentBuilder/
│   ├── RunMonitor/
│   ├── SkillHub/
│   └── ui/             ← shadcn/ui components
├── lib/
│   ├── api-client.ts   ← Generated from OpenAPI spec
│   └── hooks/
└── package.json
```

---

## Dependency Graph

```
platform-web
    │
    │ HTTP + WebSocket
    ▼
platform-api  ──imports──►  agent-core (pkg/agent)
                                 │
                                 │ reads skills from
                                 ▼
                             skills repo
                          (local clone or CDN)
```

- `agent-core` has **zero** dependencies on the other repos
- `skills` has **zero** dependencies on the other repos
- `platform-api` depends on `agent-core`
- `platform-web` depends only on `platform-api`'s HTTP contract (OpenAPI spec)

---

## How They Work Together

**Scenario: User creates an agent in the web portal and runs it on a schedule**

1. User opens `platform-web`, builds an agent, assigns the `github` skill, sets a cron schedule
2. `platform-web` calls `platform-api` REST endpoints to save the agent and job config
3. `platform-api`'s scheduler fires at the scheduled time, creates a run record
4. `platform-api`'s runner calls `agent-core/pkg/agent` in-process to execute the run
5. `agent-core` loads the `github` skill from the local skills clone
6. Events stream from `agent-core` → `platform-api` → WebSocket → `platform-web`
7. User watches the run live in the browser

**Scenario: Developer runs an agent directly from CLI**

```bash
# Install agent-core standalone — no other repos needed
brew install agent-core

# Install a skill from the community registry
agent-core skill install github

# Run
agent-core run --config myagent.yaml --mission "List open P0 bugs"
```

---

## Versioning Strategy

| Repo | Versioning |
|---|---|
| `agent-core` | Semver (`v1.2.3`). Public Go API is stable between minor versions. |
| `skills` | Per-skill tags (`skills/github@1.2.0`). Skills are independently versioned. `registry.json` is the source of truth for latest versions. |
| `platform-api` | Semver. API version in URL (`/api/v1/`). Breaking changes bump major version. |
| `platform-web` | Date-based or semver. Follows `platform-api` version compatibility. |

---

## Development Workflow

For local development of the full stack:

```bash
# Clone all repos into a workspace
mkdir workspace && cd workspace
git clone github.com/[org]/agent-core
git clone github.com/[org]/skills
git clone github.com/[org]/platform-api
git clone github.com/[org]/platform-web

# agent-core: develop + test standalone
cd agent-core
go test ./...
go run ./cmd/agent-core run --config examples/standup-bot.yaml

# platform-api: use local agent-core via replace directive in go.mod
cd platform-api
# go.mod: replace github.com/[org]/agent-core => ../agent-core
go run ./cmd/server

# platform-web: point at local API
cd platform-web
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

---

## What Stays in This Planning Repo

This `agent_platform` repository is the **planning and documentation home**. It holds:
- `BLDER_DOCS/` — all architecture, design, and planning docs
- `opensrc/` — reference project source code

As the actual repositories are created, each gets its own `README.md` and `ARCHITECTURE.md` that references back to these planning docs.
