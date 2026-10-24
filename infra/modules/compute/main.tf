terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

variable "name" { type = string }
variable "prod" {
  type    = bool
  default = false
}
variable "image_tag" {
  description = "Tag of the image in ECR to run. CI passes the git SHA."
  type        = string
}
variable "container_port" {
  type    = number
  default = 8080
}
variable "cpu" {
  type    = number
  default = 256
}
variable "memory" {
  type    = number
  default = 512
}
variable "desired_count" {
  type    = number
  default = 1
}
variable "service_enabled" {
  description = "false on the very first apply (before an image exists): the service is created with 0 tasks."
  type        = bool
  default     = true
}
variable "enable_autoscaling" {
  type    = bool
  default = false
}
variable "min_count" {
  type    = number
  default = 2
}
variable "max_count" {
  type    = number
  default = 4
}
variable "container_insights" {
  type    = bool
  default = false
}
variable "log_retention_days" {
  type    = number
  default = 14
}

variable "subnet_ids" { type = list(string) }
variable "assign_public_ip" { type = bool }
variable "app_sg_id" { type = string }
variable "target_group_arn" { type = string }
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffix" { type = string }

variable "db_host" { type = string }
variable "db_port" { type = number }
variable "db_name" { type = string }
variable "master_secret_arn" { type = string }
variable "app_secret_arn" { type = string }
variable "bucket_name" { type = string }
variable "bucket_arn" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}

variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id" { type = string }
variable "cognito_client_secret_arn" { type = string }
variable "cognito_domain" { type = string }
variable "base_url" { type = string }
variable "alert_topic_arn" { type = string }

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  region     = data.aws_region.current.name
  repo_url   = aws_ecr_repository.app.repository_url
  image      = "${local.repo_url}:${var.image_tag}"
  has_kms    = var.kms_key_arn != null
  secret_arn = [var.master_secret_arn, var.app_secret_arn, var.cognito_client_secret_arn]

  base_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = local.region },
    { name = "LOG_LEVEL", value = "info" },
    { name = "DB_HOST", value = var.db_host },
    { name = "DB_PORT", value = tostring(var.db_port) },
    { name = "DB_NAME", value = var.db_name },
    { name = "DB_SSL", value = "require" },
  ]

  app_env = concat(local.base_env, [
    { name = "PORT", value = tostring(var.container_port) },
    { name = "PUBLIC_BASE_URL", value = var.base_url },
    { name = "COGNITO_USER_POOL_ID", value = var.cognito_user_pool_id },
    { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id },
    { name = "COGNITO_DOMAIN", value = var.cognito_domain },
    { name = "S3_BUCKET", value = var.bucket_name },
    { name = "SERVICE_NAME", value = "itam-app" },
  ])

  app_db_secrets = [
    { name = "DB_USER", valueFrom = "${var.app_secret_arn}:username::" },
    { name = "DB_PASSWORD", valueFrom = "${var.app_secret_arn}:password::" },
  ]
}

# ---- Container registry -------------------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = "${var.name}-app"
  image_tag_mutability = "IMMUTABLE" # a tag always means the same bytes, so rollback is exact
  force_delete         = !var.prod

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 25 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 25 }
      action       = { type = "expire" }
    }]
  })
}

# ---- Cluster and logs ---------------------------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "task" {
  for_each          = toset(["app", "migrate", "expiry-alerts", "discover-aws"])
  name              = "/itam/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
}

# ---- IAM -----------------------------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

