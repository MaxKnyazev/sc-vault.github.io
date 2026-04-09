<?php

function parse_positive_int_or_null(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $intValue = (int)$value;
    if ($intValue < 0) {
        return null;
    }
    return $intValue;
}

function get_recipe_result_overrides(PDO $db): array
{
    $stmt = $db->query(
        'SELECT recipe_id, result_item_id, base_amount, bonus_amount, updated_at
         FROM recipe_result_overrides'
    );
    $rows = $stmt->fetchAll();
    $result = [];
    foreach ($rows as $row) {
        $result[$row['recipe_id']] = [
            'recipeId' => (string)$row['recipe_id'],
            'resultItemId' => (string)$row['result_item_id'],
            'baseAmount' => $row['base_amount'] !== null ? (int)$row['base_amount'] : null,
            'bonusAmount' => $row['bonus_amount'] !== null ? (int)$row['bonus_amount'] : null,
            'updatedAt' => (string)$row['updated_at'],
        ];
    }
    return $result;
}

function upsert_recipe_result_override(
    PDO $db,
    int $adminUserId,
    string $recipeId,
    string $resultItemId,
    ?int $baseAmount,
    ?int $bonusAmount
): void {
    $normalizedRecipeId = trim($recipeId);
    $normalizedResultItemId = trim($resultItemId);
    if ($normalizedRecipeId === '' || $normalizedResultItemId === '') {
        throw new InvalidArgumentException('recipeId and resultItemId are required');
    }

    if ($baseAmount === null && $bonusAmount === null) {
        $deleteStmt = $db->prepare('DELETE FROM recipe_result_overrides WHERE recipe_id = ?');
        $deleteStmt->execute([$normalizedRecipeId]);
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO recipe_result_overrides
          (recipe_id, result_item_id, base_amount, bonus_amount, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
          result_item_id = VALUES(result_item_id),
          base_amount = VALUES(base_amount),
          bonus_amount = VALUES(bonus_amount),
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = UTC_TIMESTAMP()'
    );
    $stmt->execute([
        $normalizedRecipeId,
        $normalizedResultItemId,
        $baseAmount,
        $bonusAmount,
        $adminUserId,
    ]);
}

function bulk_upsert_recipe_result_overrides(PDO $db, int $adminUserId, array $items): int
{
    $db->beginTransaction();
    try {
        $count = 0;
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $recipeId = (string)($item['recipeId'] ?? '');
            $resultItemId = (string)($item['resultItemId'] ?? '');
            $baseAmount = parse_positive_int_or_null($item['baseAmount'] ?? null);
            $bonusAmount = parse_positive_int_or_null($item['bonusAmount'] ?? null);
            upsert_recipe_result_override(
                $db,
                $adminUserId,
                $recipeId,
                $resultItemId,
                $baseAmount,
                $bonusAmount
            );
            $count += 1;
        }
        $db->commit();
        return $count;
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

