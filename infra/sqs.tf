resource "aws_sqs_queue" "receipts_dlq" {
    name = "${var.project_name}-receipts-dlq"
    message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "receipts" {
    name = "${var.project_name}-receipts"
    visibility_timeout_seconds = 120
    receive_wait_time_seconds = 20

    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.receipts_dlq.arn
        maxReceiveCount = 5
    })
}
