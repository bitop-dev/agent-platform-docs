# Tools — Deep Dive

Tools are the mechanism by which an agent takes action in the world. The LLM decides to call a tool; agent-core executes it and feeds the result back into the conversation.

This document covers the three-tier tool system, the built-in tool set, how skill tools and custom tools work, the subprocess protocol, sandboxing, and agent-level tool control.

---

## Three Categories of Tools

| Category | Implemented in | Distributed via | Runtime cost |
|---|---|---|---|
| **Core tools** | Go (compiled in) | agent-core binary | In-process |
| **Skill tools** | Any language | Skill packages | Subprocess |
| **MCP tools** | Any language | MCP servers | RPC (stdio or HTTP/SSE) |

These all implement the same `Tool` interface from the agent's perspective. The LLM sees a flat list of available tools — it doesn't know or care which category they came from.

---

## Core Tools (Built-In)

Compiled into the agent-core binary. Zero install, zero subprocess overhead. These are the primitives everything else builds on.

**`bash` is opt-out**: it's included by default but can be explicitly disabled per agent. All other core tools are available by default and can also be disabled.

### The Core Tool Set

| Tool | Description | Notes |
|---|---|---|
| `bash` | Run arbitrary shell commands | **Opt-out** — on by default, can be disabled |
| `read_file` | Read a file, with optional line offset and limit | |
| `write_file` | Write or overwrite a file | |
| `edit_file` | Replace exact text in a file (surgical edit) | Preferred over write for small changes |
| `list_dir` | List directory contents (name, type, size, modified) | |
| `grep` | Search files by regex pattern, return matches with line context | |
| `http_fetch` | Make HTTP GET or POST requests, return status + body | Raw — no content extraction |

Two tools are available but only active in specific modes:

| Tool | When active |
|---|---|
| `skill_load` | Only when skill injection mode is `compact` |
| `agent_spawn` | Only when orchestration is configured (platform layer) |

### Why `bash` + Specialized Tools

The question: if we have `bash`, why have separate `read_file`, `list_dir`, `grep`?

1. **Precision** — `read_file(path: "main.go", offset: 40, limit: 60)` is harder to get wrong than composing a `sed` call. Specialized tools have explicit schemas that guide the LLM.
2. **Sandboxability** — you can give an agent `read_file` + `list_dir` without giving it `bash`. A research agent that only needs to read files shouldn't have arbitrary shell execution.
3. **Portability** — `bash` doesn't exist on Windows. Specialized tools are implemented in Go and work everywhere.
4. **`bash` is the escape hatch** — for anything not covered by a specialized tool, `bash` handles it. They're complementary, not redundant.

### Core Tool Schemas (Abbreviated)

**`read_file`**
```json
{
  "name": "read_file",
  "description": "Read the contents of a file. Supports text files. Output is truncated to limit lines.",
  "parameters": {
    "type": "object",
    "properties": {
      "path":   { "type": "string", "description": "Path to file (relative or absolute)" },
      "offset": { "type": "integer", "description": "Line number to start reading from (1-indexed)" },
      "limit":  { "type": "integer", "description": "Maximum number of lines to read" }
    },
    "required": ["path"]
  }
}
```

**`edit_file`**
```json
{
  "name": "edit_file",
  "description": "Replace exact text in a file. oldText must match exactly including whitespace. Use for surgical edits.",
  "parameters": {
    "type": "object",
    "properties": {
      "path":     { "type": "string" },
      "old_text": { "type": "string", "description": "Exact text to find (must match exactly)" },
      "new_text": { "type": "string", "description": "Replacement text" }
    },
    "required": ["path", "old_text", "new_text"]
  }
}
```

**`bash`**
```json
{
  "name": "bash",
  "description": "Execute a bash command. Returns stdout and stderr. Times out after configured limit.",
  "parameters": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "Bash command to execute" },
      "timeout": { "type": "integer", "description": "Timeout in seconds (overrides default)" }
    },
    "required": ["command"]
  }
}
```

