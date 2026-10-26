#!/usr/bin/env bash
# Build, push and roll out a new version. Used by CI and by hand: scripts/deploy.sh <demo|prod> [tag]
#
# Order matters:
#   1. image to ECR            (immutable tag = git SHA)
#   2. terraform apply         (registers new task-definition revisions; the service keeps running the old one)
#   3. database migration      (one-off task; if it fails we stop here and users never see the new version)
#   4. update-service          (rolling deploy, circuit breaker rolls back automatically)
#   5. smoke test              (public URL, deep health check)
set -euo pipefail

ENV="${1:?usage: deploy.sh <demo|prod> [tag]}"
TAG="${2:-$(git rev-parse --short=12 HEAD)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v cygpath >/dev/null 2>&1 && ROOT="$(cygpath -m "$ROOT")"
TF="$ROOT/infra/envs/$ENV"
REGION="${AWS_REGION:-ap-south-1}"
SERVICE_ENABLED="${SERVICE_ENABLED:-true}"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
tfout() { terraform -chdir="$TF" output -raw "$1"; }

for bin in aws docker terraform jq curl; do command -v "$bin" >/dev/null || { echo "missing: $bin"; exit 1; }; done
aws sts get-caller-identity --query Arn --output text >/dev/null || { echo "AWS credentials not configured"; exit 1; }

say "terraform init ($ENV)"
terraform -chdir="$TF" init -input=false -backend-config=backend.hcl >/dev/null

# The ECR repository must exist before we can push to it.
FIRST_RUN=0
if ! aws ecr describe-repositories --repository-names "itam-$ENV-app" --region "$REGION" >/dev/null 2>&1; then
  say "first run: creating ECR repository and base infrastructure (service disabled until an image exists)"
  terraform -chdir="$TF" apply -input=false -auto-approve -var "image_tag=$TAG" -var "service_enabled=false"
  FIRST_RUN=1
fi
REPO="$(tfout ecr_repository_url)"

say "build + push $REPO:$TAG"
REGISTRY="${REPO%%/*}"
ECR_PASSWORD="$(aws ecr get-login-password --region "$REGION")"
if ! printf '%s' "$ECR_PASSWORD" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null 2>&1; then
  # Some Windows setups corrupt a piped password (HTTP 400). Passing it as an argument works there.
  docker login --username AWS --password "$ECR_PASSWORD" "$REGISTRY" >/dev/null
fi
echo "logged in to $REGISTRY"
if aws ecr describe-images --repository-name "itam-$ENV-app" --image-ids "imageTag=$TAG" --region "$REGION" >/dev/null 2>&1; then
  echo "image $TAG already in ECR (tags are immutable): reusing it"
else
  docker build --pull -t "$REPO:$TAG" "$ROOT/app"
  docker push "$REPO:$TAG"
fi

say "terraform apply (new task definitions -> $TAG)"
# On the very first run the service stays off until the database schema exists.
APPLY_ENABLED="$SERVICE_ENABLED"; [ "$FIRST_RUN" = "1" ] && APPLY_ENABLED=false
terraform -chdir="$TF" apply -input=false -auto-approve -var "image_tag=$TAG" -var "service_enabled=$APPLY_ENABLED"

CLUSTER="$(tfout cluster_name)"; SERVICE="$(tfout service_name)"; MIGRATE="$(tfout migrate_family)"; NET="$(tfout run_task_network)"

say "database migration"
TASK_ARN="$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --launch-type FARGATE \
  --task-definition "$MIGRATE" --network-configuration "$NET" --query 'tasks[0].taskArn' --output text)"
[ "$TASK_ARN" != "None" ] || { echo "could not start the migration task"; exit 1; }
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN"
CODE="$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)"
if [ "$CODE" != "0" ]; then
  echo "migration FAILED (exit $CODE). The running service was NOT changed."
  echo "logs: aws logs tail /itam/itam-$ENV/migrate --since 15m --region $REGION"
  exit 1
fi

if [ "$FIRST_RUN" = "1" ] && [ "$SERVICE_ENABLED" = "true" ]; then
  say "schema is ready: starting the service for the first time"
  terraform -chdir="$TF" apply -input=false -auto-approve -var "image_tag=$TAG" -var "service_enabled=true"
fi

if [ "$SERVICE_ENABLED" = "true" ]; then
  say "roll out"
  aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$SERVICE" \
    --task-definition "itam-$ENV-app" --force-new-deployment >/dev/null
  aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"

  say "smoke test"
  URL="$(tfout app_url)"
  for i in $(seq 1 12); do
    if curl -fsS "$URL/healthz?deep=1" | jq -e '.db == "ok"' >/dev/null; then echo "healthy: $URL"; exit 0; fi
    sleep 5
  done
  echo "smoke test failed: $URL/healthz?deep=1"; exit 1
fi
echo "service left disabled (SERVICE_ENABLED=false)"
