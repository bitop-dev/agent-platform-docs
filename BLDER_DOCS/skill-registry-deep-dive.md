# Skill Registry — Deep Dive

A thorough analysis of the skill systems in **zeroclaw** (Rust) and **openclaw** (TypeScript), compared against our current plan. The existing `architecture/skill-registry.md` has the right shape but misses several important real-world patterns. This doc captures what we need to build.

---

## What the Reference Projects Teach Us

### openclaw — The Most Complete Skill System

Fifty-plus production skills. The patterns here are battle-tested at scale.

**Key insights:**

1. **The one-line `description` is load-bearing** — It's what the LLM reads to decide if a skill is relevant to the current task. Real skills use explicit "Use when:" and "NOT for:" guidance:
   ```
   description: "GitHub operations via `gh` CLI: issues, PRs, CI runs.
     Use when: (1) checking PR status, (2) creating issues.
     NOT for: local git operations (use git directly), non-GitHub repos."
   ```

2. **Metadata lives in SKILL.md frontmatter** — Not a separate `skill.json`. Everything in one file:
   ```yaml
   ---
   name: github
   description: "..."
   metadata:
     openclaw:
       emoji: "🐙"
       requires:
         bins: ["gh"]
       install:
         - id: brew
           kind: brew
           formula: gh
           bins: ["gh"]
   ---
   # GitHub Skill
   ... the actual instructions ...
   ```

3. **Skills declare their dependencies** — Required CLI tools, env vars, config keys. Skills that are missing their deps are silently excluded from the active list.

4. **Install specs** — Skills declare exactly how to install their deps (brew, npm, apt, go install, binary download). Enables `agent-core skill install <name>` to actually work.

5. **Snapshot pattern** — At run start, compute a "skill snapshot": the merged prompt for all *eligible* skills. This is cached and what gets sent to the LLM. Not recomputed per turn.

6. **Invocation policy** — `user-invocable` and `disable-model-invocation` flags let skills be restricted to user-only or system-only invocation.

### zeroclaw — The Most Principled Skill Architecture

**Key insights:**

1. **Two manifest formats, one winner** — `SKILL.toml` (structured, preferred) and `SKILL.md` with front matter. TOML takes priority when both exist:
   ```toml
   # SKILL.toml
   [skill]
   name = "weather"
   description = "Get weather forecasts"
   version = "1.0.0"
   author = "yourname"
   tags = ["data", "external-api"]
   always = false   # inject full instructions always vs on-demand

   [[tools]]
   name = "get_weather"
   description = "Fetch current weather"
   kind = "shell"          # shell | http (zeroclaw-specific; we use subprocess for all)
   command = "curl wttr.in/${location}?format=j1"
   ```

2. **Prompt injection modes: full vs compact** — Critical for agents with many skills:
   - `full`: inject entire SKILL.md into system prompt always
   - `compact`: inject only `<name>` + `<description>` + `<location>` (tell the agent skills are available on-demand). The agent can request a skill's full instructions when needed.
   - `always: true` per skill overrides compact mode — that skill's full instructions are always injected regardless.

3. **Security audit before install** — Before installing any skill, run: path traversal check, zip bomb detection, dangerous pattern scan. Installation fails if audit fails.

4. **Skill scaffolding** — `skill new <name> --template <type>` generates a complete runnable skill project:
   - Templates: `bash`, `python`, `go` (compiled binary)
   - Every template includes SKILL.md, the tool schema JSON, the tool implementation, and a README

5. **Multiple install sources with source detection**:
   - `./local/path` — local directory
   - `git@github.com:org/skill.git` — git URL (any protocol)
   - `https://example.com/skill.zip` — zip URL
   - `zip:https://...` — explicit zip prefix
   - `namespace/name@version` — registry package
   - `clawhub:skill-name` — dedicated skill marketplace

6. **Tool implementation** — Tools are external processes communicating via stdin/stdout JSON. Any language that can read stdin and write stdout works: bash, Python, Go binaries, Ruby, etc. Sandboxing is enforced by the subprocess runner (timeout, output cap, env allowlist, working dir lock). See [tools-deep-dive.md](../tools-deep-dive.md) for the full subprocess protocol.

---

## What Our Current Plan Gets Right

