# Findings — OPS (Repository, environments and delivery)

### Findings of OPS-REPO-01 — repository hygiene files and licence (2026-10-22)
- (a) **OPS** [topic: deployment-infra, ci-supply-chain] [type: rule] — Rule as built: `.gitignore` covers every pattern of RF-OPS-01 and nothing else; the agent tooling of the working copy is excluded locally through `.git/info/exclude` and never named in committed ignore files. `.dockerignore` assumes the repository root as every build context and excludes `docs`, `bin`, coverage, all Playwright report folders, every `dist` except `backend/internal/web/dist/.gitkeep`, and `.env*`; image builds copy only the sources they need and produce `dist` inside their build stages.