### Go Interface

```go
// Tool is implemented by all three categories — core, skill subprocess, MCP.
type Tool interface {
    Definition() ToolDefinition
    Execute(ctx context.Context, input json.RawMessage) (ToolResult, error)
}

type ToolDefinition struct {
    Name        string          // e.g., "read_file"
    Description string          // shown to LLM
    InputSchema json.RawMessage // JSON Schema for parameters
}

type ToolResult struct {
    Content string // text returned to the LLM
    IsError bool   // if true, LLM sees this as a tool error
}

// ToolEngine manages registration, dispatch, and parallel execution.
type ToolEngine struct {
    tools   map[string]Tool
    allowed map[string]bool // per-agent allowlist
}

func (e *ToolEngine) Register(t Tool)
func (e *ToolEngine) SetAllowed(names []string)
func (e *ToolEngine) Dispatch(ctx context.Context, calls []ToolCall) []ToolResult
// Dispatch runs independent calls in parallel (goroutines).
// Respects ctx cancellation — all running calls are cancelled if ctx is done.
```

---

## Skill Tools (Subprocess)

Skill tools live in `tools/` inside a skill directory. They're external processes — any language, communicating over stdin/stdout JSON. The skill package is the distribution unit.

```
~/.agent-core/skills/
└── github/
    ├── SKILL.md
    └── tools/
        ├── gh_list_issues.json    ← tool schema (registered with LLM)
        └── gh_list_issues.sh      ← tool implementation (executed on call)
```

### The Subprocess Protocol

Every tool call that reaches a skill tool:

1. agent-core spawns the tool process
2. Writes JSON to the process's **stdin**
3. Reads JSON from the process's **stdout**
4. Kills the process (if still running) after `timeout_seconds`

**stdin** (what agent-core sends):
```json
{
  "tool_call_id": "tc_abc123",
  "name": "gh_list_issues",
  "arguments": {
    "repo": "org/myapp",
    "state": "open"
  },
  "config": {
    "some_skill_setting": "value"
  }
}
```

The `config` field contains per-skill settings from the agent YAML. The LLM never sees or controls this — it's human-configured. If the skill has no config in the agent YAML, `config` is `{}`.


**stdout** (what the tool must return):
```json
{
  "content": "Found 12 open issues:\n#142 Fix login bug\n#139 Add dark mode",
  "is_error": false
}
```

Error case:
```json
{
  "content": "Error: repository 'org/myapp' not found or not accessible",
  "is_error": true
}
```

Rules:
- The tool must write exactly one JSON object to stdout before exiting
- Anything written to **stderr** is captured and logged by agent-core (not sent to LLM)
- If the tool exits non-zero without writing valid JSON, agent-core synthesizes an error result
- Output exceeding `max_output_bytes` (default: 1 MB) is truncated

### Writing a Tool in Any Language

**Bash**:
```bash
#!/bin/bash
INPUT=$(cat)                                          # read JSON from stdin
REPO=$(echo "$INPUT" | jq -r '.arguments.repo')
STATE=$(echo "$INPUT" | jq -r '.arguments.state // "open"')
RESULT=$(gh issue list --repo "$REPO" --state "$STATE" --json number,title)
echo "{\"content\": $(echo "$RESULT" | jq -Rs .), \"is_error\": false}"
```

**Python**:
```python
#!/usr/bin/env python3
import json, sys, subprocess

inp = json.load(sys.stdin)
repo = inp["arguments"]["repo"]
state = inp["arguments"].get("state", "open")
result = subprocess.run(
    ["gh", "issue", "list", "--repo", repo, "--state", state, "--json", "number,title"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(json.dumps({"content": result.stderr, "is_error": True}))
else:
    print(json.dumps({"content": result.stdout, "is_error": False}))
```