- SKILL.md as the central artifact ✓
- Skill tiers (bundled/workspace/community) — concept right, naming needs refinement
- Registry service interface — right shape, needs new fields
- Skill loading merges into system prompt ✓
- Install from Git URL ✓
- Tool types (bash, http) ✓

## What Needs to Change or Be Added

8 gaps identified. The most impactful ones first.

---

## Gap 1: Frontmatter Over Separate skill.json

**Current plan**: `skill.json` as a separate metadata file alongside `SKILL.md`.

**Reality**: Both reference projects put metadata in `SKILL.md` frontmatter. This is strictly better — one file per skill, and the metadata travels with the instructions.

**The format**:
```markdown
---
name: github
version: 1.2.0
description: "GitHub operations via `gh` CLI. Use when: checking PRs, issues, CI. NOT for: local git ops."
author: platform-team
tags: [code, vcs, github]
homepage: https://cli.github.com
emoji: 🐙
always: false

requires:
  bins: [gh]           # CLI tools that must be installed
  env: []              # required env vars
  any_bins: []         # at least one of these must be installed

install:
  - id: brew
    kind: brew
    formula: gh
  - id: apt
    kind: shell
    command: "apt-get install -y gh"
    os: [linux]
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub...
```

The skill loader reads the frontmatter block, strips it, and uses the remaining body as the prompt content.

**Impact on `skill.json`**: Eliminated. Metadata is now frontmatter-only.

---

## Gap 2: Dependency Declaration and Eligibility Checking

**Current plan**: No mention of skills declaring their dependencies.

**Reality**: Skills depend on external things — CLI tools, env vars, API keys. A skill that can't work should not be loaded. Loading it wastes tokens and confuses the LLM.

**Dependency types**:
```yaml
requires:
  bins: [gh]           # all of these must be in PATH
  any_bins: [claude, codex, pi]  # at least one must be in PATH
  env: [NOTION_API_KEY]          # all of these must be set
  config: [channels.slack]       # platform-specific config keys (for platform context)
```

**Eligibility check** — runs at skill load time, before snapshot is built:

```go
type EligibilityResult struct {
    Eligible bool
    Reason   string  // "missing bin: gh" | "missing env: NOTION_API_KEY" | ""
}

func checkEligibility(skill Skill) EligibilityResult {
    for _, bin := range skill.Requires.Bins {
        if !binaryExists(bin) {
            return EligibilityResult{false, fmt.Sprintf("missing bin: %s", bin)}
        }
    }
    for _, env := range skill.Requires.Env {
        if os.Getenv(env) == "" {
            return EligibilityResult{false, fmt.Sprintf("missing env: %s", env)}
        }
    }
    // etc.
    return EligibilityResult{true, ""}
}
```

`agent-core skills` command shows each skill with its eligibility status:
```
✓ github      v1.2.0  GitHub operations via gh CLI
✗ notion      v1.0.0  [missing env: NOTION_API_KEY]
✓ web_search  v1.1.0  Search the web via Brave Search API
✗ slack       v1.0.0  [missing env: SLACK_BOT_TOKEN]
```

---

## Gap 2b: Dependency Installation on Skill Install

Skills have two levels of dependencies:

1. **System binaries** (`gh`, `glab`, `python3`) — declared in `requires.bins`, install method in `install:` frontmatter
2. **Script dependencies** (`pip install duckduckgo-search`) — needed by the tool scripts themselves, declared in `setup` files (e.g., `requirements.txt`)

### Install behavior

| Flag | Who uses it | Behavior |
|---|---|---|
| *(default)* | Developer at their laptop | Prompts for each missing dep: "Install gh via brew? [y/n]" |
| `--yes` / `-y` | CI/CD pipelines, scripts | Auto-installs everything without prompting |
| `--skip-deps` | Power user managing their own env | Installs skill files only, no dependency changes |

Also supports `AGENT_CORE_YES=1` env var as equivalent to `--yes`.

### Install flow

```
agent-core skill install web_search
  1. Download/clone skill files → temp dir
  2. Security audit → abort if findings
  3. Check requires.bins → python3 found? ✓
  4. Check script deps → duckduckgo-search installed? ✗
     → Prompt: "web_search requires duckduckgo-search. Run 'pip install duckduckgo-search'? [y/n]"
     → User: y → run install
  5. Move skill to ~/.agent-core/skills/web_search/
  ✓ Done
```

### CI/CD pattern