# Execution role: used by ECS itself to pull the image, write logs and inject secrets. Not the app's identity.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arn
  }
  dynamic "statement" {
    for_each = local.has_kms ? [1] : []
    content {
      actions   = ["kms:Decrypt"]
      resources = [var.kms_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# Task roles: the identity of the running code. One per job, each with only what that job needs.
resource "aws_iam_role" "task" {
  for_each           = toset(["app", "migrate", "expiry-alerts", "discover-aws"])
  name               = "${var.name}-task-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task_app" {
  statement {
    sid       = "AttachmentObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.bucket_arn}/assets/*"]
  }
  dynamic "statement" {
    for_each = local.has_kms ? [1] : []
    content {
      sid       = "BucketKey"
      actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
      resources = [var.kms_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "task_app" {
  name   = "attachments"
  role   = aws_iam_role.task["app"].id
  policy = data.aws_iam_policy_document.task_app.json
}

data "aws_iam_policy_document" "task_expiry" {
  statement {
    actions   = ["sns:Publish"]
    resources = [var.alert_topic_arn]
  }
}

resource "aws_iam_role_policy" "task_expiry" {
  name   = "publish-alerts"
  role   = aws_iam_role.task["expiry-alerts"].id
  policy = data.aws_iam_policy_document.task_expiry.json
}

data "aws_iam_policy_document" "task_discover" {
  statement {
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"] # Describe* APIs do not support resource-level permissions
  }
}

resource "aws_iam_role_policy" "task_discover" {
  name   = "describe-instances"
  role   = aws_iam_role.task["discover-aws"].id
  policy = data.aws_iam_policy_document.task_discover.json
}

# ---- Task definitions -------------------------------------------------------------------------------------------------------

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["app"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "app"
    image        = local.image
    essential    = true
    stopTimeout  = 30
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    environment  = local.app_env
    secrets = concat(local.app_db_secrets, [
      { name = "COGNITO_CLIENT_SECRET", valueFrom = var.cognito_client_secret_arn },
    ])
    healthCheck = {
      command     = ["CMD-SHELL", "curl -fsS http://localhost:${var.container_port}/healthz || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.task["app"].name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "app"
      }
    }
  }])
}

# Runs schema migrations as the master user, then creates/updates the restricted application role.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["migrate"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "migrate"
    image       = local.image
    essential   = true
    command     = ["node", ".output/worker/index.mjs", "migrate"]
    environment = concat(local.base_env, [{ name = "SERVICE_NAME", value = "itam-migrate" }])
    secrets = [
      { name = "DB_USER", valueFrom = "${var.master_secret_arn}:username::" },
      { name = "DB_PASSWORD", valueFrom = "${var.master_secret_arn}:password::" },
      { name = "APP_DB_USER", valueFrom = "${var.app_secret_arn}:username::" },
      { name = "APP_DB_PASSWORD", valueFrom = "${var.app_secret_arn}:password::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.task["migrate"].name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "job" {
  for_each                 = { "expiry-alerts" = "expiry-alerts", "discover-aws" = "discover-aws" }
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "job"
    image     = local.image
    essential = true
    command   = ["node", ".output/worker/index.mjs", each.value]
    environment = concat(local.base_env, [
      { name = "ALERT_TOPIC_ARN", value = var.alert_topic_arn },
      { name = "SERVICE_NAME", value = "itam-${each.key}" },
    ])
    secrets = local.app_db_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.task[each.key].name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = each.key
      }
    }
  }])
}

# ---- Service ---------------------------------------------------------------------------------------------------------------------

resource "aws_ecs_service" "app" {
  name            = "${var.name}-app"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.service_enabled ? var.desired_count : 0
  launch_type     = "FARGATE"

  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  propagate_tags                     = "SERVICE"
  enable_execute_command             = false

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.app_sg_id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # A bad release stops rolling out and the previous task set is restored automatically.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # CI rolls out new revisions (migrate first, then update-service). Terraform must not fight it.
  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_appautoscaling_target" "app" {
  count              = var.enable_autoscaling ? 1 : 0
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  min_capacity       = var.min_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  count              = var.enable_autoscaling ? 1 : 0
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app[0].service_namespace
  scalable_dimension = aws_appautoscaling_target.app[0].scalable_dimension
  resource_id        = aws_appautoscaling_target.app[0].resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "requests" {
  count              = var.enable_autoscaling ? 1 : 0
  name               = "${var.name}-requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app[0].service_namespace
  scalable_dimension = aws_appautoscaling_target.app[0].scalable_dimension
  resource_id        = aws_appautoscaling_target.app[0].resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = 300
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
  }
}

output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "ecr_repository_name" { value = aws_ecr_repository.app.name }
output "cluster_name" { value = aws_ecs_cluster.this.name }
output "cluster_arn" { value = aws_ecs_cluster.this.arn }
output "service_name" { value = aws_ecs_service.app.name }
output "app_family" { value = aws_ecs_task_definition.app.family }
output "migrate_family" { value = aws_ecs_task_definition.migrate.family }
output "job_family_arns" { value = { for k, t in aws_ecs_task_definition.job : k => t.arn_without_revision } }
output "role_arns_for_scheduler" {
  value = concat([aws_iam_role.execution.arn], [for r in aws_iam_role.task : r.arn])
}
output "log_group_names" { value = { for k, g in aws_cloudwatch_log_group.task : k => g.name } }
