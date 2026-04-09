<?php

declare(strict_types=1);

$baseDir = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
$config = require $baseDir . '/config.php';
require $baseDir . '/src/Db.php';
require $baseDir . '/src/Auth.php';

try {
    $db = db_connect($config);
} catch (Throwable $e) {
    fwrite(STDERR, "DB connection failed\n");
    exit(1);
}

$deleted = cleanup_expired_tokens($db);
echo "expired_tokens_deleted={$deleted}\n";