Skills should be installed at **build time**, not runtime:

```dockerfile
# Dockerfile
FROM golang:1.22
RUN go install github.com/[org]/agent-core@latest
RUN agent-core skill install web_search github --yes
```

Or install all skills from an agent config:
```bash
agent-core skill install --from-config agent.yaml --yes
```

At **run time**, missing dependencies cause the skill to be skipped (eligibility check) or the tool to return a clear error message — no install attempts.

### Runtime safety net

Even after install, tool scripts check their own dependencies at runtime:
```python
try:
    from duckduckgo_search import DDGS
except ImportError:
    print(json.dumps({
        "content": "duckduckgo-search not installed. Run: pip install duckduckgo-search",
        "is_error": True
    }))
```

This catches cases where the environment changed after install (new container, different virtualenv, etc.).

---

## Gap 3: Prompt Injection Modes (Full vs Compact)

**Current plan**: All skills always injected in full.

**Reality**: With 10+ skills, full injection burns 3-8K tokens before the agent even starts. zeroclaw's compact mode solves this.

**Two modes**:

**Full mode** (default for ≤ 5 skills):
```
[System Prompt]
...base instructions...

<available_skills>
  <skill>
    <name>github</name>
    <description>GitHub ops via gh CLI...</description>
    <instructions>
      # GitHub Skill
      Use the `gh` CLI to interact with GitHub...
      [full SKILL.md content]
    </instructions>
    <tools>
      <tool><name>gh_list_issues</name>...</tool>
    </tools>
  </skill>
  ...
</available_skills>
```

**Compact mode** (for > 5 skills, or explicitly configured):
```
<available_skills>
  <skill>
    <name>github</name>
    <description>GitHub ops via gh CLI. Use when: checking PRs...</description>
    <location>skills/github/SKILL.md</location>
    <note>Full instructions loaded on demand</note>
  </skill>
  <skill>
    <name>notion</name>
    <description>Notion API for pages and databases.</description>
    <location>skills/notion/SKILL.md</location>
    <note>Full instructions loaded on demand</note>
  </skill>
</available_skills>
```

In compact mode, the agent sees a catalog. When it determines it needs a skill, it uses the `skill_load` tool to pull in the full instructions for that specific skill.

**`always: true` overrides compact mode** — Skills marked `always` are always fully injected regardless of mode. Use for: core security skills, identity skills, safety instructions.

**Config**:
```yaml
# in agent YAML
skills:
  injection_mode: auto    # auto | full | compact
  # auto: full if ≤ 5 skills, compact if > 5
  compact_threshold: 5    # skills above this count → compact mode
```

---

## Gap 4: Security Audit on Install

**Current plan**: No mention of security scanning.

**Reality**: Skills execute code. Installing a skill from the internet without auditing it is a serious security risk.

