---
name: web_fetch
version: 0.1.0
description: "Fetch a webpage and extract readable content as markdown. Use when: you have a URL and need the full page content — after web_search, reading documentation, or following a link. NOT for: JSON APIs (use http_fetch core tool), local files (use read_file), or when the web_search snippet already answers the question."
author: platform-team
tags: [web, fetch, research]
emoji: 🌐
always: false

requires:
  bins: [python3]

config:
  max_chars:
    type: integer
    default: 20000
    description: "Maximum characters to return. Truncates long pages to avoid context overflow."
  include_links:
    type: boolean
    default: true
    description: "Preserve hyperlinks in markdown output"
---

# Web Fetch

Fetch a URL and return the page's main content as clean markdown. Strips navigation, ads, scripts, and boilerplate — returns only the readable article/page content.

## When to Use

✅ **USE this skill when:**
- You found a relevant URL from `web_search` and need the full content
- The user gave you a URL to read
- You need to read documentation, blog posts, or articles
- The search snippet wasn't enough to answer the question

❌ **DON'T use this skill when:**
- The `web_search` snippet already answers the question — don't fetch unnecessarily
- You need to call a JSON API — use the `http_fetch` core tool instead
- The URL points to a local file — use `read_file`
- The URL is a PDF, image, or binary file — this only handles HTML pages

## Tips

1. **Check the snippet first** — If `web_search` already gave you a useful snippet, don't fetch the full page
2. **Use `max_chars` wisely** — For quick lookups, 5000 chars is usually enough. For full documentation pages, use the default 20000
3. **One page at a time** — Don't fetch 10 URLs in parallel. Read one, see if it answers the question, then fetch another only if needed
4. **Watch for errors** — Some sites block automated requests. If a fetch fails, try a different URL from your search results
