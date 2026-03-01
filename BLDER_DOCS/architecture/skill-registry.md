# Skill Registry

Skills are the extension mechanism of the platform. A skill is a self-contained package that gives an agent new capabilities — tools it can call, context it should know, or workflows it should follow.

> **Deep dive**: See [`skill-registry-deep-dive.md`](../skill-registry-deep-dive.md) for a full gap analysis against zeroclaw and openclaw's production skill systems, including Go interface stubs, tool examples, and a week-by-week build order.

---

## What Is a Skill?

A skill has two parts:

1. **`SKILL.md`** — A markdown document with YAML frontmatter (metadata) and a markdown body (agent instructions). The body is injected into the agent's system prompt. This is the "instruction manual" for the agent.

2. **Tool definitions** — Optional JSON schemas + implementations in `tools/`. The tool engine registers these so the LLM can invoke them.

### Skill Structure on Disk

```
skills/
└── github/
    ├── SKILL.md          ← frontmatter metadata + agent instructions
    └── tools/
        ├── gh_list_issues.json   ← Tool input schema (JSON Schema)
        └── gh_list_issues.sh     ← Tool implementation (bash, python, compiled binary)
```

No separate `skill.json` — all metadata lives in `SKILL.md` frontmatter.

### `SKILL.md` Frontmatter Schema

```yaml
---
name: github
version: 1.2.0
description: "GitHub operations via `gh` CLI. Use when: checking PRs, CI, creating issues. NOT for: local git ops, non-GitHub repos."
author: platform-team
tags: [code, vcs, github]
emoji: 🐙
always: false           # inject full instructions always, even in compact mode

requires:
  bins: [gh]            # all of these must be in PATH
  any_bins: []          # at least one of these must be in PATH
  env: []               # all of these must be set as env vars

install:                # how to install the skill's dependencies
  - id: brew
    kind: brew          # brew | shell | node | go | uv | download
    formula: gh
  - id: apt
    kind: shell
    command: "apt-get install -y gh"
    os: [linux]
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub repositories...
```

**Critical design rule for `description`**: The description is the signal the LLM uses to decide whether to load a skill. It must include explicit "Use when:" and "NOT for:" guidance so the agent can make a good judgment call in compact mode.

---

## Skill Tiers

| Tier | Description | Location |
|---|---|---|
| **Bundled** | Shipped with `agent-core` binary, always available | `embedded in binary` |
| **Local** | Created by the user in their workspace | `~/.agent-core/skills/` |
| **Community** | Installed from Git URL, zip, or registry | `~/.agent-core/skills/` |

All non-bundled skills live in `~/.agent-core/skills/<name>/` on disk.

---

## Eligibility Checking

Before any skill is loaded for an agent run, its dependencies are checked. Ineligible skills are excluded and logged — they don't waste tokens or confuse the LLM.

```
$ agent-core skills list

✓ github      v1.2.0  GitHub operations via gh CLI
✗ notion      v1.0.0  [missing env: NOTION_API_KEY]
✓ web_search  v1.1.0  Search the web via Brave Search API
✗ slack       v1.0.0  [missing env: SLACK_BOT_TOKEN]
```

---

## Prompt Injection Modes

With many skills, full injection burns thousands of tokens before the agent starts. Two modes address this:

**Full mode** (default for ≤ 5 active skills):
- The full SKILL.md body for each skill is merged into the system prompt.
- Skills marked `always: true` are always fully injected regardless of mode.

**Compact mode** (default for > 5 active skills, or explicitly set):
- Only skill name, description, and a location hint are injected — a catalog.
- The agent uses the built-in `skill_load` tool to pull in a specific skill's full instructions when it needs them.
- This cuts per-run token overhead dramatically.

**Config**:
```yaml
skills:
  injection_mode: auto   # auto | full | compact
  compact_threshold: 5   # switch to compact above this skill count
```

---

## Skill Registry Service

