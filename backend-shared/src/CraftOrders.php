<?php

declare(strict_types=1);

function mysql_utc_datetime_to_ms(?string $s): ?int
{
    if ($s === null || $s === '') {
        return null;
    }
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $s, new DateTimeZone('UTC'));
    if ($dt === false) {
        return null;
    }
    return (int)($dt->format('U')) * 1000;
}

/**
 * @return array<int, array<string, mixed>>
 */
function list_user_craft_orders_with_lines(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT id, display_number, title, deadline_hours, deadline_set_at, created_at, updated_at
         FROM user_craft_orders
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC',
    );
    $stmt->execute([$userId]);
    $orders = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $oid = (int)($row['id'] ?? 0);
        $lstmt = $db->prepare(
            'SELECT id, recipe_favorite_id, quantity, done, done_at, sort_index, created_at
             FROM user_craft_order_lines
             WHERE order_id = ?
             ORDER BY sort_index ASC, id ASC',
        );
        $lstmt->execute([$oid]);
        $lines = [];
        while ($lr = $lstmt->fetch(PDO::FETCH_ASSOC)) {
            $lines[] = [
                'id' => (string)(int)($lr['id'] ?? 0),
                'recipeFavoriteId' => (string)($lr['recipe_favorite_id'] ?? ''),
                'quantity' => (int)($lr['quantity'] ?? 1),
                'done' => ((int)($lr['done'] ?? 0)) === 1,
                'doneAt' => mysql_utc_datetime_to_ms($lr['done_at'] ?? null),
                'createdOrder' => (int)($lr['sort_index'] ?? 0),
            ];
        }
        $dh = $row['deadline_hours'];
        $orders[] = [
            'id' => (string)$oid,
            'displayNumber' => (int)($row['display_number'] ?? 0),
            'title' => (string)($row['title'] ?? ''),
            'createdAt' => mysql_utc_datetime_to_ms($row['created_at'] ?? null) ?? 0,
            'deadlineHours' => $dh === null ? null : (int)$dh,
            'deadlineSetAt' => mysql_utc_datetime_to_ms($row['deadline_set_at'] ?? null),
            'lines' => $lines,
            'ingredientDone' => [],
        ];
    }
    if (count($orders) > 0) {
        try {
            $orderIds = array_map(static fn ($o) => (int)$o['id'], $orders);
            $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
            $istmt = $db->prepare(
                "SELECT order_id, item_id, done, done_at
                 FROM user_craft_order_ingredient_done
                 WHERE order_id IN ($placeholders)"
            );
            $istmt->execute($orderIds);
            $byOrder = [];
            while ($ir = $istmt->fetch(PDO::FETCH_ASSOC)) {
                $oid = (int)($ir['order_id'] ?? 0);
                if (!isset($byOrder[$oid])) {
                    $byOrder[$oid] = [];
                }
                $byOrder[$oid][] = [
                    'itemId' => (string)($ir['item_id'] ?? ''),
                    'done' => ((int)($ir['done'] ?? 0)) === 1,
                    'doneAt' => mysql_utc_datetime_to_ms($ir['done_at'] ?? null),
                ];
            }
            foreach ($orders as &$o) {
                $oid = (int)$o['id'];
                $o['ingredientDone'] = $byOrder[$oid] ?? [];
            }
            unset($o);
        } catch (Throwable $e) {
            foreach ($orders as &$o) {
                $o['ingredientDone'] = [];
            }
            unset($o);
        }
    }

    return $orders;
}

/**
 * @return array<string, mixed>
 */
function create_user_craft_order(PDO $db, int $userId): array
{
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT COALESCE(MAX(display_number), 0) + 1 AS n FROM user_craft_orders WHERE user_id = ? FOR UPDATE');
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $displayNumber = (int)($row['n'] ?? 1);
        $title = 'Заказ №' . $displayNumber;
        $ins = $db->prepare(
            'INSERT INTO user_craft_orders (user_id, display_number, title, deadline_hours, deadline_set_at, created_at, updated_at)
             VALUES (?, ?, ?, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        );
        $ins->execute([$userId, $displayNumber, $title]);
        $id = (int)$db->lastInsertId();
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }

    return [
        'id' => (string)$id,
        'displayNumber' => $displayNumber,
        'title' => $title,
        'createdAt' => (int)floor(microtime(true) * 1000),
        'deadlineHours' => null,
        'deadlineSetAt' => null,
        'lines' => [],
        'ingredientDone' => [],
    ];
}

function update_user_craft_order_title(PDO $db, int $userId, int $orderId, string $title): void
{
    $t = trim($title);
    if ($t === '') {
        throw new InvalidArgumentException('title required');
    }
    if (strlen($t) > 500) {
        throw new InvalidArgumentException('title too long');
    }
    $stmt = $db->prepare(
        'UPDATE user_craft_orders SET title = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?',
    );
    $stmt->execute([$t, $orderId, $userId]);
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('order not found');
    }
}

function update_user_craft_order_deadline(PDO $db, int $userId, int $orderId, ?int $deadlineHours): void
{
    if ($deadlineHours !== null && ($deadlineHours < 1 || $deadlineHours > 9999)) {
        throw new InvalidArgumentException('deadline hours out of range');
    }
    if ($deadlineHours === null) {
        $stmt = $db->prepare(
            'UPDATE user_craft_orders SET deadline_hours = NULL, deadline_set_at = NULL, updated_at = UTC_TIMESTAMP()
             WHERE id = ? AND user_id = ?',
        );
        $stmt->execute([$orderId, $userId]);
    } else {
        $stmt = $db->prepare(
            'UPDATE user_craft_orders SET deadline_hours = ?, deadline_set_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
             WHERE id = ? AND user_id = ?',
        );
        $stmt->execute([$deadlineHours, $orderId, $userId]);
    }
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('order not found');
    }
}