**Go (compiled binary)**:
```go
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "os/exec"
)

type Input struct {
    Arguments struct {
        Repo  string `json:"repo"`
        State string `json:"state"`
    } `json:"arguments"`
}

func main() {
    var inp Input
    json.NewDecoder(os.Stdin).Decode(&inp)
    state := inp.Arguments.State
    if state == "" {
        state = "open"
    }
    out, err := exec.Command("gh", "issue", "list",
        "--repo", inp.Arguments.Repo,
        "--state", state,
        "--json", "number,title").Output()
    if err != nil {
        fmt.Printf(`{"content":%q,"is_error":true}`, err.Error())
        return
    }
    fmt.Printf(`{"content":%q,"is_error":false}`, string(out))
}
```

### Tool Schema File

Each tool has a `.json` file declaring its schema. This is what gets registered with the LLM:

```json
{
  "name": "gh_list_issues",
  "description": "List GitHub issues for a repository",
  "parameters": {
    "type": "object",
    "properties": {
      "repo": {
        "type": "string",
        "description": "Repository in owner/repo format"
      },
      "state": {
        "type": "string",
        "enum": ["open", "closed", "all"],
        "description": "Issue state filter",
        "default": "open"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum issues to return",
        "default": 20
      }
    },
    "required": ["repo"]
  }
}
```

The tool runner pairs each `.json` with the matching executable (same name, any extension: `.sh`, `.py`, `.rb`, or no extension for a compiled binary).

---

## Subprocess Sandboxing

Every subprocess tool runs with these constraints. These are enforced by the Go subprocess runner — skill tools cannot opt out.

| Constraint | Default | Configurable? |
|---|---|---|
| Timeout | 30 seconds | Yes — per tool or globally |
| Max stdout bytes | 1 MB | Yes — global config |
| Working directory | Agent's run directory | Fixed — cannot escape |
| Env vars | Allowlist only | Yes — per skill |
| Memory limit | None (OS default) | Future: `setrlimit` |
| Network | Inherited | Future: per-tool network policy |

**Env var filtering** — by default, a subprocess gets a minimal env: `PATH`, `HOME`, `TMPDIR`. Skill frontmatter declares additional env vars it needs:

```yaml
requires:
  env: [BRAVE_API_KEY, NOTION_API_KEY]
```

agent-core passes *only* those declared vars into the subprocess. The LLM's conversation history (which might contain sensitive user data) never appears in the subprocess environment.

---

## MCP Tools

MCP (Model Context Protocol) tools come from external servers. They're discovered at startup via handshake and then behave identically to any other tool.

```yaml
# agent.yaml
mcp:
  servers:
    - name: filesystem
      transport: stdio
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    - name: postgres
      transport: stdio
      command: ["uvx", "mcp-server-postgres", "postgresql://localhost/mydb"]
    - name: remote-tools
      transport: sse
      url: "https://tools.example.com/mcp/sse"
```

MCP is covered in depth in [agent-core-deep-dive.md](agent-core-deep-dive.md). For tools design purposes: MCP tools register into the same `ToolEngine` as core and skill tools. The `MCPToolAdapter` wraps an MCP tool call into the standard `Tool` interface.

---

## Agent-Level Tool Control

Each agent config has a `tools` section that controls which tools are available and how they're configured. **The absence of a tool from this list disables it** — the LLM cannot call it.

```yaml
# research-agent.yaml — read-only agent, no shell, no writes
tools:
  core:
    read_file: {}          # enabled, default config
    list_dir: {}
    grep: {}
    http_fetch:
      allowed_hosts:
        - "en.wikipedia.org"
        - "api.semanticscholar.org"
    # bash: not listed → disabled
    # write_file: not listed → disabled
    # edit_file: not listed → disabled

skills:
  - web_search
  - summarize
```