```go
type SkillRegistry interface {
    // List skills with eligibility status
    List(ctx context.Context) ([]SkillStatus, error)

    // Get a skill by name
    Get(ctx context.Context, name string) (*Skill, error)

    // Check eligibility in the current environment
    CheckEligibility(skill Skill) EligibilityResult

    // Install from any supported source
    Install(ctx context.Context, source string) (*Skill, error)

    // Remove an installed skill
    Remove(ctx context.Context, name string) error

    // Scaffold a new skill from a template
    Scaffold(name, template, destDir string) error

    // Audit a skill directory (no side effects, returns findings)
    Audit(path string) (AuditReport, error)

    // Build the snapshot for a run:
    // - Resolves skills, checks eligibility
    // - Applies injection mode (full vs compact)
    // - Returns system prompt fragment + tool definitions
    BuildSnapshot(ctx context.Context, refs []SkillRef, mode InjectionMode) (*SkillSnapshot, error)
}

type SkillSnapshot struct {
    SystemPromptFragment string        // merged prompt (full or compact listing)
    Tools                []ToolDef     // tools from all eligible skills
    SkillLoadTool        *ToolDef      // set only in compact mode
    EligibleSkills       []string      // skill names included
    SkippedSkills        []SkillStatus // ineligible, with reasons
}
```

---

## Tool Engine

The Tool Engine registers and dispatches tool calls.

### Tool Definition

```go
type ToolDefinition struct {
    Name        string          // e.g., "gh_list_issues"
    Description string          // What this tool does (shown to LLM)
    InputSchema json.RawMessage // JSON Schema for input parameters
    Handler     ToolHandler
}

type ToolHandler func(ctx context.Context, input json.RawMessage) (ToolResult, error)

type ToolResult struct {
    Content string      // Text returned to LLM
    IsError bool
}
```

### Tool Implementation Types

Skill tools are implemented as external processes — language agnostic, communicate via stdin/stdout JSON:

| Implementation | How it works |
|---|---|
| Shell (`.sh`) | Bash script; reads JSON from stdin, writes JSON to stdout |
| Python (`.py`) | Python script; same stdin/stdout protocol |
| Ruby (`.rb`) | Ruby script; same protocol |
| Binary (no ext) | Any compiled binary (Go, Rust, C, etc.); same protocol |

Any language that can read stdin and write stdout works. See [tools-deep-dive.md](../tools-deep-dive.md) for the full protocol spec, sandboxing constraints, and examples in bash, Python, and Go.

### Built-in Platform Tools

Platform tools (not from skills) are always available:

| Tool | Description |
|---|---|
| `bash` | Execute shell commands |
| `http_fetch` | Make HTTP GET/POST requests |
| `file_read` | Read files |
| `file_write` | Write files |
| `skill_load` | Load a skill's full instructions (compact mode only) |
| `agent_spawn` | Spawn a sub-agent (see orchestration.md) |

---

## Security Audit

Before a skill is installed, it is audited:

- **Manifest check**: `SKILL.md` must be present
- **Path traversal**: No filenames like `../../etc/passwd`
- **Zip bomb**: Compression ratio > 100x is rejected; total > 50 MB is rejected
- **Dangerous patterns**: Shell patterns like `curl | bash`, credential harvesting, `rm -rf /`

Audit runs automatically during `skill install`. Users can also run it explicitly:
```
agent-core skill audit ./my-skill/
```

---

## CLI Commands

```
agent-core skill list                          List installed skills with eligibility
agent-core skill install <source>             Install from any source
agent-core skill install --from-config <yaml> Install all skills declared in an agent config
agent-core skill remove <name>                Remove an installed skill
agent-core skill update <name>                Update to latest version (community skills)
agent-core skill audit <path>                 Security scan without installing
agent-core skill new <name> --template <t>    Scaffold a new skill (bash, python, go)
agent-core skill templates                    List available scaffold templates
agent-core skill test <path> [--tool <name>]  Test a skill locally
```

**Install flags:**

| Flag | Behavior |
|---|---|
| *(default)* | Prompt for each missing dependency (interactive) |
| `--yes`, `-y` | Auto-accept all dependency installs (CI/CD, scripts) |
| `--skip-deps` | Install skill files only, don't touch dependencies |

Also accepts `AGENT_CORE_YES=1` env var as equivalent to `--yes`.

**Install source formats:**

| Format | Example |
|---|---|
| Local directory | `./my-skill` |
| Local zip | `./my-skill.zip` |
| Git URL | `git@github.com:org/skill.git` |
| HTTPS zip | `https://example.com/skill.zip` |
| Registry | `community/github@1.2.0` |

---

## Skill Injection Format

Skills are injected as XML-escaped blocks in the system prompt:

```xml
<available_skills>
  <skill>
    <name>github</name>
    <description>GitHub operations via gh CLI...</description>
    <instructions>
      # GitHub Skill
      [full SKILL.md body]
    </instructions>
    <tools>
      <tool><name>gh_list_issues</name><description>...</description></tool>
    </tools>
  </skill>
</available_skills>
```

In compact mode, the `<instructions>` and `<tools>` blocks are omitted and a `<note>` is added prompting the agent to call `skill_load` when needed.

