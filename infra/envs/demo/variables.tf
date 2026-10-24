variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "admin_email" {
  description = "First administrator. Cognito emails them a temporary password."
  type        = string
}

variable "alert_email" {
  description = "Receives alarms, expiry alerts and budget warnings."
  type        = string
}

variable "image_tag" {
  description = "ECR image tag to run. scripts/deploy.sh and CI set this to the git SHA."
  type        = string
  default     = "bootstrap"
}

variable "service_enabled" {
  description = "false on the first apply (no image exists yet), then true."
  type        = bool
  default     = true
}

variable "enable_discovery" {
  type    = bool
  default = false
}

variable "monthly_budget_usd" {
  description = "0 = environment default (demo 60, prod 150)."
  type        = number
  default     = 0
}
