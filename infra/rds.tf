resource "random_password" "db" {
    length = 32
    special = false
}

resource "aws_db_subnet_group" "main" {
    name = "${var.project_name}-db"
    subnet_ids = aws_subnet.public[*].id
}

resource "aws_security_group" "db" {
    name = "${var.project_name}-db"
    vpc_id = aws_vpc.main.id

    ingress {
        from_port = 5432
        to_port = 5432
        protocol = "tcp"
        security_groups = [aws_security_group.ecs.id]
    }

    egress {
        from_port = 0
        to_port = 0
        protocol = "-1"
        cidr_blocks = ["0.0.0.0/0"]
    }
}

resource "aws_db_instance" "main" {
    identifier = var.project_name
    engine = "postgres"
    engine_version = "17"
    instance_class = "db.t4g.micro"
    allocated_storage = 20
    db_name = "resitku"
    username = "resitku"
    password = random_password.db.result
    db_subnet_group_name = aws_db_subnet_group.main.name
    vpc_security_group_ids = [aws_security_group.db.id]
    publicly_accessible = false
    storage_encrypted = true
    backup_retention_period = 1
    deletion_protection = false
    skip_final_snapshot = var.db_skip_final_snapshot
    auto_minor_version_upgrade = true
}
