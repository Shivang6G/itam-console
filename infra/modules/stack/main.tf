# The whole ITAM platform in one module. The demo and prod environments are THIS module with different inputs.
# Everything that differs between them is decided in `locals.mode` below, so the difference is readable in one place.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.80"
      configuration_aliases = [aws.us_east_1]
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "environment" {
  description = "demo or prod"
  type        = string
  validation {
    condition     = contains(["demo", "prod"], var.environment)
    error_message = "environment must be demo or prod."
  }
}
variable "admin_email" {
  description = "First administrator account (Cognito emails a temporary password)."
  type        = string
}
variable "alert_email" {
  description = "Receives alarms and expiry alerts. Must be confirmed by clicking AWS's email."
  type        = string
}
variable "image_tag" {
  description = "ECR image tag to run (CI passes the git SHA)."
  type        = string
}
variable "service_enabled" {
  description = "Set false on the first apply, before any image has been pushed."
  type        = bool
  default     = true
}
variable "container_port" {
  type    = number
  default = 8080
}
variable "enable_discovery" {
  description = "Nightly sync of EC2 instances into the asset inventory."
  type        = bool
  default     = false
}
variable "nat_per_az" {
  description = "Prod only: one NAT gateway per AZ instead of one shared (more resilient, about $32/month more)."
  type        = bool
  default     = false
}
variable "monthly_budget_usd" {
  type    = number
  default = 0 # 0 = use the environment default
}

locals {
  prod = var.environment == "prod"
  name = "itam-${var.environment}"

  mode = {
    az_count           = 2
    nat_gateway_count  = local.prod ? (var.nat_per_az ? 2 : 1) : 0
    desired_count      = local.prod ? 2 : 1
    min_count          = local.prod ? 2 : 1
    max_count          = local.prod ? 4 : 1
    autoscaling        = local.prod
    cpu                = local.prod ? 512 : 256
    memory             = local.prod ? 1024 : 512
    db_multi_az        = local.prod
    db_retention_days  = local.prod ? 7 : 1
    db_instance_class  = "db.t4g.micro"
    waf                = local.prod
    cmk                = local.prod
    log_retention_days = local.prod ? 90 : 14
    mfa                = local.prod ? "ON" : "OPTIONAL"
    container_insights = local.prod
    budget_usd         = var.monthly_budget_usd > 0 ? var.monthly_budget_usd : (local.prod ? 150 : 60)
  }
}

module "network" {
  source            = "../network"
  name              = local.name
  az_count          = local.mode.az_count
  nat_gateway_count = local.mode.nat_gateway_count
}

module "alerts" {
  source      = "../alerts"
  name        = local.name
  alert_email = var.alert_email
}

module "edge" {
  source = "../edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  name              = local.name
  prod              = local.prod
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  app_sg_id         = module.network.app_sg_id
  container_port    = var.container_port
  enable_waf        = local.mode.waf
}

module "data" {
  source                   = "../data"
  name                     = local.name
  prod                     = local.prod
  use_cmk                  = local.mode.cmk
  data_subnet_ids          = module.network.data_subnet_ids
  db_sg_id                 = module.network.db_sg_id
  db_instance_class        = local.mode.db_instance_class
  db_multi_az              = local.mode.db_multi_az
  db_backup_retention_days = local.mode.db_retention_days
  cors_origin              = module.edge.base_url
}

module "auth" {
  source      = "../auth"
  name        = local.name
  prod        = local.prod
  base_url    = module.edge.base_url
  admin_email = var.admin_email
  mfa         = local.mode.mfa
  kms_key_arn = module.data.kms_key_arn
}

module "compute" {
  source          = "../compute"
  name            = local.name
  prod            = local.prod
  image_tag       = var.image_tag
  container_port  = var.container_port
  cpu             = local.mode.cpu
  memory          = local.mode.memory
  desired_count   = local.mode.desired_count
  service_enabled = var.service_enabled

  enable_autoscaling = local.mode.autoscaling
  min_count          = local.mode.min_count
  max_count          = local.mode.max_count
  container_insights = local.mode.container_insights
  log_retention_days = local.mode.log_retention_days

  subnet_ids              = module.network.app_subnet_ids
  assign_public_ip        = module.network.assign_public_ip
  app_sg_id               = module.network.app_sg_id
  target_group_arn        = module.edge.target_group_arn
  alb_arn_suffix          = module.edge.alb_arn_suffix
  target_group_arn_suffix = module.edge.target_group_arn_suffix

  db_host           = module.data.db_host
  db_port           = module.data.db_port
  db_name           = module.data.db_name
  master_secret_arn = module.data.master_secret_arn
  app_secret_arn    = module.data.app_secret_arn
  bucket_name       = module.data.bucket_name
  bucket_arn        = module.data.bucket_arn
  kms_key_arn       = module.data.kms_key_arn

  cognito_user_pool_id      = module.auth.user_pool_id
  cognito_client_id         = module.auth.client_id
  cognito_client_secret_arn = module.auth.client_secret_arn
  cognito_domain            = module.auth.domain
  base_url                  = module.edge.base_url
  alert_topic_arn           = module.alerts.topic_arn
}

module "jobs" {
  source           = "../jobs"
  name             = local.name
  cluster_arn      = module.compute.cluster_arn
  job_family_arns  = module.compute.job_family_arns
  pass_role_arns   = module.compute.role_arns_for_scheduler
  subnet_ids       = module.network.app_subnet_ids
  app_sg_id        = module.network.app_sg_id
  assign_public_ip = module.network.assign_public_ip
  enable_discovery = var.enable_discovery
}

module "observability" {
  source                  = "../observability"
  name                    = local.name
  alert_topic_arn         = module.alerts.topic_arn
  cluster_name            = module.compute.cluster_name
  service_name            = module.compute.service_name
  alb_arn_suffix          = module.edge.alb_arn_suffix
  target_group_arn_suffix = module.edge.target_group_arn_suffix
  db_identifier           = module.data.db_identifier
  app_log_group           = module.compute.log_group_names["app"]
  monthly_budget_usd      = local.mode.budget_usd
  budget_email            = var.alert_email
}

# ---- Outputs: everything scripts/deploy.sh and a human need --------------------------------------------------------

output "app_url" { value = module.edge.base_url }
output "ecr_repository_url" { value = module.compute.ecr_repository_url }
output "ecr_repository_name" { value = module.compute.ecr_repository_name }
output "cluster_name" { value = module.compute.cluster_name }
output "service_name" { value = module.compute.service_name }
output "migrate_family" { value = module.compute.migrate_family }
output "desired_count" { value = local.mode.desired_count }
output "run_task_network" {
  description = "Value for `aws ecs run-task --network-configuration`."
  value       = "awsvpcConfiguration={subnets=[${join(",", module.network.app_subnet_ids)}],securityGroups=[${module.network.app_sg_id}],assignPublicIp=${module.network.assign_public_ip ? "ENABLED" : "DISABLED"}}"
}
output "user_pool_id" { value = module.auth.user_pool_id }
output "cognito_domain" { value = module.auth.domain }
output "bucket_name" { value = module.data.bucket_name }
output "db_identifier" { value = module.data.db_identifier }
output "alert_topic_arn" { value = module.alerts.topic_arn }
output "dashboard_name" { value = module.observability.dashboard_name }
output "log_group_app" { value = module.compute.log_group_names["app"] }
output "nat_public_ips" { value = module.network.nat_public_ips }
