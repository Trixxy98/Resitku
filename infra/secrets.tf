resource "random_password" "jwt" {
    length = 48
    special = false
}

resource "aws_secretsmanager_secret" "app" {
    name = "${var.project_name}/app"
    recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "app" {
    secret_id = aws_secretsmanager_secret.app.id
    secret_string = jsonencode({
        DATABASE_URL      = "postgresql://resitku:${random_password.db.result}@${aws_db_instance.main.address}:5432/resitku?schema=public&sslmode=no-verify"
        JWT_ACCESS_SECRET = random_password.jwt.result
    })
}
