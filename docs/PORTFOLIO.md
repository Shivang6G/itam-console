# ITAM Console v3: portfolio kit

Everything you need to present this project. Claims below are limited to what is actually in the repository or was actually run. Items that need your own AWS account are marked **[after deploy]**.

## 30-second pitch

"ITAM Console is an IT asset management system I built and deployed on AWS. Staff track assets, licenses and support tickets, attach files, and every change is audited. It runs on ECS Fargate behind CloudFront, uses Cognito for sign-in and RDS PostgreSQL for data, and the whole environment is created with Terraform and deployed by one script or a GitHub Actions pipeline."

## 5-minute demo script

| Min | Show | Say |
|---|---|---|
| 0:00 | `docs/architecture.png` | Request path: browser, CloudFront, ALB (accepts only CloudFront), Fargate tasks, RDS in private subnets. |
| 1:00 | Sign-in page, then Cognito hosted UI **[after deploy]** (locally: Dev sign-in) | Authorization code + PKCE. Roles come from Cognito groups: viewer, technician, admin. |
| 1:45 | Dashboard | Counts and charts come from live database queries. |
| 2:15 | Add an asset, then open the audit log (admin) | Every change writes an audit row with before/after in the same transaction. |
| 3:00 | Raise a ticket as viewer, try to delete an asset as viewer | Server-side permission matrix: blocked even if the UI is bypassed. |
| 3:30 | Upload a PDF to an asset **[after deploy]** | Presigned S3 upload, 10 MB limit, type allow-list. |
| 4:00 | Terminal: `npm test` (43 passing) and `terraform validate` | Tests include integration tests against real PostgreSQL. |
| 4:30 | `infra/modules/` tree and `scripts/first-deploy.sh` | One command: infra, image push, migration, start, seed. Safe to re-run. |

## Resume bullets (pick 3-4)

Use the ones that are true for you on the day.

- Built a full-stack IT asset management platform (TanStack Start/React, Node 22, PostgreSQL) with role-based access, an audit trail, file attachments, and scheduled expiry alerts.
- Designed AWS infrastructure in Terraform (VPC with public/private/data tiers, ALB, CloudFront, ECS Fargate, RDS PostgreSQL 16, S3, Cognito, Secrets Manager, CloudWatch, SNS) split into 8 reusable modules with separate demo and prod configurations.
- Secured the stack: ALB reachable only through CloudFront, database in private subnets with TLS and a least-privilege app role, httpOnly cookies, CSRF origin checks, PKCE sign-in, and no stored AWS keys in CI (GitHub OIDC).
- Wrote 43 automated tests (unit plus integration against real PostgreSQL) and CI that runs tests, `terraform validate` and `tflint` on every pull request.
- **[after deploy]** Deployed to AWS ap-south-1 with a one-command script (build, push to ECR, migrate, roll out with automatic rollback) and monitored with CloudWatch alarms and SNS email alerts.

Do not claim "production" or uptime numbers. It is a demo environment.

## Interview Q&A

**Why Fargate instead of EC2?** No servers to patch, rolling deploys with automatic rollback, and tasks scale by count. v2 used an Auto Scaling Group, which meant managing AMIs and instances.

**Why CloudFront in front of the ALB?** HTTPS without owning a domain (cloudfront.net certificate), and the ALB security group plus a secret header means nothing can reach the ALB directly.

**Why Cognito instead of Supabase auth?** Native AWS identity, hosted sign-in page, groups map straight to roles, MFA available for prod. It removed an external dependency.

**Why not Postgres row-level security?** v2 used Supabase RLS. On RDS the app enforces a permission matrix on every server function and connects with a restricted role that cannot alter the schema (tested).

**How do migrations run safely?** As a one-off Fargate task before the app rolls out. Migrations must be backwards compatible (add first, remove later) so rollback stays safe.

**How is the demo different from prod?** One place: `locals.mode` in `infra/modules/stack/main.tf`. Prod adds NAT, two autoscaling tasks, multi-AZ RDS with deletion protection, WAF, a KMS key and required MFA.

**What does it cost, and how do you control it?** About $45-55/month for demo (ALB and public IPv4 dominate), shown in the README as an estimate. A Budgets alarm is created, and `terraform destroy` stops the charges.

**What would you improve next?** Custom domain and ACM certificate so CloudFront-to-ALB is HTTPS, a least-privilege deploy role instead of AdministratorAccess, and end-to-end browser tests.

**Hardest problem you hit?** Be specific and honest: `docker login --password-stdin` failing on Windows (fixed with a fallback), migration ordering on first deploy (fixed so migration runs before app tasks), and Terraform plan JSON showing blank task-definition fields (they are "known after apply", visible in `after_unknown`).

## Honest status (say this if asked)

- Verified by running: typecheck, lint, production build, 43 tests (including 5 against real PostgreSQL 16), migrations and seed, local server returning 200 on `/healthz` and `/signin`.
- Verified by static checks: Terraform `validate`, provider-schema checks, tflint (see README).
- **Not verified until you deploy:** real Cognito sign-in, S3 browser upload, CloudFront/ALB routing, ECS scheduling. If you have not deployed by the presentation, present the local app plus the architecture and say so. Do not show old v2 screenshots as v3.
