---
name: web_search
version: 0.1.0
description: "Search the web for information. Use when: you need current facts, recent events, documentation, tutorials, or any knowledge you're unsure about. NOT for: questions you can confidently answer from training data, file contents already available locally, or GitHub/GitLab operations (use those skills instead)."
author: platform-team
tags: [web, search, research]
emoji: 🔍
always: false

requires:
  bins: [python3]

config:
  backend:
    type: string
    default: ddg
    enum: [ddg, brave, serper, tavily, searxng]
    description: "Search backend. ddg requires no API key."
  max_results:
    type: integer
    default: 10
    description: "Default max results when not specified by the agent"
---

# Web Search

Search the web and return titles, URLs, and snippets for a query.

## When to Use

✅ **USE this skill when:**
- You need current or recent information (news, events, releases)
- You're unsure about a fact and want to verify it
- The user asks about something outside your training data
- You need documentation, tutorials, or API references
- You need to find specific websites or resources

❌ **DON'T use this skill when:**
- You can confidently answer from your training knowledge
- The information is already available in local files (use `read_file`)
- The user is asking about their own codebase (use file tools)
- You need to interact with GitHub/GitLab (use those skills)
- You already have search results that answer the question

## How to Search Well

1. **Be specific** — "Go 1.22 error handling changes" beats "Go errors"
2. **Include key terms** — Use the most distinctive words from the user's question
3. **Don't over-search** — One good query is better than five vague ones
4. **Use time context** — If the user wants recent info, include the year or "2026" in the query
5. **Read the snippets first** — Often the snippet answers the question without needing to fetch the full page
6. **Follow up selectively** — Only use `web_fetch` on results whose snippets look genuinely relevant

## Result Format

Results come back as a numbered list:

```
1. Title of the first result
   https://example.com/page
   Snippet text showing a preview of the page content...

2. Title of the second result
   https://another.com/article
   Another snippet with relevant information...
```

## Limits

- Default max results: 10 (configurable per agent)
- If you need fewer results, set `max_results` to 3-5 to save tokens
- If the first search doesn't find what you need, refine the query rather than searching the same thing again
