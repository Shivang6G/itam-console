terraform {
  required_version = ">= 1.10.0"

  # Partial configuration: bucket and region come from backend.hcl (see backend.hcl.example).
  backend "s3" {
    key          = "itam/demo/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }

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

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "itam", Environment = "demo", ManagedBy = "terraform" }
  }
}

# CloudFront-scoped WAF ACLs can only be created in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "itam", Environment = "demo", ManagedBy = "terraform" }
  }
}

module "stack" {
  source = "../../modules/stack"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment        = "demo"
  admin_email        = var.admin_email
  alert_email        = var.alert_email
  image_tag          = var.image_tag
  service_enabled    = var.service_enabled
  enable_discovery   = var.enable_discovery
  monthly_budget_usd = var.monthly_budget_usd
}