```yaml
# dev-agent.yaml — full capability coding agent
tools:
  core:
    bash:
      timeout_seconds: 60
      working_dir: "./workspace"
    read_file: {}
    write_file: {}
    edit_file: {}
    list_dir: {}
    grep: {}
    http_fetch: {}         # unrestricted hosts

skills:
  - github
  - coding-agent
```

```yaml
# scheduled-reporter.yaml — no shell, no writes, specific API only
tools:
  core:
    http_fetch:
      allowed_hosts: ["api.mycompany.com"]
    read_file:
      allowed_paths: ["/var/reports"]
    # everything else disabled

skills:
  - summarize
  - send_report           # custom local skill with email tool
```

### Bash Opt-Out Explicitly

Since bash is on by default but dangerous, the explicit disable pattern:

```yaml
# agent.yaml
tools:
  core:
    bash:
      enabled: false      # explicitly disabled — no shell access
    read_file: {}
    list_dir: {}
```

Or more concisely, just don't list it (absence = disabled). But explicit `enabled: false` is clearer in config files that will be read by others.

---

## Where Custom Tools Live

The decision tree for "I need a new capability":

```
Do I want this tool available to a specific agent only?
│
├── Yes → Is it a simple shell command I can wrap?
│         ├── Yes → Use bash tool inline — no new tool needed
│         └── No  → Create a local skill in ~/.agent-core/skills/my-tool/
│
└── No → Is it useful to others?
          ├── No  → Local skill (above)
          └── Yes → Publish to the community skills repo
                    (PR to github.com/[org]/skills with your skill directory)
```

### Examples

| Need | Solution |
|---|---|
| List files, search code, run tests | `bash` tool — no new tool |
| Send email to my SMTP server | Local skill: `~/.agent-core/skills/send_email/` |
| Search the web | Install `web_search` skill |
| Fetch and parse a webpage | Install `web_fetch` skill |
| Query my internal API | Local skill with `http_fetch` + shell wrapper |
| Query a PostgreSQL database | MCP server: `mcp-server-postgres` |
| Interact with GitHub | Install `github` skill |
| Run Playwright browser automation | MCP server: `@playwright/mcp` |

---

## Skill Tools vs. Core `http_fetch`

A common question: when do you use the `http_fetch` core tool vs a skill with an HTTP tool?

**Core `http_fetch`**:
- Raw. Returns the full response body as-is.
- Good for: JSON APIs where the response is already structured.
- Not good for: HTML pages, APIs needing auth headers configured per-run, anything requiring response transformation.

**Skill tool over HTTP**:
- The skill wraps the API call with credentials from env vars, formats the response into something LLM-readable, and the SKILL.md teaches the agent when and how to use the specific API.
- Good for: Slack, GitHub, Notion, Brave Search, any API with auth or a specific response schema.

Rule of thumb: if the tool needs an API key or needs to transform the response, it belongs in a skill.

---

## Build Order (Tool System)

Week 1 of agent-core (after provider and basic loop):

1. `Tool` interface + `ToolDefinition` + `ToolResult` types
2. `ToolEngine` — register, dispatch, parallel execution with goroutines
3. `read_file` — with offset/limit, file not found error
4. `write_file` — creates dirs as needed
5. `edit_file` — exact text replacement with helpful diff on mismatch
6. `list_dir` — returns name, type (file/dir), size, modified time
7. `grep` — regex search, returns matches with N lines of context
8. `http_fetch` — GET/POST, configurable allowed hosts, response body + status
9. `bash` — subprocess, timeout enforced, stderr captured, stdout returned
10. Tool calling wired into the turn loop (with tool message boundary guard)
11. Subprocess tool runner — pairs `.json` schema with executable, runs with sandboxing
12. Approval manager — CLI prompt before dangerous tool execution (bash, write_file)

Skill tool loading (Week 2, with skill system):
13. Skill tool loader — scans `tools/*.json`, pairs with executables, registers with ToolEngine
14. `agent-core tools` CLI command — show all registered tools with source (core vs skill name)
