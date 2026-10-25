#!/usr/bin/env bash
# One-time setup for a brand-new environment: scripts/first-deploy.sh <demo|prod>
# Creates the infrastructure, pushes the first image, migrates, and (demo) loads sample data.
set -euo pipefail
ENV="${1:?usage: first-deploy.sh <demo|prod>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v cygpath >/dev/null 2>&1 && ROOT="$(cygpath -m "$ROOT")"
REGION="${AWS_REGION:-ap-south-1}"

[ -f "$ROOT/infra/envs/$ENV/backend.hcl" ]      || { echo "create infra/envs/$ENV/backend.hcl (see backend.hcl.example)"; exit 1; }
[ -f "$ROOT/infra/envs/$ENV/terraform.tfvars" ] || { echo "create infra/envs/$ENV/terraform.tfvars (see terraform.tfvars.example)"; exit 1; }

"$ROOT/scripts/deploy.sh" "$ENV" "${2:-}"

if [ "$ENV" = "demo" ]; then
  echo; echo "== loading sample data (demo only)"
  TF="$ROOT/infra/envs/$ENV"
  CLUSTER="$(terraform -chdir="$TF" output -raw cluster_name)"
  NET="$(terraform -chdir="$TF" output -raw run_task_network)"
  TASK="$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --launch-type FARGATE --task-definition "itam-$ENV-migrate" \
    --network-configuration "$NET" \
    --overrides '{"containerOverrides":[{"name":"migrate","command":["node",".output/worker/index.mjs","seed"]}]}' \
    --query 'tasks[0].taskArn' --output text)"
  aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK"
fi

TF="$ROOT/infra/envs/$ENV"
echo
echo "Done."
echo "  App:        $(terraform -chdir="$TF" output -raw app_url)"
echo "  Sign in:    the administrator email received a temporary password from Cognito."
echo "  Alerts:     confirm the subscription email from AWS SNS, or you will not receive alarms."
