<?php
/**
 * Quick Database Connection Test
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Testing MySQL Connection...\n\n";

$host = 'localhost';
$dbname = 'galaxy_cinema';
$username = 'root';
$password = '123456'; // Password hiện tại trong code

try {
    $dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "✅ Kết nối thành công!\n";
    echo "Database: $dbname\n";
    echo "User: $username\n";
    
    // Test query
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Total users: " . $result['count'] . "\n";
    
} catch (PDOException $e) {
    echo "❌ Lỗi kết nối!\n";
    echo "Error: " . $e->getMessage() . "\n\n";
    
    if (strpos($e->getMessage(), 'Access denied') !== false) {
        echo ">>> Password SAI! Bạn cần:\n";
        echo "1. Đổi password trong Database.php về đúng password của MySQL\n";
        echo "2. Hoặc đổi password MySQL thành '123456'\n";
    } elseif (strpos($e->getMessage(), 'Unknown database') !== false) {
        echo ">>> Database 'galaxy_cinema' CHƯA TỒN TẠI!\n";
        echo "Bạn cần chạy: mysql -u root -p < backend/database/schema.sql\n";
    }
}