---

## Per-Skill Configuration

Skills accept configuration from the agent YAML. The LLM controls `arguments` (what to do); the human controls `config` (how). They never mix.

```yaml
# agent.yaml
skills:
  - github                       # simple — default config
  - web_search:                  # config form
      backend: ddg
      max_results: 10
```

Config is passed to the tool subprocess on stdin as a separate `config` field — the LLM never sees it. See [skill-registry-deep-dive.md](../skill-registry-deep-dive.md#per-skill-configuration) for the full protocol.

---

## Versioning

- **Bundled skills**: Version with the `agent-core` binary. No independent versioning.
- **Community skills**: Semver via git tags. `registry.json` has a `latest` field per skill. `skill install github` resolves latest; `skill install github@1.2.0` pins.
- **Local skills**: No versioning — user manages their own files.

---

## Skill Testing

```bash
agent-core skill test ./my-skill/                 # full: validate + eligibility + run fixtures
agent-core skill test ./my-skill/ --validate-only  # structure check only
agent-core skill test ./my-skill/ --tool search    # run specific tool's fixtures
```

Test fixtures live in `tests/` inside the skill:
```
tests/
├── web_search.basic.json              ← test input
└── web_search.basic.expected.json     ← pattern-match assertions
```

Expected output uses pattern matching (not exact match):
```json
{
  "is_error": false,
  "content_contains": ["result"],
  "content_not_empty": true
}
```

See [skill-registry-deep-dive.md](../skill-registry-deep-dive.md#skill-testing) for the full testing spec.

---

## Local Skills

Users create skills directly on disk without going through the registry:

```bash
# Scaffold a new local skill
agent-core skill new my-tool --template bash

# Creates:
# ~/.agent-core/skills/my-tool/
# ├── SKILL.md
# ├── tools/
# │   ├── my_tool.json
# │   └── my_tool.sh
# └── tests/
#     └── my_tool.basic.json
```

Local skills live in `~/.agent-core/skills/` and are referenced by name in agent YAML:

```yaml
skills:
  - my-tool              # loaded from ~/.agent-core/skills/my-tool/
  - github               # bundled — compiled into binary
```

**Resolution order**: When an agent references a skill by name, agent-core checks:
1. Bundled skills (compiled in)
2. Local skills (`~/.agent-core/skills/<name>/`)
3. Not found → error with install hint

Local skills can override bundled skills. If you have `~/.agent-core/skills/github/`, it takes priority over the bundled `github` — this lets users customize or patch bundled skills without waiting for a release.

**Local skills are not versioned or tracked** — they're just directories on disk. The user manages them with normal file operations or `agent-core skill new` / `agent-core skill remove`.

---

## Community Skills Repo

The `skills` repository is a separate Git repo. Registry model is **Git-native**: the canonical ID for a community skill is its git URL. `registry.json` provides short-name resolution for curated skills.

```
skills/
├── registry.json          ← maps short names to git URLs + versions
├── CONTRIBUTING.md
├── web_search/
│   ├── SKILL.md
│   ├── tools/
│   └── tests/
├── github/
├── gitlab/
├── summarize/
├── web_fetch/
├── report/
├── send_email/
└── ...                    ← community contributions
```

**`registry.json`** format:
```json
{
  "version": 1,
  "updated_at": "2026-02-28",
  "skills": {
    "github": {
      "latest": "1.2.0",
      "description": "GitHub operations via gh CLI...",
      "tags": ["code", "vcs"],
      "source": "github.com/[org]/skills",
      "path": "github",
      "versions": {
        "1.2.0": { "tag": "v1.2.0", "sha": "abc123" },
        "1.1.0": { "tag": "v1.1.0", "sha": "def456" }
      }
    }
  }
}
```

---

## Reference Projects

| Project | Relevant Part |
|---|---|
| `openclaw/skills/` | 50+ real skill implementations |
| `openclaw/src/agents/skills/` | Skill loading, frontmatter parsing, snapshot build |
| `openclaw/src/agents/skills-install.ts` | Install from external sources + security scan |
| `openclaw/src/agents/skills/types.ts` | `SkillEntry`, `SkillSnapshot`, `SkillInstallSpec` types |
| `zeroclaw/src/skills/mod.rs` | Full skill system: TOML manifest, install sources, scaffolding |
| `zeroclaw/src/skills/audit.rs` | Security audit implementation |
| `zeroclaw/src/skills/templates.rs` | Skill scaffolding templates |
