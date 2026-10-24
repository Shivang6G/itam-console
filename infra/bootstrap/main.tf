# One-time, per AWS account. Creates what everything else needs before it can exist:
#   - the S3 bucket that holds Terraform state (versioned, encrypted, private)
#   - GitHub OIDC trust, so CI deploys with short-lived credentials and no stored AWS keys
# Applied with LOCAL state on purpose (it creates the bucket the other stacks use). Commit nothing from here.

terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "itam", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "github_repo" {
  description = "owner/name of the GitHub repository allowed to deploy, e.g. shivang/itam-console"
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique bucket name for Terraform state. Leave empty to use itam-tfstate-<account-id>."
  type        = string
  default     = ""
}

data "aws_caller_identity" "current" {}

locals {
  bucket = var.state_bucket_name != "" ? var.state_bucket_name : "itam-tfstate-${data.aws_caller_identity.current.account_id}"
}

# ---- Terraform state -------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.bucket
  # State is the only record of what exists. Never let `terraform destroy` here delete it.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "state_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls_only.json
}

# ---- GitHub OIDC ---------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# Pull requests: read-only, may take the state lock to run `terraform plan`.
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request", "repo:${var.github_repo}:ref:refs/heads/*"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "itam-github-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_state" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "state-access"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_state.json
}

# Deploys: only from the main branch, and only through a protected GitHub Environment.
data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:demo", "repo:${var.github_repo}:environment:prod"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "itam-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

# Terraform creates IAM roles, KMS keys, VPCs... so this role is broad by necessity.
# The blast radius is limited by WHO can assume it (trust policy above), not by what it can do.
# See docs/SECURITY.md for the least-privilege follow-up.
resource "aws_iam_role_policy_attachment" "deploy_admin" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "github_plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "github_deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
