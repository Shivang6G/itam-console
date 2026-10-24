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
variable "base_url" {
  description = "https://<cloudfront-domain>"
  type        = string
}
variable "admin_email" {
  description = "First administrator. Cognito emails them a temporary password."
  type        = string
}
variable "mfa" {
  description = "OFF, OPTIONAL or ON. Demo: OPTIONAL. Prod: ON."
  type        = string
  default     = "OPTIONAL"
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa)
    error_message = "mfa must be OFF, OPTIONAL or ON."
  }
}
variable "kms_key_arn" {
  type    = string
  default = null
}

data "aws_caller_identity" "current" {}

resource "aws_cognito_user_pool" "this" {
  name                     = "${var.name}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = var.mfa
  deletion_protection      = var.prod ? "ACTIVE" : "INACTIVE"

  # Administrators create accounts. There is no public self-service sign-up.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # Authenticator-app MFA (TOTP). Cognito rejects this block when MFA is OFF.
  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa == "OFF" ? [] : [1]
    content {
      enabled = true
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# Cognito groups ARE the roles. The id token carries them in the cognito:groups claim.
resource "aws_cognito_user_group" "role" {
  for_each     = toset(["viewer", "technician", "admin"])
  name         = each.key
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "ITAM ${each.key} role"
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = ["${var.base_url}/auth/callback"]
  logout_urls                          = ["${var.base_url}/signin"]

  # The hosted UI handles passwords itself; the app never sees them.
  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

resource "aws_secretsmanager_secret" "client" {
  name_prefix             = "${var.name}/cognito-client-"
  description             = "Cognito app client secret (server side only)"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.prod ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "client" {
  secret_id     = aws_secretsmanager_secret.client.id
  secret_string = aws_cognito_user_pool_client.web.client_secret
}

resource "aws_cognito_user" "admin" {
  user_pool_id             = aws_cognito_user_pool.this.id
  username                 = var.admin_email
  desired_delivery_mediums = ["EMAIL"]
  attributes = {
    email          = var.admin_email
    email_verified = "true"
  }
}

resource "aws_cognito_user_in_group" "admin" {
  user_pool_id = aws_cognito_user_pool.this.id
  group_name   = aws_cognito_user_group.role["admin"].name
  username     = aws_cognito_user.admin.username
}

output "user_pool_id" { value = aws_cognito_user_pool.this.id }
output "user_pool_arn" { value = aws_cognito_user_pool.this.arn }
output "client_id" { value = aws_cognito_user_pool_client.web.id }
output "client_secret_arn" { value = aws_secretsmanager_secret.client.arn }
output "domain" {
  value = "${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

data "aws_region" "current" {}
