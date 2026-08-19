variable "project_name" {
    type = string
    default = "resitku"
}

variable "aws_region" {
    type = string
    default = "us-east-1"
}

variable "cors_origin" {
    type = string
    default = ""
    description = "Origin frontend (cth. https://dxxxx.cloudfront.net). Kosong = CORS ditutup."
}

variable "image_tag" {
    type = string
    default = "latest"
}

variable "enable_ecs_services" {
    type = bool
    default = false
    description = "true hanya selepas imej sudah di-push ke ECR."
}

variable "db_skip_final_snapshot" {
  type        = bool
  default     = true
  description = "true untuk teardown kredit. Tukar false jika data perlu dikekalkan."
}
