# Contributing Skills

Anyone can submit a skill to the community registry. This guide covers the requirements, naming conventions, and PR process.

---

## Quick Start

```bash
# 1. Fork and clone the skills repo
git clone https://github.com/[org]/skills.git
cd skills

# 2. Scaffold a new skill
agent-core skill new my-skill --template bash
# or: agent-core skill new my-skill --template python

# 3. Edit the generated files
#    - SKILL.md: frontmatter + agent instructions
#    - tools/*.json: tool schemas
#    - tools/*.sh or *.py: tool implementations
#    - tests/*.json: test fixtures

# 4. Validate and test locally
agent-core skill test ./my-skill/
agent-core skill audit ./my-skill/

# 5. Submit a PR
git checkout -b add-my-skill
git add my-skill/
git commit -m "feat: add my-skill"
git push origin add-my-skill
# Open PR on GitHub
```

---

## Requirements

Every submitted skill must meet all of the following:

### 1. Valid SKILL.md

Frontmatter must include these fields:

```yaml
---
name: my-skill              # required — lowercase, hyphens allowed
version: 0.1.0              # required — semver
description: "..."          # required — must include "Use when:" and "NOT for:"
author: your-github-handle  # required
tags: [category1, category2] # required — at least one tag
emoji: 🔧                   # optional but encouraged
---
```

The description is the most important field. It's what the LLM reads to decide whether to load your skill. Be explicit about when to use it and when not to.

### 2. Instruction body

The markdown body after the frontmatter must include:
- **What the skill does** — clear explanation
- **When to use / when not to use** — ✅ and ❌ sections
- **How to use it** — examples, commands, tips

Instruction-only skills (like `summarize` or `report`) don't need tools but must have thorough instructions.

### 3. Tool schemas and implementations

If your skill has tools:
- Every tool needs a `.json` schema in `tools/` with `name`, `description`, and `parameters`
- Every schema must have a matching executable (`.sh`, `.py`, or compiled binary) with the same base name
- Tools must follow the subprocess protocol: read JSON from stdin, write JSON to stdout

### 4. Test fixtures

Every tool must have at least one test fixture in `tests/`:
- `<tool_name>.<test_name>.json` — test input
- `<tool_name>.<test_name>.expected.json` — expected output assertions (optional but recommended)

Include at least:
- One **happy path** test (valid input → successful result)
- One **error case** test (invalid input → `is_error: true` with a clear message)

### 5. Security audit passes

```bash
agent-core skill audit ./my-skill/
```

Must return clean — no path traversal, no dangerous patterns, no suspicious scripts.

### 6. No hardcoded credentials

- API keys, tokens, and passwords must come from environment variables
- Declare required env vars in `requires.env` in the frontmatter
- Never commit credentials, even in test fixtures

### 7. Dependencies declared

Everything the skill needs must be declared in the frontmatter:

```yaml
requires:
  bins: [gh]              # CLI tools that must be installed
  env: [BRAVE_API_KEY]    # environment variables that must be set
```

If your skill needs Python packages, include a `requirements.txt` in the skill root.

---

## Naming Conventions

| Rule | Example | Bad example |
|---|---|---|
| Lowercase only | `web_search` | `Web_Search`, `WebSearch` |
| Underscores for word separation | `send_email` | `send-email`, `sendemail` |
| No prefixes or namespaces | `weather` | `my-weather`, `acme_weather` |
| Descriptive, specific names | `github`, `web_fetch` | `tool1`, `helper`, `misc` |
| Tool names match skill name or are prefixed by it | `web_search`, `gh_issues`, `gh_prs` | `search`, `list` |

**Naming conflicts**: First come, first served. If `weather` is already taken, choose a different name like `weather_forecast` or `weather_detailed`. Or, submit improvements to the existing skill instead.

---

## Skill Directory Structure

```
my-skill/
├── SKILL.md                          ← frontmatter + instructions (required)
├── requirements.txt                  ← Python deps, if any (optional)
├── tools/
│   ├── my_tool.json                  ← tool schema (required per tool)
│   └── my_tool.py                    ← tool implementation (required per tool)
└── tests/
    ├── my_tool.basic.json            ← happy path test input (required)
    ├── my_tool.basic.expected.json   ← expected output assertions (recommended)
    ├── my_tool.error.json            ← error case test input (required)
    └── my_tool.error.expected.json   ← expected error assertions (recommended)
```

---

## PR Process

### What happens when you submit a PR

1. **Automated CI runs**:
   - SKILL.md frontmatter validation
   - Tool schema validation (all `.json` files parse, all have matching executables)
   - Security audit (`agent-core skill audit`)
   - Structure check (`agent-core skill test --validate-only`)
   - Note: live tool tests are NOT run in CI (they may need API keys or network access)

2. **Maintainer review**:
   - One approving review required to merge
   - Reviewer checks: description quality, instruction clarity, test coverage, code safety
   - Feedback is given on the PR — iterate until approved

3. **After merge**:
   - Your skill is added to `registry.json` with a version tag
   - It becomes installable: `agent-core skill install my-skill`
   - You're listed as the author and primary maintainer

### Review criteria

Reviewers look for:

| Criteria | What we check |
|---|---|
| **Description quality** | Does it have clear "Use when" / "NOT for" guidance? |
| **Instruction clarity** | Would an LLM understand how to use this skill? |
| **Tool correctness** | Does the schema match what the implementation expects? |
| **Error handling** | Does the tool return clear `is_error: true` messages on failure? |
| **Test coverage** | At least one happy path and one error case per tool |
| **Security** | No hardcoded secrets, no suspicious patterns, audit passes |
| **Dependencies** | Everything declared, nothing hidden |
| **Naming** | Follows conventions, no conflicts |

### Updating an existing skill

To update a skill you authored:
1. Make your changes on a branch
2. Bump the `version` in SKILL.md frontmatter (semver)
3. Submit a PR — same review process applies
4. After merge, the new version is tagged and `registry.json` is updated

### Improving someone else's skill

You can submit PRs to improve any skill in the repo:
- Bug fixes, better error messages, new test cases
- The original author is tagged for review when possible
- Same review process applies

---

## Tips for Good Skills

1. **Write the description first** — If you can't explain when to use it in one line, the skill may be too broad
2. **Test with a real agent** — Run `agent-core chat` with your skill loaded and try realistic prompts
3. **Handle errors gracefully** — Return `is_error: true` with a message the LLM can act on ("API key not set" is actionable, "error" is not)
4. **Keep tools focused** — One tool per action. `gh_issues` and `gh_prs` are better than one `github_do_everything` tool
5. **Don't duplicate core tools** — If `bash`, `read_file`, or `http_fetch` already does it, don't wrap it in a skill tool
6. **Include setup instructions** — If the skill needs auth or config, document it clearly in the SKILL.md body
