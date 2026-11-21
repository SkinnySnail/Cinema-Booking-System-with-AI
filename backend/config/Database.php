<?php

/**
 * Database Configuration
 */
class Database
{
    private static $instance = null;
    private $connection;

    // Database credentials
    private $host;
    private $port;
    private $db_name;
    private $username;
    private $password;
    private $charset;

    private function __construct()
    {
        $this->host = $this->getEnvValue('DB_HOST', 'localhost');
        $this->port = $this->getEnvValue('DB_PORT', '3306');
        $this->db_name = $this->getEnvValue('DB_NAME', 'galaxy_cinema');
        $this->username = $this->getEnvValue('DB_USERNAME', 'root');
        $this->password = $this->getEnvValue('DB_PASSWORD', '123456');
        $this->charset = $this->getEnvValue('DB_CHARSET', 'utf8mb4');

        try {
            $port = (int) $this->port;
            // Chỉ thêm port vào DSN khi khác mặc định 3306.
            $portPart = $port && $port !== 3306 ? ";port={$port}" : '';
            $dsn = "mysql:host={$this->host}{$portPart};dbname={$this->db_name};charset={$this->charset}";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];

            $this->connection = new PDO($dsn, $this->username, $this->password, $options);
        } catch (PDOException $e) {
            die(json_encode([
                'success' => false,
                'message' => 'Database Connection Error: ' . $e->getMessage()
            ]));
        }
    }

    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection()
    {
        return $this->connection;
    }

    // Prevent cloning
    private function __clone() {}

    // Prevent unserialization
    public function __wakeup()
    {
        throw new Exception("Cannot unserialize singleton");
    }

    private function getEnvValue($key, $default = null)
    {
        $value = getenv($key);
        if ($value !== false) {
            return $value;
        }

        if (isset($_ENV[$key])) {
            return $_ENV[$key];
        }

        if (isset($_SERVER[$key])) {
            return $_SERVER[$key];
        }

        return $default;
    }
}
