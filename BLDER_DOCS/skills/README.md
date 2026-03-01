# Bundled Skills — Reference Implementations

These are **reference specs**, not production code. They document:

- The SKILL.md frontmatter format and agent instructions
- Tool schemas (JSON) — the contract between agent-core and the tool
- Tool implementations (Python/bash) — example implementations showing the expected protocol and behavior
- Test fixtures — example inputs and expected outputs

When agent-core is built, these serve as the specification for what each bundled skill does. The actual implementations may differ (different language, different libraries, optimizations) but must conform to the same schemas and produce compatible output.

## Bundled Skills

| Skill | Description | Dependencies |
|---|---|---|
| `web_search` | Search the web via DuckDuckGo (pluggable backend) | `python3` |
| `web_fetch` | Fetch a URL, extract readable content as markdown | `python3` |
| `summarize` | Summarize long text into concise output | none (uses agent's LLM) |
| `github` | GitHub operations via `gh` CLI | `gh` |
| `gitlab` | GitLab operations via `glab` CLI | `glab` |
| `report` | Structure output into formatted markdown documents | none |
| `send_email` | Send email via SMTP | none (requires SMTP env vars) |
