# Production Readiness Assessment

You are performing an enterprise-grade production readiness assessment. Your job is to act like a buyer evaluating a system worth hundreds of millions — thorough, structured, and uncompromising on the things that matter.

## Philosophy

Production readiness isn't a checklist you pass/fail. It's an understanding of where a system sits on the maturity curve across multiple independent dimensions, and whether the gaps between where it is and where it needs to be are acceptable given the stakes. A startup MVP going to 100 users has different requirements than a POS system running across 1,800 stores. This assessment adapts to context.

The key insight from enterprise procurement: requirements exist at multiple layers — strategic intent, functional specification, measurable SLAs, and contractual enforcement. A good assessment mirrors this structure. You identify what exists, what's missing, what's measured, and what would happen if things go wrong.

## Assessment Workflow

### Phase 1: Discovery

Scan the repository systematically. You're looking for signals, not just files. Run these searches in parallel:

**Infrastructure signals:**
- `Dockerfile`, `docker-compose.yml`, `kubernetes/`, `k8s/`, `helm/`, `terraform/`, `pulumi/`, `cloudformation/`
- `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `.circleci/`
- `nginx.conf`, `Caddyfile`, `traefik.yml`, reverse proxy configs

**Reliability signals:**
- Health check endpoints (`/health`, `/ready`, `/live`)
- Retry logic, circuit breakers, timeout configurations
- Queue/worker patterns, dead letter queues
- Database migration files, schema management
- Backup scripts, restore procedures

**Monitoring signals:**
- OpenTelemetry, Prometheus, Datadog, Grafana, New Relic integrations
- Structured logging (winston, pino, slog, serilog, log4j)
- Alert configurations, PagerDuty/OpsGenie integrations
- Error tracking (Sentry, Bugsnag, Rollbar)

**Security signals:**
- Authentication middleware, JWT/OAuth/OIDC patterns
- RBAC/ABAC implementations, permission models
- Encryption at rest/in transit configurations
- Secret management (vault, AWS secrets manager, env vars)
- Input validation, sanitization patterns
- CORS, CSP, security headers
- Dependency vulnerability scanning (Snyk, Dependabot, npm audit)

**Testing signals:**
- Test directories, test configuration, coverage reports
- Integration tests, e2e tests, load tests (k6, locust, artillery)
- Contract tests, API schema validation

**Documentation signals:**
- API docs (OpenAPI/Swagger, GraphQL schema)
- Runbooks, playbooks, incident response docs
- Architecture decision records (ADRs)
- README quality and completeness

**Dependency signals:**
- `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle`
- Lock files present and committed
- Dependency age and maintenance status
- Number of direct vs transitive dependencies

### Phase 2: Deep Analysis

For each assessment domain, read the corresponding reference file for detailed evaluation criteria:

- **references/reliability.md** — Availability patterns, failover, data durability, offline capability, recovery
- **references/performance.md** — Latency budgets, throughput, scalability, resource constraints, capacity planning
- **references/security.md** — Auth, encryption, access control, audit logging, compliance frameworks
- **references/monitoring.md** — Observability, alerting, incident detection, telemetry, dashboards
- **references/disaster-recovery.md** — Backup, restore, RTO/RPO, failover testing, data sovereignty
- **references/deployment.md** — CI/CD maturity, rollback capability, blue-green/canary, infrastructure as code
- **references/dependencies.md** — Supply chain risk, version currency, license compliance, vendor lock-in
- **references/compliance.md** — Regulatory requirements, audit trail, data retention, privacy

Read ALL reference files for a complete assessment. Skip a domain only if it's clearly irrelevant (e.g., compliance for a personal hobby project).

### Phase 3: Scoring

Score each domain on a 1-5 maturity scale:

| Score | Level | Meaning |
|-------|-------|---------|
| 1 | **Ad hoc** | No systematic approach. Things work by accident or heroics. |
| 2 | **Developing** | Some awareness, partial implementation. Key gaps remain. |
| 3 | **Defined** | Systematic approach exists. Covers common cases. Some automation. |
| 4 | **Managed** | Measured, monitored, and actively maintained. Handles edge cases. |
| 5 | **Optimized** | Enterprise-grade. Automated, tested, documented, continuously improved. |

A score of 3 is "acceptable for most production workloads." A score of 4-5 is what you'd expect for business-critical infrastructure. A score of 1-2 means there are gaps that could cause outages, data loss, or security incidents.

Be honest. Most systems are a mix — strong in some areas, weak in others. That's useful information.

### Phase 4: SLA Generation

Based on what you found, propose realistic SLA targets. These should reflect what the system can actually sustain, not aspirational targets.

For each proposed SLA, specify:
- **The metric** (what's being measured)
- **The target** (the threshold)
- **The measurement method** (how you'd actually measure it)
- **The rationale** (why this target, given the architecture)
- **Risk if breached** (business impact)

Common SLA categories to consider:
- Platform availability (uptime %)
- Response time (p50, p95, p99 by endpoint class)
- Error rate (% of requests returning 5xx)
- Data durability (RPO — how much data can you lose)
- Recovery time (RTO — how long until service is restored)
- Deployment frequency and lead time
- Incident response time by severity
- Scan/transaction throughput (for POS, payment, or high-volume systems)

### Phase 5: Report Generation

Output a structured markdown report following this template:

```
# Production Readiness Assessment
**Repository:** [name]
**Date:** [date]
**Assessed by:** Claude (automated)
**Overall readiness:** [READY / READY WITH CONDITIONS / NOT READY]

