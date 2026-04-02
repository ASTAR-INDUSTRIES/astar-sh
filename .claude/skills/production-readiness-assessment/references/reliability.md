# Reliability Assessment Criteria

## Availability Architecture

Evaluate the system's ability to remain operational under adverse conditions.

### Single Points of Failure
- Is there a single database instance with no replica?
- Is there a single application server with no load balancing?
- Are there services that, if they go down, take everything with them?
- Is there a single region/zone deployment?

### Redundancy Patterns
- Active-active vs active-passive configurations
- Database replication (synchronous vs asynchronous, implications for consistency)
- Multi-zone or multi-region deployment
- Load balancer health checks and failover behavior

### Graceful Degradation
- Does the system have circuit breakers? (e.g., Hystrix, resilience4j, Polly, gobreaker)
- Can the system shed load under pressure? (rate limiting, backpressure)
- Are there fallback behaviors when dependencies fail?
- Can the system operate in a degraded mode (e.g., read-only, cached data)?

### Offline Capability
For systems that must operate without network connectivity:
- Local data storage with sync mechanisms
- Conflict resolution strategy for offline mutations
- Seamless online/offline transition (no user intervention required)
- Data loss prevention during connectivity transitions
- UI indicators for connectivity state
- Local authentication when federated auth is unavailable

### Transaction Integrity
- ACID compliance where required
- Idempotency of critical operations
- Saga patterns or distributed transaction handling
- Basket/cart/session recovery after failures (power outage, crash, network loss)
- Write-ahead logging or event sourcing for durability

### Data Durability
- Is data written to durable storage before acknowledging?
- Are there write-ahead logs or event sourcing patterns?
- What's the data replication strategy?
- How is data consistency maintained across replicas?

## Scoring Guide

**1 - Ad hoc:** Single points of failure everywhere. No health checks. No retry logic. A single node failure causes total outage.

**2 - Developing:** Basic health checks exist. Some retry logic. But no circuit breakers, no graceful degradation, single database instance.

**3 - Defined:** Health checks, retries, and basic redundancy. Database has a replica. Load balancer in place. Circuit breakers on critical paths. Recovery from common failures is automated.

**4 - Managed:** Multi-zone deployment. Comprehensive circuit breakers. Graceful degradation tested and documented. Chaos engineering practiced occasionally. RTO/RPO defined and tested.

**5 - Optimized:** Multi-region active-active. Automated failover tested regularly. Chaos engineering in production. Zero-downtime deployments. Offline capability if needed. Every failure mode documented with automated recovery.