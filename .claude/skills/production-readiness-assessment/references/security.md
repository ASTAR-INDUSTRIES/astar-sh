# Security Assessment Criteria

## Authentication & Identity

### Patterns to Evaluate
- Authentication mechanism (JWT, OAuth2, OIDC, SAML, session-based)
- Token lifecycle (expiry, rotation, revocation)
- Multi-factor authentication availability
- Federated identity support
- Service-to-service authentication (mTLS, API keys, service tokens)
- Local/offline authentication fallback (for POS, edge systems)
- Emergency/firefighter access with enhanced logging

### Common Weaknesses
- Hardcoded secrets in source code
- JWT with no rotation and long expiry
- No token revocation mechanism
- Shared service accounts for admin operations
- Password storage without proper hashing (bcrypt, argon2, scrypt)

## Authorization & Access Control

### Models
- RBAC (Role-Based Access Control) — most common
- ABAC (Attribute-Based Access Control) — more granular
- Hybrid RBAC+ABAC — enterprise standard
- Resource-level permissions (row-level security)

### What to Look For
- Is authorization enforced at the API layer, not just the UI?
- Are there permission checks on every endpoint?
- Is there a central authorization service or is it scattered?
- Group-based access with attribute filtering (e.g., store-level, region-level)
- SCIM provisioning from external IDM systems

## Encryption

### At Rest
- Database encryption (transparent data encryption, application-level)
- File/blob storage encryption
- Mobile device encryption
- Key management (HSM, KMS, manual rotation)

### In Transit
- TLS 1.2+ on all endpoints
- Certificate management (auto-renewal, pinning for mobile)
- Internal service-to-service encryption
- VPN or private networking between components

## Audit & Logging

### Requirements
- All authentication events logged (login, logout, failed attempts)
- All authorization decisions logged (especially denials)
- All data modifications logged with actor identity
- Personal user accounts for all admin operations (no shared accounts)
- Log retention policy (minimum 30 days, configurable)
- Tamper-evident logging (append-only, signed, or shipped to immutable store)

## Vulnerability Management

### Dependency Scanning
- Automated CVE scanning in CI (Snyk, Dependabot, npm audit, safety)
- Policy for critical vulnerability response time
- SBOM (Software Bill of Materials) generation

### Application Security
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding, CSP headers)
- CSRF protection
- Rate limiting on authentication endpoints
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)

## Compliance Frameworks
- ISO 27001/27002
- NIST Cybersecurity Framework
- SOC 2 Type II readiness
- GDPR / data privacy regulations
- PCI DSS (for payment processing)
- Industry-specific (HIPAA, FedRAMP, etc.)

## Scoring Guide

**1 - Ad hoc:** Secrets in code. No authentication on internal APIs. No encryption at rest. No audit logging. Vulnerabilities not tracked.

**2 - Developing:** Basic auth implemented. TLS on external endpoints. Some logging. No systematic vulnerability management. Secrets partially externalized.

**3 - Defined:** Proper auth with token management. TLS everywhere. Secrets in a vault. Regular dependency scanning. Audit logging on critical operations. RBAC implemented.

**4 - Managed:** RBAC+ABAC. mTLS between services. Automated vulnerability scanning in CI with blocking on critical CVEs. Comprehensive audit trail. Regular penetration testing. Incident response plan exists.

**5 - Optimized:** Zero-trust architecture. Automated secret rotation. SBOM generation. Bug bounty program. Compliance certifications maintained. Security is embedded in the development process, not bolted on.