# Disaster Recovery Assessment Criteria

## Backup Strategy

### What to Evaluate
- Database backup frequency and type (full, incremental, differential)
- Backup storage location (same region? different region? different provider?)
- Backup encryption
- Backup retention policy
- Application state backup (configs, secrets, certificates)
- **Backup testing** — are restores actually tested regularly?

### The Backup Testing Rule
A backup that hasn't been tested is not a backup. Look for evidence of:
- Automated restore testing (scheduled restores to a test environment)
- Documented restore procedures
- Time-to-restore measurements
- Last successful restore date

## Recovery Objectives

### RTO (Recovery Time Objective)
How long can the system be down before business impact becomes unacceptable?
- Is RTO defined?
- Has the team measured actual recovery time?
- Is there a gap between stated RTO and tested recovery time?

### RPO (Recovery Point Objective)
How much data loss is acceptable?
- Is RPO defined?
- Does the backup frequency support the stated RPO?
- For real-time systems: is there WAL shipping, streaming replication, or change data capture?

## Failover

### Automatic Failover
- Database automatic failover (RDS Multi-AZ, Patroni, etc.)
- Application automatic failover (load balancer health checks)
- DNS failover (Route53 health checks, Cloudflare)
- Does failover actually work? When was it last tested?

### Manual Failover
- Documented procedures for manual failover
- Estimated time for manual failover
- Who has the access and knowledge to execute it?

## Data Sovereignty & Residency
- Where is data stored geographically?
- Are there regulatory requirements for data location?
- Can data be restored to a compliant location?
- Cross-border data transfer mechanisms (for GDPR, etc.)

## Chaos Engineering
- Is there any chaos testing? (Chaos Monkey, Litmus, Gremlin)
- Game days / disaster recovery drills
- Failure injection in non-production environments

## Scoring Guide

**1 - Ad hoc:** No backups, or backups exist but have never been tested. No defined RTO/RPO. No failover capability. Recovery plan is "figure it out when it happens."

**2 - Developing:** Daily backups exist. Some documentation. No tested restore procedures. Single-region deployment. Manual failover possible but undocumented.

**3 - Defined:** Regular backups with tested restores. RTO/RPO defined. Database failover configured. Documented recovery procedures. Backups stored in a different location than production.

**4 - Managed:** Automated backup testing. Failover tested quarterly. Multi-zone deployment with automatic failover. DR drills conducted. Recovery time measured and within RTO.

**5 - Optimized:** Multi-region DR with regular automated testing. Sub-minute RPO. Chaos engineering practiced regularly. DR procedures fully automated. Annual DR drills with executive participation. Recovery tested for every class of failure (single node, zone, region, provider).