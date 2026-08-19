data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "receipts" {
    bucket = "${var.project_name}-receipts-${data.aws_caller_identity.current.account_id}"
    force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "receipts" {
    bucket = aws_s3_bucket.receipts.id

    block_public_acls = true
    block_public_policy = true
    ignore_public_acls = true
    restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "receipts" {
    bucket = aws_s3_bucket.receipts.id

    rule {
        apply_server_side_encryption_by_default {
            sse_algorithm = "AES256"
        }
    }
}
