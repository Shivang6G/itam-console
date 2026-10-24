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
variable "cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "az_count" {
  type    = number
  default = 2
}
variable "nat_gateway_count" {
  description = "0 = no NAT (demo: tasks run in public subnets). 1 = shared NAT. az_count = one per AZ."
  type        = number
  default     = 0
  validation {
    condition     = var.nat_gateway_count >= 0 && var.nat_gateway_count <= 3
    error_message = "nat_gateway_count must be between 0 and 3."
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs        = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  use_nat    = var.nat_gateway_count > 0
  public_c   = [for i in range(var.az_count) : cidrsubnet(var.cidr, 8, i)]
  app_c      = [for i in range(var.az_count) : cidrsubnet(var.cidr, 8, 10 + i)]
  data_c     = [for i in range(var.az_count) : cidrsubnet(var.cidr, 8, 20 + i)]
  nat_actual = min(var.nat_gateway_count, var.az_count)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-igw" }
}

# ---- Subnets: public (ALB, NAT) / private-app (tasks) / private-data (database) ---------

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = local.public_c[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.name}-public-${local.azs[count.index]}", Tier = "public" }
}

resource "aws_subnet" "app" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.app_c[count.index]
  tags              = { Name = "${var.name}-app-${local.azs[count.index]}", Tier = "private-app" }
}

resource "aws_subnet" "data" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.data_c[count.index]
  tags              = { Name = "${var.name}-data-${local.azs[count.index]}", Tier = "private-data" }
}

# ---- Routing ---------------------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count  = local.nat_actual
  domain = "vpc"
  tags   = { Name = "${var.name}-nat-${count.index}" }
}

resource "aws_nat_gateway" "this" {
  count         = local.nat_actual
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "${var.name}-nat-${count.index}" }
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "app" {
  count  = var.az_count
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-app-${local.azs[count.index]}" }
}

resource "aws_route" "app_nat" {
  count                  = local.use_nat ? var.az_count : 0
  route_table_id         = aws_route_table.app[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[count.index % local.nat_actual].id
}

resource "aws_route_table_association" "app" {
  count          = var.az_count
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app[count.index].id
}

# Data subnets have NO route to the internet, ever.
resource "aws_route_table" "data" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-data" }
}

resource "aws_route_table_association" "data" {
  count          = var.az_count
  subnet_id      = aws_subnet.data[count.index].id
  route_table_id = aws_route_table.data.id
}

# Free gateway endpoint: S3 traffic (attachments) stays on the AWS network and off the NAT.
data "aws_region" "current" {}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(aws_route_table.app[*].id, [aws_route_table.public.id])
  tags              = { Name = "${var.name}-s3" }
}

# ---- Security groups owned here so no module has to reference another's -----------------------

resource "aws_security_group" "app" {
  name_prefix = "${var.name}-app-"
  description = "ECS tasks"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-app" }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "Tasks may reach the internet (Cognito, AWS APIs) and the database"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "db" {
  name_prefix = "${var.name}-db-"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-db" }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "PostgreSQL from ECS tasks only"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "data_subnet_ids" { value = aws_subnet.data[*].id }
output "app_subnet_ids" {
  description = "Where tasks run: private-app when NAT exists, otherwise public subnets."
  value       = local.use_nat ? aws_subnet.app[*].id : aws_subnet.public[*].id
}
output "assign_public_ip" {
  description = "Tasks need a public IP only when there is no NAT."
  value       = !local.use_nat
}
output "app_sg_id" { value = aws_security_group.app.id }
output "db_sg_id" { value = aws_security_group.db.id }
output "nat_public_ips" { value = aws_eip.nat[*].public_ip }