**What to scan**:
- Path traversal in filenames (`../../../etc/passwd`)
- Zip bomb detection (compression ratio > 100x, total > 50MB)
- Dangerous shell patterns (`rm -rf /`, `curl | bash`, credential harvesting)
- Script files in unexpected places (a skill shouldn't have a `.sh` in its root that runs on import)

**The flow**:
```
skill install <source>
  → download/copy to temp dir
  → audit_skill_dir(temp_dir)
     → check for SKILL.md or SKILL.toml (required)
     → scan all files for dangerous patterns
     → check zip safety limits
  → if audit fails: show findings, abort
  → if audit passes: move to skills dir
```

`agent-core skill audit <path>` runs the audit standalone so users can check before installing.

---

## Gap 5: Skill Scaffolding CLI

**Current plan**: Not mentioned.

**Reality**: zeroclaw's `skill new` is one of its most powerful features. It removes all the "how do I structure this?" friction for skill authors.

**Commands to add**:
```
agent-core skill new <name> --template <type>   Create a new skill
agent-core skill templates                       List available templates
agent-core skill test <path> [--tool <name>]    Test a skill locally
agent-core skill audit <path>                   Security scan a skill
agent-core skill install <source>               Install from any source
agent-core skill remove <name>                  Remove an installed skill
agent-core skill list                           List installed skills with eligibility
```

**Templates**:
- `bash` — shell script tool (simplest, no compilation needed)
- `python` — Python script tool
- `go` — compiled Go binary tool

Each template generates: `SKILL.md` (with frontmatter and instructions), `manifest.json` (tool schema), the tool implementation file, `.gitignore`, `README.md`.

The `SKILL.md` generated by `skill new` contains a placeholder that includes the skill's name and a commented-out example:
```markdown
---
name: my-skill
version: 0.1.0
description: "TODO: What does this skill do? Use when: ... NOT for: ..."
---

# My Skill

TODO: Describe what this skill does and how to use it.
```

---

## Gap 6: Multiple Install Source Types

**Current plan**: "Git URL or zip upload"

**Actual sources to support** (in priority order):

| Source format | Example | Detection |
|---|---|---|
| Local directory | `./my-skill` or `/abs/path` | path exists as dir |
| Local zip file | `./my-skill.zip` | ends with `.zip`, is file |
| Git URL | `git@github.com:org/skill.git` | starts with `git@`, `ssh://git@`, `https://*.git` |
| HTTPS zip URL | `https://example.com/skill.zip` | https URL ending in `.zip` |
| Zip URL prefix | `zip:https://example.com/...` | starts with `zip:` |
| Registry package | `community/weather@1.0.0` | `namespace/name[@version]` format |

Each source type has its own handler. Git clones to temp, audits, copies to skills dir. Zip downloads, extracts, audits, copies. Registry resolves via `registry.json` index then downloads zip.

---

## Gap 7: Subprocess Sandboxing Spec

**Current plan**: Subprocess tools mentioned but sandboxing constraints not specified.

**Reality**: Without explicit sandboxing constraints, skill tools inherit the full process environment. A malicious or buggy skill tool could read arbitrary files, exfiltrate env vars, or run indefinitely.

**The subprocess sandbox** (enforced by agent-core's tool runner, not by the skill):

| Constraint | Default | Configurable? |
|---|---|---|
| Timeout | 30 seconds | Yes — per tool or globally |
| Max stdout bytes | 1 MB | Yes — global config |
| Working directory | Agent's run directory (locked) | Fixed |
| Env vars passed | Declared in `requires.env` only | Per skill frontmatter |
| Stderr | Captured and logged, not sent to LLM | — |

**Env filtering** is the most important constraint: a subprocess only receives env vars explicitly declared in the skill's `requires.env` frontmatter, plus a minimal baseline (`PATH`, `HOME`, `TMPDIR`). This prevents a skill tool from reading `ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`, or any other credential from the agent's environment.

**Why not WASM?** zeroclaw uses WASM for structural sandboxing (filesystem/network denied at the runtime level). For Go, the WASM story is messier: TinyGo has significant stdlib limitations, and standard Go WASM binaries are 10–20MB. In practice, the subprocess sandbox with env filtering is sufficient for the common threat model (user-installed skills from trusted sources). WASM may be revisited if the platform evolves to run untrusted community tools in a multi-tenant environment.

---

## Gap 8: The `skill_load` Tool (for Compact Mode)

**Current plan**: Not mentioned.

**Reality**: Compact mode only works if the agent has a way to load a skill's full instructions on demand. This requires a built-in tool:

```go
ToolDefinition{
    Name:        "skill_load",
    Description: "Load the full instructions for a skill by name. Use this when you need detailed guidance for a specific capability listed in your available_skills.",
    InputSchema: `{
        "type": "object",
        "properties": {
            "skill_name": {
                "type": "string",
                "description": "The name of the skill to load"
            }
        },
        "required": ["skill_name"]
    }`,
}
```

When the agent calls `skill_load("github")`, the tool returns the full SKILL.md content as its result, which then gets appended to the conversation. The agent reads the instructions and proceeds.

This tool is automatically added when injection mode is `compact`. It's never registered in `full` mode.

---

## Updated Skill Structure

Combining all the above, the canonical skill on disk looks like:

```
skills/
└── github/
    ├── SKILL.md          ← frontmatter + instruction body (required)
    └── tools/
        ├── gh_list_issues.json    ← tool schema (JSON Schema for parameters)
        └── gh_list_issues.sh      ← tool implementation (bash, python, compiled binary, etc.)
```

**`SKILL.md`** (complete example):
```markdown
---
name: github
version: 1.2.0
description: "GitHub operations via `gh` CLI: issues, PRs, CI. Use when: checking PRs, creating issues, CI status. NOT for: local git ops, non-GitHub repos."
author: platform-team
tags: [code, vcs, github]
emoji: 🐙
always: false

requires:
  bins: [gh]

install:
  - id: brew
    kind: brew
    formula: gh
    bins: [gh]
  - id: shell-linux
    kind: shell
    command: "apt-get install -y gh"
    os: [linux]
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub repositories.

## When to Use
✅ Checking PR status, CI runs, creating/closing issues
❌ Local git (commit/push/pull) — use git directly

## Commands

### List Issues
```bash
gh issue list --repo owner/repo --state open
```
...
```

**`tools/gh_list_issues.json`** (tool schema):
```json
{
  "name": "gh_list_issues",
  "description": "List GitHub issues for a repository",
  "parameters": {
    "type": "object",
    "properties": {
      "repo": { "type": "string", "description": "owner/repo format" },
      "state": { "type": "string", "enum": ["open", "closed", "all"], "default": "open" },
      "limit": { "type": "integer", "default": 20 }
    },
    "required": ["repo"]
  }
}
```

**`tools/gh_list_issues.sh`** (tool implementation):
```bash
#!/bin/bash
INPUT=$(cat)
REPO=$(echo "$INPUT" | jq -r '.repo')
STATE=$(echo "$INPUT" | jq -r '.state // "open"')
LIMIT=$(echo "$INPUT" | jq -r '.limit // 20')
RESULT=$(gh issue list --repo "$REPO" --state "$STATE" --limit "$LIMIT" --json number,title,state,assignees)
echo "{\"content\": $(echo "$RESULT" | jq -Rs .), \"is_error\": false}"
```

---

## Updated Skill Registry Service Interface

```go
type SkillRegistry interface {
    // List available skills with eligibility status
    List(ctx context.Context) ([]SkillStatus, error)

    // Get a skill by name (resolves version)
    Get(ctx context.Context, name string) (*Skill, error)

    // Check if a skill is eligible to run in the current environment
    CheckEligibility(skill Skill) EligibilityResult

    // Install a skill from any supported source
    Install(ctx context.Context, source string) (*Skill, error)

    // Remove an installed skill
    Remove(ctx context.Context, name string) error

    // Scaffold a new skill from a template
    Scaffold(name, template, destDir string) error

    // Audit a skill directory (returns findings, no side effects)
    Audit(path string) (AuditReport, error)

    // Build the snapshot for an agent run:
    // - Resolves and checks eligibility
    // - Applies injection mode (full vs compact)
    // - Returns merged system prompt fragment + registered tools
    BuildSnapshot(ctx context.Context, refs []SkillRef, mode InjectionMode) (*SkillSnapshot, error)
}

type SkillStatus struct {
    Skill
    Eligible bool
    Reason   string  // why ineligible, if applicable
}

type SkillSnapshot struct {
    SystemPromptFragment string          // merged prompt (full or compact listing)
    Tools                []ToolDef       // all tools from all eligible skills
    SkillLoadTool        *ToolDef        // set only when mode == compact
    EligibleSkills       []string        // names of skills included
    SkippedSkills        []SkillStatus   // ineligible skills with reasons
}

type InjectionMode string
const (
    ModeAuto    InjectionMode = "auto"    // full if ≤ threshold, else compact
    ModeFull    InjectionMode = "full"
    ModeCompact InjectionMode = "compact"
)
```

---

## Skills Registry Repo Structure

```
skills/                  ← the `skills` repo
├── registry.json        ← index of all community skills (name, version, source, latest)
├── CONTRIBUTING.md      ← how to add a skill, PR review process
├── web_search/
│   ├── SKILL.md
│   ├── tools/
│   │   ├── web_search.json
│   │   └── web_search.sh
│   └── tests/
│       ├── web_search.basic.json
│       └── web_search.basic.expected.json
├── web_fetch/
│   ├── SKILL.md
│   ├── tools/
│   │   ├── web_fetch.json
│   │   └── web_fetch.py
│   └── tests/
├── summarize/
├── github/
├── gitlab/
├── report/
├── send_email/
└── ...                  ← community contributions below
```

**`registry.json`**:
```json
{
  "version": 1,
  "updated_at": "2026-02-28T00:00:00Z",
  "skills": [
    {
      "name": "github",
      "version": "1.2.0",
      "description": "GitHub operations via gh CLI...",
      "tags": ["code", "vcs"],
      "emoji": "🐙",
      "source": "github.com/[org]/skills/tree/main/github"
    }
  ]
}
```

---

## Build Order

**Phase 2 of agent-core** (after tools and skills are working at basic level):

**Week 1 — Core skill loading:**
1. SKILL.md frontmatter parser (YAML front matter → `SkillMeta`)
2. Skill directory loader (walks `skills/` dir, loads each skill)
3. Eligibility checker (bins, env vars)
4. Full injection mode: merge SKILL.md bodies into system prompt with XML wrapper
5. Tool schema loader (reads `tools/*.json`, registers with ToolEngine)
6. Tool subprocess runner for skill tools (same as agent-core's subprocess runner)
7. `agent-core skill list` command (with eligibility status)
8. Bundled skills: `web_search`, `web_fetch`, `summarize`, `github`, `gitlab`, `report`, `send_email`

**Week 2 — Install and scaffolding:**
9. Security audit (path traversal, zip bomb, dangerous patterns)
10. Install sources: local dir, local zip, git URL
11. Install sources: HTTPS zip URL, registry package
12. `agent-core skill install <source>`
13. `agent-core skill remove <name>`
14. `agent-core skill audit <path>`
15. Skill scaffolding: `agent-core skill new <name> --template <bash|python>`
16. `agent-core skill templates` command

**Week 3 — Compact mode and polish:**
17. Compact injection mode
18. `skill_load` built-in tool (for compact mode on-demand loading)
19. Auto mode (full vs compact based on skill count threshold)
20. `always: true` override in compact mode
21. Skill testing: validate structure, check eligibility, run `tests/` fixtures
22. Test fixture discovery: `tests/<tool>.<test>.json` + `.expected.json` pattern matching
23. `agent-core skill test <path>` with `--validate-only`, `--tool`, `--input` flags
24. Per-skill config: agent YAML config passed to tool subprocess as `config` field on stdin
25. 7 bundled skills in the `skills` repo with test fixtures
26. `registry.json` index with `latest` + versioned entries
27. Skill install from registry format (`namespace/name[@version]`)

---

## Bundled Skills (Ship with agent-core)

Seven skills compiled into the binary. No install step, no API keys required for the defaults.

| Skill | Description | Dependencies | Notes |
|---|---|---|---|
| `web_search` | Search the web via DuckDuckGo (default) | none (DDG) | Pluggable backend: `ddg`, `brave`, `serper`, `tavily`, `searxng` |
| `web_fetch` | Fetch a URL, extract readable content (HTML → markdown) | none | Strips nav/ads, returns clean text |
| `summarize` | Summarize long text into concise output | none | Uses the agent's own LLM — no external calls |
| `github` | GitHub operations via `gh` CLI | `gh` binary | Issues, PRs, CI, code review |
| `gitlab` | GitLab operations via `glab` CLI | `glab` binary | Issues, MRs, pipelines, code review |
| `report` | Structure output into formatted documents | none | Markdown reports with sections, tables, citations |
| `send_email` | Send email via SMTP | none | Requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` env vars |

Bundled skills version with the binary — updating `agent-core` updates the bundled skills. No separate versioning.

---

## Per-Skill Configuration

Skills can accept configuration from the agent YAML. The LLM controls `arguments` (what to do); the human controls `config` (how to do it). They never mix.

**Agent YAML:**
```yaml
skills:
  - github                    # simple — no config
  - web_search:               # config form
      backend: ddg            # ddg | brave | serper | tavily | searxng
      max_results: 10
  - send_email:
      smtp_host: smtp.gmail.com
      smtp_port: 587
```

**What the tool subprocess receives on stdin:**
```json
{
  "tool_call_id": "tc_001",
  "name": "web_search",
  "arguments": { "query": "Go error handling best practices" },
  "config": { "backend": "ddg", "max_results": 10 }
}
```

The `config` block comes from the agent YAML and is passed transparently. The LLM never sees it, never sets it, and has no schema for it. The tool implementation reads `config` for its own use.

Skills declare their supported config options in the SKILL.md frontmatter:
```yaml
config:
  backend:
    type: string
    default: ddg
    enum: [ddg, brave, serper, tavily, searxng]
    description: "Search backend to use"
  max_results:
    type: integer
    default: 10
    description: "Maximum results to return"
```

---

## Versioning

**Bundled skills**: Version with the binary. Updating `agent-core` updates bundled skills. No independent version tracking.

**Community skills** (in the `skills` repo): Semver via git tags.
- `registry.json` includes a `latest` field per skill pointing to the recommended version tag
- `agent-core skill install github` → resolves `latest` from `registry.json` → clones at that tag
- `agent-core skill install github@1.2.0` → clones at `v1.2.0` tag
- `agent-core skill update github` → re-resolves `latest`, replaces installed version

**Local skills** (in `~/.agent-core/skills/`): No versioning. User manages their own files.

**`registry.json` version fields:**
```json
{
  "skills": {
    "github": {
      "latest": "1.2.0",
      "versions": {
        "1.2.0": { "tag": "v1.2.0", "sha": "abc123" },
        "1.1.0": { "tag": "v1.1.0", "sha": "def456" }
      },
      "source": "github.com/[org]/skills",
      "path": "github"
    }
  }
}
```

---

## Skill Testing

`agent-core skill test` validates skill structure and runs tool test fixtures.

### Three levels

1. **Validate** — Does the SKILL.md parse? Is frontmatter valid? Do all `tools/*.json` schemas parse? Does every `.json` have a matching executable?
2. **Eligibility** — Are the skill's declared dependencies (`bins`, `env`) available on this machine?
3. **Run fixtures** — Execute tool subprocesses with test inputs from the `tests/` directory and check results.

### Test fixture convention

```
skills/web_search/
├── SKILL.md
├── tools/
│   ├── web_search.json
│   └── web_search.sh
└── tests/
    ├── web_search.basic.json                 ← test input (required)
    ├── web_search.basic.expected.json        ← expected output (optional)
    ├── web_search.empty_query.json
    └── web_search.empty_query.expected.json
```

**Naming**: `<tool_name>.<test_name>.json` for inputs, `<tool_name>.<test_name>.expected.json` for expectations.

**Input file** — exactly what the tool subprocess receives on stdin:
```json
{
  "tool_call_id": "test_001",
  "name": "web_search",
  "arguments": { "query": "golang concurrency" },
  "config": { "backend": "ddg", "max_results": 5 }
}
```

**Expected file** — pattern-matching assertions (not exact output match, because tool output varies):
```json
{
  "is_error": false,
  "content_contains": ["golang", "concurrency"],
  "content_not_contains": ["error", "failed"],
  "content_not_empty": true
}
```

**Supported assertion fields:**
| Field | Type | Meaning |
|---|---|---|
| `is_error` | bool | Tool result `is_error` must match |
| `content_contains` | string[] | Each string must appear in `content` |
| `content_not_contains` | string[] | None of these strings may appear in `content` |
| `content_not_empty` | bool | `content` must be non-empty |
| `content_matches` | string | `content` must match this regex |

If no `.expected.json` exists, the test passes if the tool returns valid JSON with `is_error: false`.

### CLI usage

```bash
# Full test: validate + eligibility + run all fixtures
agent-core skill test ./skills/web_search/

# Validate structure only (no tool execution)
agent-core skill test ./skills/web_search/ --validate-only

# Run a specific tool's fixtures only
agent-core skill test ./skills/web_search/ --tool web_search

# Run with a one-off input (no fixture file needed)
agent-core skill test ./skills/web_search/ --tool web_search --input '{"query": "test"}'
```

### Output

```
$ agent-core skill test ./skills/web_search/

Validating skill structure...
  ✓ SKILL.md frontmatter valid
  ✓ tools/web_search.json schema valid
  ✓ tools/web_search.sh found and executable

Checking eligibility...
  ✓ No binary dependencies
  ✓ No env var requirements (backend=ddg uses no API key)

Running test fixtures...
  ✓ web_search.basic         (1.2s) — content_contains: ✓ content_not_empty: ✓
  ✓ web_search.empty_query   (0.3s) — is_error: ✓

4/4 checks passed. Skill is ready.
```

---

## What Carries Over from the Existing Doc

The existing `architecture/skill-registry.md` had several things right. These are unchanged:
- Three-tier model (bundled/workspace/community) — kept, just renamed to bundled/local/community
- SKILL.md as the core artifact ✓
- Skills injected into system prompt ✓
- Tools are separate from the skill instructions ✓
- Community install from Git URL ✓
- Version pinning concept ✓
- The registry is its own repo ✓