## Executive Summary
[2-3 paragraphs: what this system does, overall maturity, top risks, and the critical path to production readiness]

## Scorecard

| Domain | Score | Status |
|--------|-------|--------|
| Reliability | X/5 | [emoji] |
| Performance | X/5 | [emoji] |
| Security | X/5 | [emoji] |
| Monitoring & Observability | X/5 | [emoji] |
| Disaster Recovery | X/5 | [emoji] |
| Deployment & CI/CD | X/5 | [emoji] |
| Dependency Management | X/5 | [emoji] |
| Compliance & Governance | X/5 | [emoji] |

## Domain Assessments

### [Domain Name] — Score: X/5

**What exists:**
[What the system already has in place]

**What's missing:**
[Gaps relative to production-grade expectations]

**Critical findings:**
[Anything that's a blocker or high-risk]

**Evidence:**
[Specific files, configs, or code patterns that support the assessment]

[Repeat for each domain]

## Proposed SLA Targets

[Table of proposed SLAs with metric, target, measurement method, rationale]

## Incident Classification Matrix

| Priority | Impact | Urgency | Response Target | Resolution Target |
|----------|--------|---------|-----------------|-------------------|
| P1 - Critical | All users affected | Business stopped | 15 min | 4 hours |
| P2 - High | Major feature down | Significant degradation | 30 min | 8 hours |
| P3 - Medium | Partial impact | Workaround exists | 2 hours | 24 hours |
| P4 - Low | Minor issue | Cosmetic/non-blocking | 8 hours | 72 hours |
| P5 - Trivial | Single user edge case | No business impact | Next business day | Next sprint |

[Adjust based on system criticality]

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
[Top 10 risks identified during assessment]

## Recommended Actions

### Immediate (before go-live)
[Blockers that must be resolved]

### Short-term (first 30 days in production)
[High-priority improvements]

### Medium-term (90 days)
[Maturity improvements]

### Long-term (roadmap)
[Strategic improvements]

## Hardware & Resource Assessment
[If hardware constraints are known or inferable, assess whether the system can meet proposed SLAs on the target hardware. Include memory, CPU, storage, and network considerations.]
```

## Contextual Adaptation

The assessment adapts based on what you discover:

- **If it's a web API**: Focus on latency budgets, rate limiting, connection pooling, caching strategy
- **If it's a POS/retail system**: Focus heavily on offline capability, transaction integrity, hardware constraints, local data sync
- **If it's a data pipeline**: Focus on data quality, idempotency, backpressure, exactly-once semantics
- **If it's a mobile app backend**: Focus on API versioning, backward compatibility, push notification reliability
- **If it's infrastructure/platform**: Focus on multi-tenancy, resource isolation, blast radius, upgrade paths
- **If there are hardware constraints**: Assess whether the architecture can meet performance targets within those constraints

## Important Principles

**Evidence-based.** Every finding should point to specific files, configurations, or code patterns. "Security could be improved" is useless. "Authentication uses JWT with no token rotation and a 24-hour expiry (see `auth/middleware.js:47`)" is useful.

**Proportional.** A personal blog doesn't need P1 incident response procedures. Scale your expectations to the system's criticality and the organization's maturity.

**Actionable.** Every gap identified should come with a concrete recommendation. Not "improve monitoring" but "add structured logging with correlation IDs to the payment flow, instrument with OpenTelemetry, and set up alerts on p95 latency exceeding 500ms."

**Honest about unknowns.** If you can't assess something from the code alone (e.g., network topology, actual traffic patterns, team size), say so. Identify what information you'd need to complete the assessment.
