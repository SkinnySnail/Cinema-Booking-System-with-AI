<?php
/**
 * Simple .env loader
 */
class Env {
    public static function load($path = null) {
        $rootEnv = dirname(__DIR__, 2) . '/.env';
        if ($path === null || !is_readable($path)) {
            $path = $rootEnv;
        }
        if (!is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }

            if (strpos($line, '=') === false) {
                continue;
            }

            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            if ($key === '') {
                continue;
            }

            // Strip surrounding quotes
            if (
                (strlen($value) >= 2) &&
                (($value[0] === '"' && substr($value, -1) === '"') ||
                ($value[0] === "'" && substr($value, -1) === "'"))
            ) {
                $value = substr($value, 1, -1);
            }

            if (getenv($key) === false) {
                putenv($key . '=' . $value);
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
            }

            // Define constants for keys like VNP_TMNCODE, VNP_HASH_SECRET, etc.
            if (!defined($key) && preg_match('/^[A-Z0-9_]+$/', $key)) {
                define($key, $value);
            }
        }
    }
}
