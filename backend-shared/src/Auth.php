<?php

function create_user(PDO $db, string $nickname, string $password, string $role = 'blocked'): int
{
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare(
        'INSERT INTO users (email, nickname, password_hash, role, timezone_offset_hours, craft_branch_levels, created_at)
         VALUES (?, ?, ?, ?, 0, ?, UTC_TIMESTAMP())'
    );
    $stmt->execute([$nickname, $nickname, $hash, normalize_user_role($role), default_craft_branch_levels_json()]);
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
        'SELECT id, email, nickname, role, avatar_url, password_hash, timezone_offset_hours, craft_branch_levels
         FROM users
         WHERE nickname = ? LIMIT 1'
    );
    $stmt->execute([normalize_nickname($nickname)]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_user_by_email(PDO $db, string $email): ?array
{
    $stmt = $db->prepare(
        'SELECT id, email, nickname, role, avatar_url, password_hash, timezone_offset_hours, craft_branch_levels
         FROM users
         WHERE email = ? LIMIT 1'
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
        'SELECT u.id, u.email, u.nickname, u.role, u.avatar_url, u.timezone_offset_hours, u.craft_branch_levels
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.expires_at > UTC_TIMESTAMP()
         LIMIT 1'
    );
    $stmt->execute([$tokenHash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function normalize_timezone_offset_hours(mixed $value): int
{
    $hours = (int)$value;
    if ($hours < -12 || $hours > 14) {
        throw new InvalidArgumentException('timezoneOffsetHours out of range');
    }
    return $hours;
}

function default_craft_branch_levels(): array
{
    return [
        'ammo' => 1,
        'pyrotechnics' => 1,
        'protectiveGear' => 1,
        'engineering' => 1,
        'cooking' => 1,
        'moonshining' => 1,
        'medicine' => 1,
        'rawMaterials' => 1,
    ];
}

function default_craft_branch_levels_json(): string
{
    return json_encode(default_craft_branch_levels(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function normalize_craft_branch_levels(mixed $value): array
{
    $base = default_craft_branch_levels();
    $legacyMap = [
        'weaponModules' => 'engineering',
        'armor' => 'protectiveGear',
        'other' => 'engineering',
    ];
    if (!is_array($value)) {
        return $base;
    }
    foreach ($legacyMap as $legacyKey => $newKey) {
        if (!array_key_exists($newKey, $value) && array_key_exists($legacyKey, $value)) {
            $value[$newKey] = $value[$legacyKey];
        }
    }
    $out = $base;
    foreach ($base as $key => $defaultLevel) {
        $raw = $value[$key] ?? $defaultLevel;
        $lvl = (int)$raw;
        if ($lvl < 1) $lvl = 1;
        if ($lvl > 5) $lvl = 5;
        $out[$key] = $lvl;
    }
    return $out;
}

function decode_craft_branch_levels(mixed $value): array
{
    if (is_string($value) && trim($value) !== '') {
        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            return normalize_craft_branch_levels($decoded);
        }
    }
    if (is_array($value)) {
        return normalize_craft_branch_levels($value);
    }
    return default_craft_branch_levels();
}

function format_auth_user_payload(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'nickname' => (string)$user['nickname'],
        'role' => normalize_user_role((string)$user['role']),
        'avatarUrl' => $user['avatar_url'] ?: null,
        'timezoneOffsetHours' => isset($user['timezone_offset_hours']) ? (int)$user['timezone_offset_hours'] : 0,
        'craftBranchLevels' => decode_craft_branch_levels($user['craft_branch_levels'] ?? null),
    ];
}

function update_own_user_preferences(
    PDO $db,
    int $userId,
    int $timezoneOffsetHours,
    array $craftBranchLevels
): void {
    $normalizedTz = normalize_timezone_offset_hours($timezoneOffsetHours);
    $normalizedLevels = normalize_craft_branch_levels($craftBranchLevels);
    $stmt = $db->prepare(
        'UPDATE users
         SET timezone_offset_hours = ?, craft_branch_levels = ?
         WHERE id = ?'
    );
    $stmt->execute([
        $normalizedTz,
        json_encode($normalizedLevels, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $userId,
    ]);
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

function list_users(PDO $db): array
{
    $stmt = $db->query(
        'SELECT id, nickname, role, avatar_url, created_at
         FROM users
         ORDER BY created_at DESC, id DESC'
    );
    return $stmt->fetchAll() ?: [];
}

function update_user_profile(PDO $db, int $userId, string $nickname, string $role): void
{
    $normalizedNickname = normalize_nickname($nickname);
    if (!preg_match('/^[a-zA-Z0-9_]{6,16}$/', $normalizedNickname)) {
        throw new InvalidArgumentException('Invalid nickname');
    }
    $normalizedRole = normalize_user_role($role);

    $stmt = $db->prepare('UPDATE users SET nickname = ?, role = ? WHERE id = ?');
    $stmt->execute([$normalizedNickname, $normalizedRole, $userId]);
}

function delete_user_by_id(PDO $db, int $userId): void
{
    $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$userId]);
}

