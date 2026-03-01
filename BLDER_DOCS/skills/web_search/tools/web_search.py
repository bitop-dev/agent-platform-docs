#!/usr/bin/env python3
"""
web_search tool — Search the web using a configurable backend.

Subprocess protocol:
  stdin:  JSON with arguments.query, arguments.max_results, config.backend
  stdout: JSON with content (formatted results) and is_error flag

Backends:
  ddg      — DuckDuckGo via duckduckgo-search library (default, no API key)
  brave    — Brave Search API (requires BRAVE_API_KEY)
  serper   — Serper.dev Google results (requires SERPER_API_KEY)
  tavily   — Tavily AI search (requires TAVILY_API_KEY)
  searxng  — Self-hosted SearXNG (requires SEARXNG_URL)
"""

import json
import os
import sys


def search_ddg(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo search via duckduckgo-search library."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        raise RuntimeError(
            "duckduckgo-search not installed. Run: pip install duckduckgo-search"
        )

    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", r.get("link", "")),
                "snippet": r.get("body", r.get("snippet", "")),
            })
    return results


def search_brave(query: str, max_results: int) -> list[dict]:
    """Brave Search API."""
    import urllib.request
    import urllib.parse

    api_key = os.environ.get("BRAVE_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_API_KEY environment variable not set")

    params = urllib.parse.urlencode({"q": query, "count": max_results})
    url = f"https://api.search.brave.com/res/v1/web/search?{params}"
    req = urllib.request.Request(url, headers={
        "X-Subscription-Token": api_key,
        "Accept": "application/json",
    })

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    results = []
    for r in data.get("web", {}).get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("description", ""),
        })
    return results


def search_serper(query: str, max_results: int) -> list[dict]:
    """Serper.dev Google Search API."""
    import urllib.request

    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        raise RuntimeError("SERPER_API_KEY environment variable not set")

    payload = json.dumps({"q": query, "num": max_results}).encode()
    req = urllib.request.Request(
        "https://google.serper.dev/search",
        data=payload,
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    results = []
    for r in data.get("organic", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("link", ""),
            "snippet": r.get("snippet", ""),
        })
    return results


def search_tavily(query: str, max_results: int) -> list[dict]:
    """Tavily AI Search API."""
    import urllib.request

    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY environment variable not set")

    payload = json.dumps({
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        "include_answer": False,
    }).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    results = []
    for r in data.get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
        })
    return results


def search_searxng(query: str, max_results: int) -> list[dict]:
    """Self-hosted SearXNG instance."""
    import urllib.request
    import urllib.parse

    base_url = os.environ.get("SEARXNG_URL")
    if not base_url:
        raise RuntimeError("SEARXNG_URL environment variable not set")

    params = urllib.parse.urlencode({
        "q": query, "format": "json", "pageno": 1,
    })
    url = f"{base_url.rstrip('/')}/search?{params}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    results = []
    for r in data.get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
        })
    return results


BACKENDS = {
    "ddg": search_ddg,
    "brave": search_brave,
    "serper": search_serper,
    "tavily": search_tavily,
    "searxng": search_searxng,
}


def format_results(results: list[dict]) -> str:
    """Format results as numbered list for the LLM."""
    if not results:
        return "No results found."

    lines = []
    for i, r in enumerate(results, 1):
        title = r.get("title", "Untitled")
        url = r.get("url", "")
        snippet = r.get("snippet", "")
        lines.append(f"{i}. {title}")
        if url:
            lines.append(f"   {url}")
        if snippet:
            lines.append(f"   {snippet}")
        lines.append("")

    return "\n".join(lines).strip()


def main():
    try:
        inp = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"content": f"Invalid input JSON: {e}", "is_error": True}))
        return

    args = inp.get("arguments", {})
    config = inp.get("config", {})

    query = args.get("query", "").strip()
    if not query:
        print(json.dumps({"content": "Error: query is required", "is_error": True}))
        return

    # max_results: argument overrides config default
    max_results = args.get("max_results") or config.get("max_results", 10)
    max_results = min(max(int(max_results), 1), 25)

    backend_name = config.get("backend", "ddg").lower()
    backend_fn = BACKENDS.get(backend_name)
    if not backend_fn:
        print(json.dumps({
            "content": f"Error: unknown backend '{backend_name}'. Available: {', '.join(BACKENDS.keys())}",
            "is_error": True,
        }))
        return

    try:
        results = backend_fn(query, max_results)
        formatted = format_results(results)
        print(json.dumps({"content": formatted, "is_error": False}))
    except Exception as e:
        print(json.dumps({"content": f"Search error ({backend_name}): {e}", "is_error": True}))


if __name__ == "__main__":
    main()
