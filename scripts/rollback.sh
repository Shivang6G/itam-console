#!/usr/bin/env bash
# Roll the service back to the previous task-definition revision: scripts/rollback.sh <demo|prod>
# Safe because image tags are immutable and database migrations are backwards compatible (expand, then contract).
set -euo pipefail
ENV="${1:?usage: rollback.sh <demo|prod>}"
REGION="${AWS_REGION:-ap-south-1}"
CUR="$(aws ecs describe-services --region "$REGION" --cluster "itam-$ENV" --services "itam-$ENV-app" --query 'services[0].taskDefinition' --output text)"
REV="${CUR##*:}"; FAM="${CUR%:*}"
[ "$REV" -gt 1 ] || { echo "no earlier revision"; exit 1; }
PREV="$FAM:$((REV-1))"
echo "rolling back $CUR -> $PREV"
aws ecs update-service --region "$REGION" --cluster "itam-$ENV" --service "itam-$ENV-app" --task-definition "$PREV" >/dev/null
aws ecs wait services-stable --region "$REGION" --cluster "itam-$ENV" --services "itam-$ENV-app"
echo "done"
