# Security notes

- No secret is in the repository or the image. Database credentials live in Secrets Manager and are injected by ECS at start; the master password is generated and owned by RDS.
- The app never connects as the database master user; the migrate task creates a role that can read/write data but cannot create, alter or drop schema objects (covered by an integration test).
- TLS to the database is verified against the RDS CA bundle; the app fails closed if the bundle is missing.
- Uploads: presigned POST with exact content type, 1 byte to 10 MB, fixed key, 5 minute expiry; downloads 60 second presigned GET as attachment; bucket is private, versioned, TLS-only.
- CI uses GitHub OIDC: short-lived credentials, deploy role assumable only from the `demo` and `prod` GitHub Environments. Configure required reviewers on `prod`.
- Image tags are immutable and scanned on push; CI also runs Trivy (image and Terraform), gitleaks, and `npm audit`.
- Follow-ups worth doing: custom domain + HTTPS to the ALB, least-privilege deploy role, VPC interface endpoints for ECR/Logs/Secrets in prod, SNS topic encryption with a CMK, GuardDuty.
- If you previously shared a zip that contained a `.env`, `terraform.tfvars`, `terraform.tfstate` or an AWS access key (the v2 archive did): rotate those credentials. This v3 archive contains none.
