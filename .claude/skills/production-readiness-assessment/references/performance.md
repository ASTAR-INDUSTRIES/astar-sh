# Performance Assessment Criteria

## Latency

### Response Time Budgets
Evaluate whether the system has defined and enforced latency targets:
- Are there p50/p95/p99 targets per endpoint or endpoint class?
- Is there evidence of performance testing (k6, locust, artillery, JMeter)?
- Are there performance regression tests in CI?
- Do slow queries have logging or alerting?

### Common Latency Targets by System Type
- **User-facing web API:** p95 < 200ms, p99 < 500ms
- **POS/retail transaction:** scan-to-line p95 < 300ms, login < 1s
- **Search:** < 1s offline and online
- **Background processing:** defined SLOs per job type
- **Real-time streaming:** < 100ms end-to-end

### Latency Optimization Patterns
- Connection pooling (database, HTTP clients)
- Caching strategy (local, distributed, CDN)
- Query optimization (indexes, query plans, N+1 detection)
- Async processing for non-critical paths
- Edge computing / data locality

## Throughput

### Capacity Planning
- Is there a defined peak load expectation? (e.g., 130 transactions/hour/store)
- Has the system been load tested to that capacity?
- Is there autoscaling configured? What are the triggers?
- What's the headroom between normal load and breaking point?

### Concurrency
- How many concurrent users/connections can the system handle?
- Are there connection limits configured appropriately?
- Is there evidence of thread/goroutine/worker pool management?
- Database connection pool sizing

## Scalability

### Horizontal Scaling
- Can the application scale horizontally? (stateless design)
- Is session state externalized?
- Are there sticky sessions that prevent scaling?
- Database read replicas for read-heavy workloads?

### Vertical Constraints
- Memory usage patterns (leaks, unbounded caches)
- CPU-bound operations (can they be offloaded?)
- Disk I/O patterns (sequential vs random, SSD vs HDD assumptions)
- For constrained hardware: does the system fit within known resource limits?

## Resource Constraints
For systems running on specific/limited hardware:
- Memory footprint analysis (baseline, peak, growth over time)
- CPU utilization under load
- Disk space management (log rotation, temp file cleanup, database growth)
- Network bandwidth assumptions
- Cold start time (important for POS, embedded, edge systems)

## Scoring Guide

**1 - Ad hoc:** No performance targets defined. No load testing. No caching strategy. Performance issues discovered by users in production.

**2 - Developing:** Some caching. Basic database indexes. Occasional manual load tests. No defined latency budgets.

**3 - Defined:** Latency targets exist for critical paths. Regular load testing. Caching strategy implemented. Connection pooling configured. Performance monitored in production.

**4 - Managed:** Comprehensive performance testing in CI. Autoscaling configured and tested. p95/p99 tracked and alerted. Capacity planning done quarterly. Performance budgets enforced.

**5 - Optimized:** Performance testing on every deploy. Sub-100ms p99 for critical paths. Predictive autoscaling. Continuous profiling in production. Performance is a first-class engineering concern with dedicated tooling.