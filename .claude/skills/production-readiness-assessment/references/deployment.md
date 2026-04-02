# Deployment & CI/CD Assessment Criteria

## Pipeline Maturity

### Build
- Automated build on every commit/PR?
- Build reproducibility (deterministic builds, lock files)
- Build time (< 10 min is good, < 5 min is great)
- Artifact versioning and storage

### Test
- Unit tests running in CI?
- Integration tests running in CI?
- Test coverage tracked? (not the number, but whether it's measured and trending)
- Flaky test management

### Deploy
- Automated deployment to staging?
- Automated deployment to production? (or manual approval gate?)
- Environment parity (staging matches production?)
- Feature flags for progressive rollout?

## Deployment Strategies

### What's Implemented?
- **Rolling update:** Zero-downtime with gradual replacement
- **Blue-green:** Full environment swap
- **Canary:** Traffic percentage to new version with automated rollback
- **Feature flags:** Decouple deployment from release

### Rollback Capability
- How fast can you roll back? (seconds, minutes, hours?)
- Is rollback automated or manual?
- Are database migrations reversible?
- Is there a "break glass" rollback that doesn't require CI?

## Infrastructure as Code

### What to Evaluate
- Is infrastructure defined in code? (Terraform, Pulumi, CloudFormation, CDK)
- Is IaC in version control?
- Is there drift detection?
- Can you recreate the entire environment from code?
- Separate environments (dev, staging, production) from the same IaC?

## Release Management

### Versioning
- Semantic versioning?
- Changelog maintained?
- Release notes generated?

### Client/Device Management
For systems deployed to physical devices (POS, IoT, edge):
- Remote update mechanism (Altiris, SOTI, fleet management)
- Staged rollout to device groups
- Offline update capability
- Version pinning per store/location
- Hotfix delivery frequency and mechanism

## Scoring Guide

**1 - Ad hoc:** Manual deployments. No CI. "Works on my machine." Deployments are stressful events that happen after hours.

**2 - Developing:** Basic CI runs tests. Manual deployment with some scripts. No rollback plan. Single environment.

**3 - Defined:** CI/CD pipeline with automated testing and deployment to staging. Manual production deploys with documented process. Basic rollback capability. IaC for core infrastructure.

**4 - Managed:** Full CI/CD to production with approval gates. Blue-green or canary deployments. Automated rollback on failure. Feature flags. Complete IaC. Deployment takes minutes, not hours.

**5 - Optimized:** Multiple deploys per day with confidence. Automated canary analysis. Progressive delivery. GitOps. Full environment reproducibility. Deployment is a non-event. Rollback in seconds.