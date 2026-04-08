<?php

function create_user(PDO $db, string $email, string $password): int
{
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, UTC_TIMESTAMP())');
    $stmt->execute([$email, $hash]);
    return (int)$db->lastInsertId();
}

function find_user_by_email(PDO $db, string $email): ?array
{
    $stmt = $db->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function issue_auth_token(PDO $db, int $userId, int $ttlSeconds): string
{
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $stmt = $db->prepare(
        'INSERT INTO auth_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), UTC_TIMESTAMP())'
    );
    $stmt->execute([$userId, $tokenHash, $ttlSeconds]);
    return $token;
}

function find_user_by_token(PDO $db, string $token): ?array
{
    $tokenHash = hash('sha256', $token);
    $stmt = $db->prepare(
        'SELECT u.id, u.email
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.expires_at > UTC_TIMESTAMP()
         LIMIT 1'
    );
    $stmt->execute([$tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

