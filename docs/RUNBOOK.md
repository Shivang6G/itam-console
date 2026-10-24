# Runbook

## Deploy / roll back
- Deploy: `scripts/deploy.sh <env>` (CI does the same). Failed migration = nothing rolled out. Bad release = ECS circuit breaker restores the previous version.
- Manual rollback: `scripts/rollback.sh <env>`.
- Infra-only change: `terraform apply -var "image_tag=$(scripts/current-image-tag.sh <env>)"` in `infra/envs/<env>`.

## Add or change a user
`scripts/create-user.sh <env> person@example.com technician`. To change a role, move the user between Cognito groups (console or `aws cognito-idp admin-add-user-to-group / admin-remove-user-from-group`). The new role applies at their next sign-in (id token lifetime: 60 minutes).

## Look at logs
`aws logs tail /itam/itam-<env>/app --since 30m --follow` (JSON lines: `requestId`, `userSub`, `route`, `status`, `ms`).
Migration: `/itam/itam-<env>/migrate`. Jobs: `/itam/itam-<env>/expiry-alerts`.

## Run a job now
`aws ecs run-task --cluster itam-<env> --launch-type FARGATE --task-definition itam-<env>-expiry-alerts --network-configuration "$(terraform -chdir=infra/envs/<env> output -raw run_task_network)"`

## Restore the database
RDS keeps automated backups (demo 1 day, prod 7). Point-in-time restore creates a NEW instance:
`aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier itam-<env>-db --target-db-instance-identifier itam-<env>-db-restore --use-latest-restorable-time`,
then point the stack at it (or copy the data back). Practise this once before you need it.

## Rotate secrets
- Database master password: managed and rotatable by RDS in Secrets Manager.
- Application database password: taint `module.stack.module.data.random_password.app_db`, apply, then run the migrate task (it updates the role).
- Cognito client secret: replace the client in Terraform, apply.

## First deploy failed: where to look
| Symptom | Check |
|---|---|
| `terraform apply` error on ECS service | Is an image pushed? Re-run `scripts/deploy.sh`; first apply deliberately runs with the service disabled |
| Target group unhealthy | `aws logs tail /itam/itam-<env>/app`; boot errors print `invalid_configuration` with the reason |
| Migration task exits non-zero | `/itam/itam-<env>/migrate` log; usually DB reachability or the RDS CA download in the image build |
| Sign-in loop / "Sign-in session expired" | `PUBLIC_BASE_URL` must equal the CloudFront URL; Cognito callback is `<url>/auth/callback` |
| Upload fails with 403 from S3 | Bucket CORS origin must equal the CloudFront URL; check the task role can write `assets/*` |
| Schedule did not run | EventBridge Scheduler console, then the job's log group |
