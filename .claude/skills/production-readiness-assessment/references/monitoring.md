# Monitoring & Observability Assessment Criteria

## The Three Pillars

### Metrics
- Application metrics (request rate, error rate, latency — the RED method)
- Infrastructure metrics (CPU, memory, disk, network)
- Business metrics (transactions/hour, revenue, active users)
- Custom metrics for domain-specific KPIs
- Metrics collection: Prometheus, StatsD, CloudWatch, Datadog

### Logging
- Structured logging (JSON, not free-text)
- Log levels used appropriately (ERROR for errors, not INFO for everything)
- Correlation IDs / trace IDs in every log line
- Centralized log aggregation (ELK, Loki, CloudWatch Logs, Datadog)
- Log retention policy defined and enforced
- Sensitive data redaction in logs

### Tracing
- Distributed tracing (OpenTelemetry, Jaeger, Zipkin, X-Ray)
- Trace context propagation across service boundaries
- Span instrumentation on critical paths
- Sampling strategy defined (head-based, tail-based, always-on for errors)

## Alerting

### What to Evaluate
- Are alerts defined for critical failure modes?
- Alert routing (PagerDuty, OpsGenie, Slack, email)
- Escalation policies (who gets paged when, and what happens if they don't respond)
- Alert fatigue management (are there too many low-signal alerts?)
- Runbooks linked to alerts (so the responder knows what to do)

### Alert Quality
- Alerts should be actionable (not just "CPU is high" but "response latency exceeding SLO, likely due to database connection saturation")
- SLO-based alerting (burn rate alerts) vs threshold-based
- Multi-window alerting to reduce false positives

## Dashboards

### Expected Dashboards
- Service health overview (the thing you look at first during an incident)
- Per-service detailed view
- SLO tracking dashboard
- Business metrics dashboard
- Infrastructure/cost dashboard

## Incident Detection

### Time to Detect
- How quickly would you know if the system is down?
- Synthetic monitoring / uptime checks (external probes)
- Anomaly detection on key metrics
- User-facing error rate monitoring

## Scoring Guide

**1 - Ad hoc:** Console.log debugging. No centralized logging. No metrics. No alerting. You find out about outages from users.

**2 - Developing:** Basic logging exists but unstructured. Some metrics (maybe cloud provider defaults). Email alerts on server down. No tracing. No correlation IDs.

**3 - Defined:** Structured logging with centralized aggregation. Application metrics collected (RED method). Alerts on critical paths. Basic dashboards. Some distributed tracing.

**4 - Managed:** Full observability stack (metrics, logs, traces). SLO-based alerting. Runbooks for common alerts. Dashboards for each service. Correlation IDs propagated. Alert routing with escalation. On-call rotation defined.

**5 - Optimized:** OpenTelemetry instrumented. Tail-based sampling for error capture. Anomaly detection. SLO burn-rate alerts. Continuous profiling. Custom business metric dashboards. Observability is part of the definition of done for new features.