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
   kind = "shell"          # shell | http | wasm
   command = "curl wttr.in/${location}?format=j1"
   ```

2. **Prompt injection modes: full vs compact** — Critical for agents with many skills:
   - `full`: inject entire SKILL.md into system prompt always
   - `compact`: inject only `<name>` + `<description>` + `<location>` (tell the agent skills are available on-demand). The agent can request a skill's full instructions when needed.
   - `always: true` per skill overrides compact mode — that skill's full instructions are always injected regardless.

3. **Security audit before install** — Before installing any skill, run: path traversal check, zip bomb detection, dangerous pattern scan. Installation fails if audit fails.

4. **Skill scaffolding** — `skill new <name> --template <type>` generates a complete runnable skill project:
   - Templates: TypeScript (→ WASM via Javy), Rust (→ WASM via wasm32-wasip1), Go (→ WASM via TinyGo), Python (→ WASM via componentize-py)
   - Every template includes SKILL.md, manifest, gitignore, and language-specific build files

5. **Multiple install sources with source detection**:
   - `./local/path` — local directory
   - `git@github.com:org/skill.git` — git URL (any protocol)
   - `https://example.com/skill.zip` — zip URL
   - `zip:https://...` — explicit zip prefix
   - `namespace/name@version` — registry package
   - `clawhub:skill-name` — dedicated skill marketplace

6. **WASM tools** — Tools compile to `.wasm` and run via wasmtime. Same stdin/stdout JSON protocol as subprocess tools, but with: no filesystem access by default, no network, execution time cap via epoch interruption, 1MB output cap. Better sandboxing than raw subprocess.

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

**Templates** (Phase 1 — simple, no WASM required yet):
- `bash` — shell script tool (no compilation)
- `python` — Python script tool (no compilation)

**Templates** (Phase 2 — WASM):
- `typescript` → WASM via Javy
- `go` → WASM via TinyGo
- `rust` → WASM via wasm32-wasip1

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

## Gap 7: WASM Tools as the Preferred Sandboxing Path

**Current plan**: Subprocess tools (stdin/stdout JSON) as the primary external tool mechanism.

**Reality**: Subprocess tools are correct for Phase 1. But WASM is where the ecosystem is heading, and zeroclaw has already implemented it.

The WASM protocol is identical to subprocess: stdin receives JSON args, stdout returns JSON result. The difference is the execution environment:

| | Subprocess | WASM |
|---|---|---|
| Filesystem | Inherits parent (sandboxed by policy) | Denied by default |
| Network | Inherits parent (sandboxed by policy) | Denied by default |
| Timeout | OS process timeout | Epoch-based interruption |
| Portability | Platform-dependent | Any platform with wasmtime |
| Security | Policy-based | Structural (WASI capabilities) |

**Plan**: Subprocess for Phase 1. WASM as the preferred tool format for Phase 2, alongside the scaffolding templates. Existing subprocess tools continue to work.

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
        └── gh_list_issues.sh      ← tool implementation (bash, python, etc.)
                                   or: tool.wasm (compiled WASM tool)
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
├── registry.json        ← index of all skills (name, version, description, tags, source)
├── CONTRIBUTING.md      ← how to add a skill
├── github/
│   ├── SKILL.md
│   └── tools/
│       ├── gh_list_issues.json
│       └── gh_list_issues.sh
├── web_search/
│   ├── SKILL.md
│   └── tools/
│       ├── search.json
│       └── search.sh
├── slack/
├── notion/
├── summarize/
├── healthcheck/
├── weather/
├── browser/
├── file_ops/
└── ...
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
8. Bundled skills: `web_search`, `github`, `summarize`, `http_request`, `bash`

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
21. `agent-core skill test <path>` (runs a tool with test args, shows result)
22. 10+ bundled skills in the `skills` repo
23. `registry.json` index with all bundled skills
24. Skill install from registry format (`namespace/name[@version]`)

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
