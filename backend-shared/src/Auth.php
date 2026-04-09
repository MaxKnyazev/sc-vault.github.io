<?php

function create_user(PDO $db, string $nickname, string $password, string $role = 'blocked'): int
{
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare(
        'INSERT INTO users (email, nickname, password_hash, role, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())'
    );
    $stmt->execute([$nickname, $nickname, $hash, normalize_user_role($role)]);
    return (int)$db->lastInsertId();
}

function normalize_nickname(string $nickname): string
{
    return trim($nickname);
}

function normalize_user_role(string $role): string
{
    $normalized = strtolower(trim($role));
    if (!in_array($normalized, ['blocked', 'user', 'admin'], true)) {
        return 'user';
    }
    return $normalized;
}

function find_user_by_nickname(PDO $db, string $nickname): ?array
{
    $stmt = $db->prepare(
        'SELECT id, email, nickname, role, avatar_url, password_hash FROM users WHERE nickname = ? LIMIT 1'
    );
    $stmt->execute([normalize_nickname($nickname)]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_user_by_email(PDO $db, string $email): ?array
{
    $stmt = $db->prepare(
        'SELECT id, email, nickname, role, avatar_url, password_hash FROM users WHERE email = ? LIMIT 1'
    );
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
        'SELECT u.id, u.email, u.nickname, u.role, u.avatar_url
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.expires_at > UTC_TIMESTAMP()
         LIMIT 1'
    );
    $stmt->execute([$tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function delete_token(PDO $db, string $token): void
{
    $tokenHash = hash('sha256', $token);
    $stmt = $db->prepare('DELETE FROM auth_tokens WHERE token_hash = ?');
    $stmt->execute([$tokenHash]);
}

function cleanup_expired_tokens(PDO $db): int
{
    $stmt = $db->prepare('DELETE FROM auth_tokens WHERE expires_at <= UTC_TIMESTAMP()');
    $stmt->execute();
    return $stmt->rowCount();
}

function role_level(string $role): int
{
    return match (normalize_user_role($role)) {
        'admin' => 3,
        'user' => 2,
        default => 1,
    };
}

