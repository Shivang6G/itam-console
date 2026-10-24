# The public front door:  Browser --HTTPS--> CloudFront --HTTP--> ALB --> ECS tasks
#
# CloudFront gives us a free HTTPS endpoint with no domain or certificate to manage.
# The ALB only accepts traffic that (a) comes from CloudFront's address range and
# (b) carries a secret header only CloudFront knows. Anything else gets a 403.

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

variable "name" { type = string }
variable "prod" {
  type    = bool
  default = false
}
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "app_sg_id" { type = string }
variable "container_port" {
  type    = number
  default = 8080
}
variable "enable_waf" {
  description = "Attach AWS WAF (managed rules + rate limit) to CloudFront. About $5/month plus per-request charges."
  type        = bool
  default     = false
}
variable "waf_rate_limit" {
  description = "Max requests per 5 minutes from one IP before it is blocked."
  type        = number
  default     = 1000
}

# ---- ALB ------------------------------------------------------------------------------------------------

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  description = "ALB: reachable from CloudFront only"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-alb" }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from CloudFront origin-facing addresses"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "ALB to ECS tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = var.app_sg_id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = var.app_sg_id
  description                  = "App port from the ALB only"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_lb" "this" {
  name                       = "${var.name}-alb"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = var.prod
  idle_timeout               = 60
}

resource "aws_lb_target_group" "app" {
  name                 = "${var.name}-app"
  port                 = var.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }
}

# ---- WAF (us-east-1 is mandatory for CloudFront-scoped ACLs) ----------------------------------------------

resource "aws_wafv2_web_acl" "this" {
  count       = var.enable_waf ? 1 : 0
  provider    = aws.us_east_1
  name        = "${var.name}-cloudfront"
  description = "ITAM: managed rule groups plus per-IP rate limit"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = {
      "AWSManagedRulesCommonRuleSet"          = 10
      "AWSManagedRulesKnownBadInputsRuleSet"  = 20
      "AWSManagedRulesAmazonIpReputationList" = 30
    }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          name        = rule.key
          vendor_name = "AWS"
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 40
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-waf"
    sampled_requests_enabled   = true
  }
}

# ---- CloudFront ---------------------------------------------------------------------------------------------

locals {
  # AWS-managed policy ids (stable, documented by AWS)
  caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  all_viewer        = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  origin_id         = "alb"
  all_methods       = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_200"
  comment         = "${var.name} ITAM Console"
  web_acl_id      = var.enable_waf ? aws_wafv2_web_acl.this[0].arn : null

  origin {
    origin_id   = local.origin_id
    domain_name = aws_lb.this.dns_name

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 30
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # Everything dynamic: never cached, all cookies/headers/query strings reach the app.
  default_cache_behavior {
    target_origin_id         = local.origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.all_methods
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.caching_disabled
    origin_request_policy_id = local.all_viewer
    compress                 = true
  }

  # Built JS/CSS are content-hashed, so they can be cached for a long time.
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.caching_optimized
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "alb_arn" { value = aws_lb.this.arn }
output "alb_arn_suffix" { value = aws_lb.this.arn_suffix }
output "alb_dns_name" { value = aws_lb.this.dns_name }
output "target_group_arn" {
  # Depends on the listener rule so the ECS service is never created before the target group is attached to a load balancer.
  value      = aws_lb_target_group.app.arn
  depends_on = [aws_lb_listener_rule.from_cloudfront]
}
output "target_group_arn_suffix" { value = aws_lb_target_group.app.arn_suffix }
output "alb_sg_id" { value = aws_security_group.alb.id }
output "cloudfront_id" { value = aws_cloudfront_distribution.this.id }
output "cloudfront_domain" { value = aws_cloudfront_distribution.this.domain_name }
output "base_url" { value = "https://${aws_cloudfront_distribution.this.domain_name}" }
