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
variable "alert_email" {
  description = "Receives alarm notifications and license/warranty expiry alerts. AWS emails a confirmation link first."
  type        = string
}

# Deliberately not KMS-encrypted: CloudWatch alarms cannot publish to a topic that uses the AWS-managed SNS key,
# and the messages hold only alarm names and expiry dates.
resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

output "topic_arn" { value = aws_sns_topic.alerts.arn }
