# Agent Platform — Planning Repository

This repository contains the architecture, design documentation, and reference implementations for an **AI agent platform** — a system for building, running, and orchestrating autonomous AI agents.

## What We're Building

A multi-repo platform with four components:

| Repository | Language | Purpose |
|---|---|---|
| **agent-core** | Go | Standalone CLI binary for running AI agents. No web UI, no database required. Also exposes `pkg/agent` as a Go library. |
| **skills** | Any | Community skill registry. Skills are SKILL.md files + tool implementations that extend agent capabilities. |
| **platform-api** | Go | HTTP API server that imports `agent-core` as a library. Adds scheduling, persistence, multi-tenancy. |
| **platform-web** | TypeScript | Next.js web portal for creating agents, browsing skills, monitoring runs. Talks to `platform-api` over REST + WebSocket. |

The build order is deliberate: **agent-core first**, then skills, then the platform layers. The core binary must work standalone before we build anything on top of it.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│            platform-web (Next.js)               │
│        Create agents · Browse skills · Monitor  │
└────────────────────────┬────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────┐
│            platform-api (Go)                    │
│      Auth · Agent CRUD · Scheduler · Storage    │
└──────┬──────────────────────────┬───────────────┘
       │ imports pkg/agent        │ manages jobs
┌──────▼──────────┐      ┌───────▼───────┐
│   agent-core    │      │   Scheduler   │
│   (Go binary)   │      │ (cron engine) │
│                 │      └───────────────┘
│ · LLM Providers │
│ · Tool Engine   │──────── skills repo
│ · Skill Loader  │      (community registry)
│ · MCP Client    │
└─────────────────┘
```

## Key Design Decisions

- **Standalone-first**: `agent-core` works as a CLI with zero infrastructure. The platform adds value on top but isn't required.
- **Skills as SKILL.md**: Skills are markdown files with YAML frontmatter (metadata) and a body (agent instructions). Tools are subprocess executables that communicate via stdin/stdout JSON.
- **Three-tier tools**: Core tools compiled into the binary (bash, read_file, etc.), skill tools installed as packages, MCP tools from external servers.
- **Git-native registry**: Community skills live in a Git repo. Install via URL or short name from `registry.json`. No hosted registry service required.
- **Subprocess sandboxing**: External tool processes run with timeouts, output caps, env var allowlists, and locked working directories. No WASM — subprocess constraints are sufficient for the trust model.
- **Pluggable LLM providers**: Anthropic, OpenAI, Google, Ollama, and any OpenAI-compatible endpoint. Provider retry, backoff, API key rotation, and model fallback chains built in.

## Documentation

All planning docs live in [`BLDER_DOCS/`](BLDER_DOCS/):

### Architecture
| Document | Description |
|---|---|
| [architecture/overview.md](BLDER_DOCS/architecture/overview.md) | System-wide architecture diagram and component map |
| [architecture/agent-core.md](BLDER_DOCS/architecture/agent-core.md) | Agent runtime engine design |
| [architecture/skill-registry.md](BLDER_DOCS/architecture/skill-registry.md) | Skill discovery, loading, and execution |
| [architecture/scheduler.md](BLDER_DOCS/architecture/scheduler.md) | Cron-based and event-driven job scheduling |
| [architecture/web-platform.md](BLDER_DOCS/architecture/web-platform.md) | Web portal, API, and UI design |
| [architecture/orchestration.md](BLDER_DOCS/architecture/orchestration.md) | Multi-agent coordination and workflow |
| [architecture/data-model.md](BLDER_DOCS/architecture/data-model.md) | Database schemas and persistence |

### Deep Dives
| Document | Description |
|---|---|
| [agent-core-deep-dive.md](BLDER_DOCS/agent-core-deep-dive.md) | Comprehensive agent-core design — Go code samples, CLI, config, directory structure, build order |
| [agent-core-gaps.md](BLDER_DOCS/agent-core-gaps.md) | Gap analysis from reference project review |
| [skill-registry-deep-dive.md](BLDER_DOCS/skill-registry-deep-dive.md) | Skill system analysis — 8 gaps identified, dependency install flow, testing spec |
| [tools-deep-dive.md](BLDER_DOCS/tools-deep-dive.md) | Three-tier tool system — core tools, subprocess protocol, sandboxing, agent config |

### Planning
| Document | Description |
|---|---|
| [tech-stack.md](BLDER_DOCS/tech-stack.md) | Technology decisions with rationale |
| [roadmap.md](BLDER_DOCS/roadmap.md) | 9-phase build plan with milestones |
| [repository-structure.md](BLDER_DOCS/repository-structure.md) | Multi-repo boundaries, dependency graph, dev workflow |
| [reference-projects.md](BLDER_DOCS/reference-projects.md) | Analysis of open-source reference projects |

### Reference Implementations
| Document | Description |
|---|---|
| [skills/README.md](BLDER_DOCS/skills/README.md) | Index of 7 bundled skill specs |
| [skills/CONTRIBUTING.md](BLDER_DOCS/skills/CONTRIBUTING.md) | Community skill submission guide |

### Diagrams
Excalidraw diagrams and exported PNGs in [`BLDER_DOCS/diagrams/`](BLDER_DOCS/diagrams/):
- System architecture overview
- Three-tier tool system
- Agent turn loop
- Skill install & loading flow
- Multi-repo dependency graph

## Bundled Skills

Seven skills ship with `agent-core`:

| Skill | Description | Key dependency |
|---|---|---|
| `web_search` | Search the web via DuckDuckGo (pluggable: Brave, Serper, Tavily, SearXNG) | `python3` |
| `web_fetch` | Fetch a URL, extract readable content as markdown | `python3` |
| `summarize` | Summarize long text (instruction-only, uses the agent's LLM) | none |
| `github` | GitHub operations via `gh` CLI | `gh` |
| `gitlab` | GitLab operations via `glab` CLI | `glab` |
| `report` | Structure output into formatted markdown documents (instruction-only) | none |
| `send_email` | Send email via SMTP | SMTP env vars |

Reference implementations with SKILL.md, tool schemas, and test fixtures are in [`BLDER_DOCS/skills/`](BLDER_DOCS/skills/).

## Current Status

**Phase: Planning & Design** — No production code yet. This repo contains only documentation, reference specs, and design artifacts.

The design is informed by studying four open-source agent projects:
- **gastown** (Go) — multi-agent orchestration patterns
- **openclaw** (TypeScript) — production AI assistant with 50+ skills
- **zeroclaw** (Rust) — hardened agentic runtime with WASM tools
- **pi-mono** (TypeScript) — minimal agent toolkit with clean event model

## What's Next

1. **Build `agent-core`** — scaffold Go module, implement the turn loop, providers, core tools
2. **Build bundled skills** — implement the 7 skill specs as real tools
3. **Set up `skills` repo** — registry.json, CI checks, community contribution flow
4. **Build `platform-api`** — import agent-core, add REST API, scheduler, persistence
5. **Build `platform-web`** — Next.js portal with agent builder, skill marketplace, run monitoring
