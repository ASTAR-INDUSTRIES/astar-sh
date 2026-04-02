# Compliance & Governance Assessment Criteria

## Regulatory Requirements

Identify which regulations apply based on the system's domain:

### Data Privacy
- **GDPR** (EU/EEA): Right to access, right to deletion, data portability, consent management, DPIAs, breach notification
- **National data protection laws**: Country-specific implementations (e.g., Norwegian Personal Data Act / Personopplysningsloven)
- **CCPA/CPRA** (California): Similar to GDPR with some differences
- **No transmission to third countries** without adequacy assessment or appropriate safeguards
- **Pseudonymization/encryption** for data stored outside approved jurisdictions

### Financial/Payment
- **PCI DSS**: For any system handling card payments
- **SOX**: For financial reporting systems
- **PSD2/SCA**: For European payment systems
- **National fiscal legislation**: Cash register laws (e.g., Norwegian Kassaloven), tax reporting requirements

### Industry-Specific
- **HIPAA**: Healthcare
- **FedRAMP**: US government
- **NIS2**: EU network and information security

## Data Subject Rights
For systems handling personal data:
- Can a data subject view their data?
- Can data be exported in machine-readable format?
- Can data be corrected or deleted?
- Can data be deleted from backups and logs? (not just the primary database)
- Automatic deletion after configurable retention periods
- Privacy-by-default settings
- Data minimization (only collect what's necessary)

## Audit Trail

### Requirements
- All privileged operations traced to individual user accounts
- No shared admin accounts
- Configurable logging with action traceability
- Log integrity protection
- Retention: minimum 30 days (configurable, often 90+ days for compliance)

## Data Retention & Deletion
- Defined retention policies per data category
- Automated deletion after retention period
- Deletion capability from all stores (database, backups, logs, caches)
- Legal hold capability (pause deletion for litigation)

## Test Data Management
- Production data anonymization for test environments
- No real personal data in non-production environments
- Synthetic data generation capability

## Documentation & Governance
- Privacy Impact Assessments (DPIAs/PIAs)
- Data Processing Agreements (DPAs) with sub-processors
- Record of processing activities
- Incident response plan for data breaches
- Data classification scheme

## Scoring Guide

**1 - Ad hoc:** No awareness of regulatory requirements. Personal data handled without controls. No audit trail. No data deletion capability.

**2 - Developing:** Some awareness of applicable regulations. Basic consent collection. Partial audit logging. Manual data deletion process (no guarantee of completeness).

**3 - Defined:** Applicable regulations identified and mapped to controls. RBAC with personal accounts. Audit logging on sensitive operations. Data retention policy defined. DPIA completed. Basic data subject rights implemented.

**4 - Managed:** Full compliance framework mapped. Automated audit logging. Data subject rights fully implemented with self-service. Automated data retention/deletion. DPAs with all sub-processors. Regular compliance reviews. Test data anonymization.

**5 - Optimized:** Compliance-as-code. Automated compliance checking in CI/CD. Privacy-by-design embedded in development process. Regular third-party audits. Certifications maintained (ISO 27001, SOC 2). Data sovereignty controls automated. Legal hold capability tested.