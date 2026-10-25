#!/usr/bin/env bash
# scripts/create-user.sh <demo|prod> <email> <viewer|technician|admin>
# Cognito emails the person a temporary password.
set -euo pipefail
ENV="${1:?env}"; EMAIL="${2:?email}"; ROLE="${3:?role}"
case "$ROLE" in viewer|technician|admin) ;; *) echo "role must be viewer, technician or admin"; exit 1;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v cygpath >/dev/null 2>&1 && ROOT="$(cygpath -m "$ROOT")"
POOL="$(terraform -chdir="$ROOT/infra/envs/$ENV" output -raw user_pool_id)"
aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true --desired-delivery-mediums EMAIL >/dev/null
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" --group-name "$ROLE"
echo "created $EMAIL as $ROLE"
