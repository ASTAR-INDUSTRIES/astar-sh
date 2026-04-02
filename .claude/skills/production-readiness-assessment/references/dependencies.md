# Dependency Management Assessment Criteria

## Supply Chain Risk

### Direct Dependencies
- How many direct dependencies? (fewer is generally better)
- Are they well-maintained? (last commit, release frequency, bus factor)
- Are they from reputable sources?
- Any dependencies with known security issues?
- License compatibility (GPL contamination, commercial restrictions)

### Transitive Dependencies
- Total dependency tree size
- Are there deeply nested transitive dependencies from unmaintained packages?
- Dependency resolution conflicts

### Lock Files
- Are lock files committed to version control? (critical for reproducibility)
- package-lock.json, yarn.lock, Pipfile.lock, go.sum, Cargo.lock, Gemfile.lock

## Version Currency

### Framework/Runtime Version
- Is the language runtime supported? (not end-of-life)
- Is the web framework current? (within 1-2 major versions)
- Database version supported by vendor?

### Dependency Freshness
- How old are the dependencies? (major versions behind?)
- Is there a policy for updating dependencies?
- Are there automated dependency update PRs? (Dependabot, Renovate)

## Vendor Lock-in

### Cloud Provider
- How tightly coupled is the system to a specific cloud provider?
- Are there abstraction layers that would ease migration?
- Proprietary services used (Aurora, DynamoDB, Cloud Spanner, etc.)

### Third-party Services
- Critical dependencies on third-party APIs
- What happens if a third-party service goes down?
- Are there fallback providers or graceful degradation?
- Contract/SLA coverage from third-party providers

## SBOM (Software Bill of Materials)
- Is there an SBOM generated?
- Can you enumerate all components and their versions?
- This is increasingly required for compliance (US Executive Order 14028, EU CRA)

## Scoring Guide

**1 - Ad hoc:** No lock files. Dependencies never updated. No vulnerability scanning. No idea what's in the dependency tree. Abandoned packages in use.

**2 - Developing:** Lock files committed. Occasional manual updates. Some awareness of major vulnerabilities. No automated scanning.

**3 - Defined:** Automated dependency scanning in CI. Regular update cadence. Lock files always committed. Known vulnerabilities addressed within weeks. License review done at adoption.

**4 - Managed:** Automated dependency update PRs with CI validation. Critical CVEs addressed within 48 hours. SBOM generated. Vendor lock-in risks documented. Dependency health dashboard.

**5 - Optimized:** Continuous dependency monitoring. Automated security patching for non-breaking updates. SBOM in standard format (SPDX, CycloneDX). Vendor abstraction layers. Dependency decisions documented in ADRs. Supply chain attestation (SLSA).