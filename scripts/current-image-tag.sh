#!/usr/bin/env bash
# Prints the image tag the service is running now. Use it for infra-only changes so Terraform
# does not re-register task definitions with a different image:
#   terraform apply -var "image_tag=$(scripts/current-image-tag.sh prod)"
set -euo pipefail
ENV="${1:?usage: current-image-tag.sh <demo|prod>}"
REGION="${AWS_REGION:-ap-south-1}"
TD="$(aws ecs describe-services --region "$REGION" --cluster "itam-$ENV" --services "itam-$ENV-app" --query 'services[0].taskDefinition' --output text)"
aws ecs describe-task-definition --region "$REGION" --task-definition "$TD" --query 'taskDefinition.containerDefinitions[0].image' --output text | awk -F: '{print $NF}'
