terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "name" { type = string }
variable "prod" {
  description = "Production posture: multi-AZ, deletion protection, final snapshot, customer-managed keys."
  type        = bool
  default     = false
}
variable "use_cmk" {
  description = "Encrypt RDS, S3 and secrets with a customer-managed KMS key (about $1/month)."
  type        = bool
  default     = false
}
variable "data_subnet_ids" { type = list(string) }
variable "db_sg_id" { type = string }
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
}
variable "db_multi_az" {
  type    = bool
  default = false
}
variable "db_backup_retention_days" {
  type    = number
  default = 1
}
variable "cors_origin" {
  description = "https://<cloudfront-domain>: the only origin allowed to POST uploads to the bucket."
  type        = string
}

data "aws_caller_identity" "current" {}

locals {
  kms_key_arn = var.use_cmk ? aws_kms_key.this[0].arn : null
}

# ---- KMS (optional customer-managed key) ----------------------------------------------------

resource "aws_kms_key" "this" {
  count                   = var.use_cmk ? 1 : 0
  description             = "${var.name} data key (RDS, S3, Secrets Manager)"
  enable_key_rotation     = true
  deletion_window_in_days = 14
}

resource "aws_kms_alias" "this" {
  count         = var.use_cmk ? 1 : 0
  name          = "alias/${var.name}-data"
  target_key_id = aws_kms_key.this[0].key_id
}

# ---- Database ----------------------------------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.data_subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name}-pg16-"
  family      = "postgres16"
  description = "ITAM PostgreSQL 16: TLS enforced"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-db"
  engine         = "postgres"
  engine_version = "16" # major only: AWS picks a currently supported minor, so this never goes stale
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.prod ? 100 : null
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = local.kms_key_arn

  db_name  = "itam"
  username = "itam_master"
  port     = 5432
  # RDS creates and owns the master password in Secrets Manager. It never appears in Terraform state or code.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = local.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_sg_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period    = var.db_backup_retention_days
  backup_window              = "20:00-21:00"
  maintenance_window         = "sun:21:30-sun:22:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  deletion_protection       = var.prod
  skip_final_snapshot       = !var.prod
  final_snapshot_identifier = var.prod ? "${var.name}-final" : null
  apply_immediately         = !var.prod

  lifecycle {
    ignore_changes = [engine_version]
  }
}

# The application connects as a restricted role (data access only, no schema changes).
# The migrate task creates the role using this password, so the password lives only here.
resource "random_password" "app_db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app_db" {
  name_prefix             = "${var.name}/app-db-"
  description             = "Restricted application database credentials"
  kms_key_id              = local.kms_key_arn
  recovery_window_in_days = var.prod ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "app_db" {
  secret_id     = aws_secretsmanager_secret.app_db.id
  secret_string = jsonencode({ username = "itam_app", password = random_password.app_db.result })
}

# ---- Attachments bucket ---------------------------------------------------------------------------

resource "aws_s3_bucket" "attachments" {
  bucket        = "${var.name}-attachments-${data.aws_caller_identity.current.account_id}"
  force_destroy = !var.prod
}

resource "aws_s3_bucket_ownership_controls" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket                  = aws_s3_bucket.attachments.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  rule {
    bucket_key_enabled = var.use_cmk
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.use_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = local.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  depends_on = [aws_s3_bucket_versioning.attachments]
}

# Browser uploads go straight to S3 with a presigned POST, so S3 must accept our origin.
resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  cors_rule {
    allowed_methods = ["GET", "HEAD", "POST"]
    allowed_origins = [var.cors_origin]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

data "aws_iam_policy_document" "attachments_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.attachments.arn, "${aws_s3_bucket.attachments.arn}/*"]
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

resource "aws_s3_bucket_policy" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  policy = data.aws_iam_policy_document.attachments_tls.json
}

output "db_host" { value = aws_db_instance.this.address }
output "db_port" { value = aws_db_instance.this.port }
output "db_name" { value = aws_db_instance.this.db_name }
output "db_identifier" { value = aws_db_instance.this.identifier }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
output "app_secret_arn" { value = aws_secretsmanager_secret.app_db.arn }
output "bucket_name" { value = aws_s3_bucket.attachments.bucket }
output "bucket_arn" { value = aws_s3_bucket.attachments.arn }
output "kms_key_arn" { value = local.kms_key_arn }