function delete_user_craft_order(PDO $db, int $userId, int $orderId): void
{
    $stmt = $db->prepare('DELETE FROM user_craft_orders WHERE id = ? AND user_id = ?');
    $stmt->execute([$orderId, $userId]);
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('order not found');
    }
}

function assert_order_owned(PDO $db, int $userId, int $orderId): void
{
    $stmt = $db->prepare('SELECT 1 FROM user_craft_orders WHERE id = ? AND user_id = ?');
    $stmt->execute([$orderId, $userId]);
    if (!$stmt->fetchColumn()) {
        throw new InvalidArgumentException('order not found');
    }
}

function add_user_craft_order_line(PDO $db, int $userId, int $orderId, string $recipeFavoriteId, int $quantity): string
{
    assert_order_owned($db, $userId, $orderId);
    $rid = trim($recipeFavoriteId);
    if ($rid === '') {
        throw new InvalidArgumentException('recipeFavoriteId required');
    }
    if (strlen($rid) > 2000) {
        throw new InvalidArgumentException('recipeFavoriteId too long');
    }
    if ($quantity < 1 || $quantity > 1_000_000_000) {
        throw new InvalidArgumentException('quantity out of range');
    }
    $stmt = $db->prepare('SELECT COALESCE(MAX(sort_index), 0) + 1 AS n FROM user_craft_order_lines WHERE order_id = ?');
    $stmt->execute([$orderId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $sort = (int)($row['n'] ?? 0);
    $ins = $db->prepare(
        'INSERT INTO user_craft_order_lines (order_id, recipe_favorite_id, quantity, done, done_at, sort_index, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
    );
    $ins->execute([$orderId, $rid, $quantity, $sort]);
    $db->prepare('UPDATE user_craft_orders SET updated_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$orderId]);

    return (string)(int)$db->lastInsertId();
}

function update_user_craft_order_line_quantity(PDO $db, int $userId, int $lineId, int $quantity): void
{
    if ($quantity < 1 || $quantity > 1_000_000_000) {
        throw new InvalidArgumentException('quantity out of range');
    }
    $stmt = $db->prepare(
        'UPDATE user_craft_order_lines l
         INNER JOIN user_craft_orders o ON o.id = l.order_id
         SET l.quantity = ?, l.updated_at = UTC_TIMESTAMP(), o.updated_at = UTC_TIMESTAMP()
         WHERE l.id = ? AND o.user_id = ?',
    );
    $stmt->execute([$quantity, $lineId, $userId]);
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('line not found');
    }
}

function update_user_craft_order_line_done(PDO $db, int $userId, int $lineId, bool $done): void
{
    if ($done) {
        $stmt = $db->prepare(
            'UPDATE user_craft_order_lines l
             INNER JOIN user_craft_orders o ON o.id = l.order_id
             SET l.done = 1, l.done_at = UTC_TIMESTAMP(), l.updated_at = UTC_TIMESTAMP(), o.updated_at = UTC_TIMESTAMP()
             WHERE l.id = ? AND o.user_id = ?',
        );
        $stmt->execute([$lineId, $userId]);
    } else {
        $stmt = $db->prepare(
            'UPDATE user_craft_order_lines l
             INNER JOIN user_craft_orders o ON o.id = l.order_id
             SET l.done = 0, l.done_at = NULL, l.updated_at = UTC_TIMESTAMP(), o.updated_at = UTC_TIMESTAMP()
             WHERE l.id = ? AND o.user_id = ?',
        );
        $stmt->execute([$lineId, $userId]);
    }
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('line not found');
    }
}

function delete_user_craft_order_line(PDO $db, int $userId, int $lineId): void
{
    $stmt = $db->prepare(
        'DELETE l FROM user_craft_order_lines l
         INNER JOIN user_craft_orders o ON o.id = l.order_id
         WHERE l.id = ? AND o.user_id = ?',
    );
    $stmt->execute([$lineId, $userId]);
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('line not found');
    }
}

function update_user_craft_order_ingredient_done(PDO $db, int $userId, int $orderId, string $itemId, bool $done): void
{
    assert_order_owned($db, $userId, $orderId);
    $iid = trim($itemId);
    if ($iid === '' || strlen($iid) > 256) {
        throw new InvalidArgumentException('itemId required');
    }
    if ($done) {
        $stmt = $db->prepare(
            'INSERT INTO user_craft_order_ingredient_done (order_id, item_id, done, done_at, created_at, updated_at)
             VALUES (?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE done = 1, done_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()',
        );
        $stmt->execute([$orderId, $iid]);
    } else {
        $stmt = $db->prepare(
            'INSERT INTO user_craft_order_ingredient_done (order_id, item_id, done, done_at, created_at, updated_at)
             VALUES (?, ?, 0, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE done = 0, done_at = NULL, updated_at = UTC_TIMESTAMP()',
        );
        $stmt->execute([$orderId, $iid]);
    }
    $db->prepare('UPDATE user_craft_orders SET updated_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$orderId]);
}
