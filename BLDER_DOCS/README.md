# BLDER_DOCS — Agent Platform Design Documentation

Architecture, design, and planning documents for the AI Agent Platform.

> These docs were written before implementation and guided the build of all three repos. They remain the authoritative design reference.

---

## Build Status

| Phase | Repo | Status | Artifacts |
|---|---|---|---|
| 0 — Core Runtime | agent-core | ✅ Complete | 84 files, 11K lines, 111 tests |
| 1 — Tools + Skills | agent-core | ✅ Complete | 8 tools, skills, MCP, safety |
| 2 — Platform API | agent-platform-api | ✅ Complete | 62 files, 5.5K lines, 22 tests |
| 3 — Web Portal | agent-platform-web | ✅ Complete | 45 files, ~3K lines, 11 pages |
| 4 — Skill Hub | skills + all repos | ✅ Complete | 5 skills, multi-source registry, CLI + UI |
| 5 — Scheduler | platform-api + web | 🔜 Next | — |
| 6–9 | Various | Planned | — |

---

## Architecture Documents

| Document | Description |
|---|---|
| [architecture/overview.md](architecture/overview.md) | System-wide architecture — 4 repos, dependency rules, component map |
| [architecture/agent-core.md](architecture/agent-core.md) | Agent runtime — turn loop, provider interface, event model, context management |
| [architecture/skill-registry.md](architecture/skill-registry.md) | Skill discovery, SKILL.md format, loading pipeline, tiers |
| [architecture/scheduler.md](architecture/scheduler.md) | Cron engine, job queue, trigger types, overlap policies |
| [architecture/web-platform.md](architecture/web-platform.md) | Web portal routes, API design, UI components, auth model |
| [architecture/orchestration.md](architecture/orchestration.md) | Multi-agent coordination — spawn, registry, depth limits |
| [architecture/data-model.md](architecture/data-model.md) | Full database schema for all entities |

## Deep Dive Documents

| Document | Description |
|---|---|
| [agent-core-deep-dive.md](agent-core-deep-dive.md) | 920+ lines — Go code samples, YAML config, CLI commands, directory structure, build order |
| [agent-core-gaps.md](agent-core-gaps.md) | Gap analysis — 8 gaps identified and resolved (MCP, model catalog, reliable provider, etc.) |
| [skill-registry-deep-dive.md](skill-registry-deep-dive.md) | 800+ lines — 8 gaps, dependency install flow, testing spec, community process |
| [tools-deep-dive.md](tools-deep-dive.md) | Three-tier tool system — core tools, subprocess protocol, sandboxing, agent-level config |

## Planning Documents

| Document | Description |
|---|---|
| [tech-stack.md](tech-stack.md) | Technology choices with rationale per repo |
| [roadmap.md](roadmap.md) | 9-phase build plan — Phases 0–3 complete, 4+ planned |
| [repository-structure.md](repository-structure.md) | Multi-repo boundaries, dependency graph, dev workflow |
| [reference-projects.md](reference-projects.md) | Analysis of 4 open-source agent projects (gastown, openclaw, zeroclaw, pi-mono) |

## Skills Reference Implementations

7 bundled skill packages with full SKILL.md, tool schemas, and test fixtures:

| Skill | Description | Tools |
|---|---|---|
| [web_search](skills/web_search/) | Search via DuckDuckGo (pluggable backends) | `web_search.py` |
| [web_fetch](skills/web_fetch/) | Fetch URL → readable markdown | `web_fetch` |
| [summarize](skills/summarize/) | Condense long text (instruction-only) | — |
| [github](skills/github/) | Issues, PRs via `gh` CLI | `gh_issues`, `gh_prs` |
| [gitlab](skills/gitlab/) | Issues, MRs via `glab` CLI | `glab_issues`, `glab_mrs` |
| [report](skills/report/) | Structured markdown output (instruction-only) | — |
| [send_email](skills/send_email/) | Send email via SMTP | — |

Community contribution guide: [skills/CONTRIBUTING.md](skills/CONTRIBUTING.md)

## Diagrams

Excalidraw format (editable) + PNG exports:

| Diagram | Description |
|---|---|
| [01-system-architecture.png](diagrams/01-system-architecture.png) | All repos + providers + storage + MCP |
| [02-tool-tiers.png](diagrams/02-tool-tiers.png) | Core → Skill → MCP tool tiers |
| [03-agent-turn-loop.png](diagrams/03-agent-turn-loop.png) | Main agent loop flowchart |
| [04-skill-loading.png](diagrams/04-skill-loading.png) | Install pipeline + runtime loading |
| [05-multi-repo.png](diagrams/05-multi-repo.png) | 4-repo dependency graph |
