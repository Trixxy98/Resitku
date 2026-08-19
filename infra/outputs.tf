output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "receipts_bucket" {
  value = aws_s3_bucket.receipts.bucket
}

output "receipts_queue_url" {
  value = aws_sqs_queue.receipts.id
}
