# Scheduled one-shot Fargate tasks (no servers, no cron host):
#   expiry-alerts  daily   -> emails licenses and warranties crossing 30 / 14 / 7 days
#   discover-aws   nightly -> syncs EC2 instances into the asset inventory (optional)

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
variable "cluster_arn" { type = string }
variable "job_family_arns" { type = map(string) }
variable "pass_role_arns" { type = list(string) }
variable "subnet_ids" { type = list(string) }
variable "app_sg_id" { type = string }
variable "assign_public_ip" { type = bool }
variable "enable_discovery" {
  type    = bool
  default = false
}
variable "expiry_cron" {
  type    = string
  default = "cron(30 3 * * ? *)" # 03:30 UTC = 09:00 IST
}
variable "discovery_cron" {
  type    = string
  default = "cron(0 2 * * ? *)"
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = [for arn in values(var.job_family_arns) : "${arn}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = var.pass_role_arns
    condition {
      test     = "StringLike"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "run-job-tasks"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

locals {
  schedules = merge(
    { "expiry-alerts" = var.expiry_cron },
    var.enable_discovery ? { "discover-aws" = var.discovery_cron } : {},
  )
}

resource "aws_scheduler_schedule" "job" {
  for_each                     = local.schedules
  name                         = "${var.name}-${each.key}"
  description                  = "ITAM ${each.key}"
  schedule_expression          = each.value
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    # The family ARN (no revision) means "latest ACTIVE revision", so a new deploy is picked up automatically.
    ecs_parameters {
      task_definition_arn = var.job_family_arns[each.key]
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = var.subnet_ids
        security_groups  = [var.app_sg_id]
        assign_public_ip = var.assign_public_ip
      }
    }

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

output "schedule_names" { value = [for s in aws_scheduler_schedule.job : s.name] }
