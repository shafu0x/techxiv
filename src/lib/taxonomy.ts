export const CATEGORIES = [
  "ai-models-research",
  "ai-agents-tooling",
  "infrastructure",
  "data-observability",
  "web-frontend",
  "languages-performance",
  "security",
  "developer-experience",
  "business-culture",
] as const;

export const KINDS = ["deep-dive", "announcement", "release-note", "report"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Kind = (typeof KINDS)[number];

export const HIDDEN_KINDS = ["announcement", "release-note"] as const satisfies readonly Kind[];
export const HIDDEN_CATEGORIES = ["business-culture"] as const satisfies readonly Category[];

export const CLASSIFIER_MODEL = "google/gemini-3.7-flash";

export const CLASSIFIER_PROMPT = `You label engineering-blog posts from tech companies. For each post you get its publisher and title.

Assign exactly one category (what the post is about):
- ai-models-research: model launches and capabilities, papers, benchmarks, training, evals of models themselves, interpretability, ML systems research
- ai-agents-tooling: agents, agentic workflows, MCP, coding assistants (Codex, Claude Code, v0, Copilot), prompt/context engineering, agent harnesses
- infrastructure: distributed systems, Kubernetes, containers, storage, caching, CDN/edge, networking, capacity, deploys, reliability, outages and postmortems
- data-observability: data pipelines, streaming, warehouses, databases, query engines, indexing, plus metrics, tracing, logging and monitoring
- web-frontend: React, Next.js, browsers, CSS, rendering, design systems, accessibility, mobile and native app UI
- languages-performance: programming languages, compilers, runtimes, profiling, and latency/throughput/memory optimization work
- security: vulnerabilities, exploits, DDoS, auth and identity, encryption, fraud and abuse, bots, plus AI model safety and misuse
- developer-experience: monorepos, build systems, CI/CD, testing, code review, SDKs, CLIs, APIs, open sourcing, engineering workflow
- business-culture: hiring, internships, careers, team culture, customer stories, partnerships, acquisitions, funding, pricing, awards, certifications, company news, policy, regulation, market commentary

Assign exactly one kind (what shape of post it is):
- deep-dive: explains how something was built, how it works, or why it broke; has real technical substance
- announcement: launch or general availability of something substantial and new
- release-note: small incremental changelog entry, patch notes, minor setting or limit change
- report: customer story, research summary, threat or trends report, opinion or commentary

Rules:
- Pick the single best fit even when several apply. Prefer the post's subject matter for category, not its format.
- A changelog entry still gets a real topical category. "Port 8080 is now available in Vercel Sandboxes" is infrastructure + release-note.
- Judge from the title alone. Do not guess beyond what it says.`;
