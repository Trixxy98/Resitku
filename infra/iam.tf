 data "aws_iam_policy_document" "ecs_assume" {
    statement {
        actions = ["sts:AssumeRole"]

        principals {
            type = "Service"
            identifiers = ["ecs-tasks.amazonaws.com"]
        }
    }
 }

 resource "aws_iam_role" "execution" {
    name = "${var.project_name}-ecs-execution"
    assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
 }

 resource "aws_iam_role_policy_attachment" "execution" {
    role = aws_iam_role.execution.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
 }

 resource "aws_iam_role_policy" "execution_secrets" {
    name = "secrets"
    role = aws_iam_role.execution.id

    policy =jsonencode({
        Version = "2012-10-17"
        Statement = [{
            Effect = "Allow"
            Action = ["secretsmanager:GetSecretValue"]
            Resource = aws_secretsmanager_secret.app.arn
        }]
    })
 }

 resource "aws_iam_role" "task" {
    name = "${var.project_name}-ecs-task"
    assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
 }

 resource "aws_iam_role_policy" "task" {
    name = "app"
    role = aws_iam_role.task.id

    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Effect = "Allow"
                Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
                Resource = "${aws_s3_bucket.receipts.arn}/*"
            },
            {
                Effect = "Allow"
                Action = ["s3:ListBucket"]
                Resource = aws_s3_bucket.receipts.arn
            },
            {
                Effect = "Allow"
                Action = [
                    "sqs:SendMessage",
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:ChangeMessageVisibility"
                ]
                Resource = aws_sqs_queue.receipts.arn
            },
            {
                Effect = "Allow"
                Action = ["textract:AnalyzeExpense"]
                Resource = "*"
            }
        ]
    })
 }
