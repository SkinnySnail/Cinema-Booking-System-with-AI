<?php

/**
 * Galaxy Cinema Backend - Entry Point
 * REST API for Cinema Booking System
 */

if (PHP_SAPI === 'cli-server') {
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $staticFile = realpath(__DIR__ . $requestPath);
    $backendRoot = realpath(__DIR__);

    if (
        $requestPath !== false &&
        $staticFile !== false &&
        $backendRoot !== false &&
        strncmp($staticFile, $backendRoot, strlen($backendRoot)) === 0 &&
        is_file($staticFile)
    ) {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Allow-Credentials: true');

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(200);
            exit();
        }

        $mimeType = mime_content_type($staticFile) ?: 'application/octet-stream';
        header("Content-Type: $mimeType");
        header('Content-Length: ' . filesize($staticFile));
        readfile($staticFile);
        exit();
    }
}

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Set timezone to Vietnam
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Error reporting for development
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors in output (breaks JSON)
ini_set('log_errors', 1);     // Log errors instead

// Start output buffering to catch any unexpected output
ob_start();
file_put_contents(__DIR__ . '/debug_index_hit.txt', date('Y-m-d H:i:s') . ' - ' . $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);

// Load and apply CORS middleware
require_once __DIR__ . '/middleware/CorsMiddleware.php';
CorsMiddleware::handle();

// Set content type
header('Content-Type: application/json; charset=UTF-8');

// Load .env before configs
require_once __DIR__ . '/config/Env.php';
Env::load(__DIR__ . '/.env');

// Autoloader
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/Config.php';
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';

// Auto-load controllers and models
spl_autoload_register(function ($class) {
    $paths = [
        __DIR__ . '/controllers/' . $class . '.php',
        __DIR__ . '/models/' . $class . '.php',
        __DIR__ . '/middleware/' . $class . '.php',
        __DIR__ . '/utils/' . $class . '.php',
        __DIR__ . '/service/' . $class . '.php'
    ];

    foreach ($paths as $path) {
        if (file_exists($path)) {
            require_once $path;
            return;
        }
    }
});

// Initialize Router
$router = new Router();

// Health check endpoint
$router->get('/api/health', function () {
    Response::success(['status' => 'OK', 'message' => 'Galaxy Cinema API is running']);
});

// ============================================
// HALL ROUTES
// ============================================
$router->get('/api/ai/recommendations', 'AIController@recommendations');
$router->post('/api/ai/chat', 'AIController@chat');
$router->post('/api/ai/reviews/sentiment', 'AIController@sentiments');

$router->post('/api/halls', 'HallController@create'); // Admin
$router->get('/api/halls/:id', 'HallController@show'); // Admin
$router->put('/api/halls/:id', 'HallController@update'); // Admin
$router->delete('/api/halls/:id', 'HallController@delete'); // Admin
$router->post('/api/halls/:id/layout', 'HallController@saveLayout'); // Admin

// ============================================
// AUTH ROUTES
// ============================================
$router->post('/api/auth/send-verification', 'AuthController@sendVerification');
$router->post('/api/auth/verify-email', 'AuthController@verifyEmail');
$router->post('/api/auth/register', 'AuthController@register');
$router->post('/api/auth/login', 'AuthController@login');
$router->post('/api/auth/logout', 'AuthController@logout');
$router->post('/api/auth/refresh-token', 'AuthController@refreshToken');
$router->get('/api/auth/me', 'AuthController@getCurrentUser'); // Protected
$router->post('/api/auth/forgot-password', 'AuthController@forgotPassword');
$router->post('/api/auth/reset-password', 'AuthController@resetPassword');

// ============================================
// USER ROUTES
// ============================================
// Admin routes
$router->get('/api/users', 'UserController@index'); // Admin only - List users
$router->post('/api/users', 'UserController@create'); // Admin only - Create user
$router->get('/api/users/:id', 'UserController@show'); // Admin or self
$router->put('/api/users/:id', 'UserController@update'); // Admin or self
$router->delete('/api/users/:id', 'UserController@delete'); // Admin only
$router->put('/api/users/:id/role', 'UserController@updateRole'); // Admin only

// User profile routes
$router->get('/api/users/:id/profile', 'UserController@getProfile'); // Self only
$router->put('/api/users/:id/profile', 'UserController@updateProfile'); // Self only
$router->post('/api/users/:id/change-password', 'UserController@changePassword'); // Self only
$router->post('/api/users/:id/upload-avatar', 'UserController@uploadAvatar'); // Self only

// Role routes (Dynamic RBAC)
$router->get('/api/roles', 'RoleController@index'); // Get all roles
$router->get('/api/roles/:id', 'RoleController@show'); // Get role details
$router->post('/api/roles', 'RoleController@create'); // Create custom role
$router->put('/api/roles/:id', 'RoleController@update'); // Update custom role
$router->delete('/api/roles/:id', 'RoleController@delete'); // Delete custom role

// User Roles Assignment (Multi-Role)
$router->get('/api/users-with-roles', 'RoleController@getUsersWithRoles'); // List users with roles
$router->get('/api/users/:id/roles', 'RoleController@getUserRolesDetail'); // User roles detail
$router->post('/api/users/:id/roles', 'RoleController@assignUserRoles'); // Assign roles to user

// Audit Logs
$router->get('/api/audit-logs/permissions', 'RoleController@getAuditLogs'); // Get permission audit logs

// Permission routes (Admin only)
$router->get('/api/permissions', 'PermissionController@index'); // List all permissions
$router->post('/api/permissions', 'PermissionController@create'); // Create permission
$router->put('/api/permissions/:id', 'PermissionController@update'); // Update permission
$router->put('/api/permissions/:id/toggle-active', 'PermissionController@toggleActive'); // Khóa/Mở khóa permission
$router->delete('/api/permissions/:id', 'PermissionController@delete'); // Delete permission

// Role permission routes (Admin only)
$router->get('/api/roles/:roleId/permissions', 'PermissionController@getRolePermissions'); // Get role's permissions
$router->post('/api/roles/:roleId/permissions', 'PermissionController@assignPermission'); // Assign permission to role
$router->delete('/api/roles/:roleId/permissions/:permissionId', 'PermissionController@revokePermission'); // Revoke permission
$router->put('/api/roles/:roleId/permissions/sync', 'PermissionController@syncPermissions'); // Sync all permissions

// ============================================
// SETTINGS ROUTES
// ============================================
$router->get('/api/settings', 'SystemConfigController@getSettings');
$router->put('/api/settings', 'SystemConfigController@updateSettings'); // Admin/Manager

// ============================================
// CUSTOMER ROUTES (POS - Khách Vãng Lai)
// ============================================
$router->post('/api/customers/lookup-or-create', 'CustomerController@lookupOrCreate'); // Staff - POS
$router->get('/api/customers/by-phone', 'CustomerController@getByPhone'); // Staff - Get by phone
$router->get('/api/customers/:id/bookings', 'CustomerController@getBookingHistory'); // Staff - Guest booking history
$router->get('/api/customers/:id', 'CustomerController@getById'); // Staff - Get by ID
$router->get('/api/customers/stats', 'CustomerController@getStats'); // Staff/Admin - Statistics

// ============================================
// MOVIE ROUTES
// ============================================
$router->get('/api/movies', 'MovieController@index');
$router->get('/api/movies/:id', 'MovieController@show');
$router->post('/api/movies', 'MovieController@create'); // Admin
$router->post('/api/movies/import', 'MovieController@import'); // Admin bulk import
$router->put('/api/movies/:id', 'MovieController@update'); // Admin
$router->delete('/api/movies/:id', 'MovieController@delete'); // Admin
$router->post('/api/movies/:id/upload-poster', 'MovieController@uploadPoster'); // Admin - Upload poster
$router->post('/api/movies/:id/upload-poster-from-url', 'MovieController@uploadPosterFromUrl'); // Admin - Upload poster from URL
$router->get('/api/movies/:id/showtimes', 'MovieController@getShowtimes');
$router->get('/api/movies/:id/reviews', 'MovieController@getReviews');

// ============================================
// GENRE ROUTES
// ============================================
$router->get('/api/genres', 'GenreController@index');
$router->get('/api/genres/:id', 'GenreController@show');
$router->post('/api/genres', 'GenreController@create'); // Admin/Manager
$router->put('/api/genres/:id', 'GenreController@update'); // Admin/Manager
$router->delete('/api/genres/:id', 'GenreController@delete'); // Admin only

// ============================================
// POSTER ROUTES (HERO BANNER)
// ============================================
$router->get('/api/posters', 'PosterController@index'); // Public & Admin
$router->post('/api/posters', 'PosterController@create'); // Admin/Manager
$router->post('/api/posters/:id', 'PosterController@update'); // Dùng POST cho Update có upload file
$router->put('/api/posters/:id', 'PosterController@update'); // Admin/Manager
$router->delete('/api/posters/:id', 'PosterController@delete'); // Admin/Manager

// ============================================
// CINEMA ROUTES
// ============================================
$router->get('/api/cinemas', 'CinemaController@index');
$router->get('/api/cinemas/:id', 'CinemaController@show');
$router->post('/api/cinemas', 'CinemaController@create'); // Admin
$router->put('/api/cinemas/:id', 'CinemaController@update'); // Admin
$router->delete('/api/cinemas/:id', 'CinemaController@delete'); // Admin
$router->get('/api/cinemas/:id/halls', 'CinemaController@getHalls');
$router->get('/api/cinemas/:id/showtimes', 'CinemaController@getShowtimes');


// ============================================
// SHOWTIME ROUTES
// ============================================
$router->get('/api/showtimes', 'ShowtimeController@index');
$router->get('/api/showtimes/:id', 'ShowtimeController@show');
$router->post('/api/showtimes', 'ShowtimeController@create'); // Manager
$router->post('/api/showtimes/auto-generate', 'ShowtimeController@autoGenerate'); // Manager
$router->put('/api/showtimes/:id', 'ShowtimeController@update'); // Manager
$router->delete('/api/showtimes/:id', 'ShowtimeController@delete'); // Manager
$router->get('/api/showtimes/:id/seats', 'ShowtimeController@getAvailableSeats');
$router->get('/api/showtimes/:id/seat-map', 'ShowtimeController@getSeatMap');
$router->post('/api/showtimes/:id/hold-seats', 'ShowtimeController@holdSeats');
$router->post('/api/showtimes/:id/release-seats', 'ShowtimeController@releaseSeats');

// ============================================
// BOOKING ROUTES
// ============================================
$router->get('/api/bookings', 'BookingController@index');
$router->get('/api/bookings/pos-history', 'BookingController@getPosPaymentHistory'); // Staff - POS payment history
$router->get('/api/bookings/:id', 'BookingController@show');
$router->post('/api/bookings', 'BookingController@create'); // Create booking & hold seats
$router->put('/api/bookings/:id/confirm', 'BookingController@confirm'); // Confirm payment
$router->put('/api/bookings/:id/cancel', 'BookingController@cancel');
$router->put('/api/bookings/:id/refund', 'BookingController@refund'); // Admin refund
$router->put('/api/bookings/:id', 'BookingController@update'); // Update booking (change seats, concessions, etc.)
$router->get('/api/bookings/user/:userId', 'BookingController@getUserBookings');
$router->get('/api/bookings/showtime/:showtimeId', 'BookingController@getBookingsByShowtime'); // Get all bookings for a showtime (for seat hold status)
$router->get('/api/bookings/user/showtime/:userId/:showtimeId', 'BookingController@getBookingByUserAndShowtime'); // Get user's booking for a specific showtime (to prevent multiple holds)

// ============================================
// TRANSACTION ROUTES
// ============================================
$router->post('/api/transactions', 'TransactionController@create');
$router->get('/api/transactions/booking/:bookingId', 'TransactionController@getByBooking');
$router->post('/api/transactions/momo/verify', 'TransactionController@verifyMomo');
$router->get('/api/transactions/vnpay/verify', 'TransactionController@verifyVNPay');
$router->post('/api/transactions/vnpay/verify', 'TransactionController@verifyVNPay');
$router->post('/api/transactions/vnpay/ipn', 'TransactionController@verifyVNPayIpn');
$router->get('/api/transactions/momo/verify', 'TransactionController@verifyMomo');
$router->get('/api/transactions/user/:userId', 'TransactionController@getHistory');
$router->post('/api/transactions/momo', 'TransactionController@createMoMoPayment');
$router->post('/api/transactions/vnpay', 'TransactionController@createVNPayPayment');
$router->post('/api/transactions/visa', 'TransactionController@createVisaPayment');
// ============================================
// TICKET ROUTES
// ============================================
$router->get('/api/tickets', 'TicketController@index'); // Admin - Get all tickets
$router->get('/api/tickets/code/:code', 'TicketController@getByCode'); // QR scan
$router->get('/api/tickets/booking/:bookingId', 'TicketController@getByBooking'); // Get tickets by booking
$router->get('/api/tickets/scan-history', 'TicketController@scanHistory'); // Staff scan history
$router->post('/api/tickets/check', 'TicketController@check'); // Staff scan at gate
$router->post('/api/tickets/approve-entry', 'TicketController@approveEntry'); // Staff approve entry + save scan history
$router->put('/api/tickets/:id/use', 'TicketController@markAsUsed'); // Mark as used
$router->post('/api/tickets/:id/refund', 'TicketController@refund'); // Refund ticket
$router->post('/api/tickets/:id/send-email', 'TicketController@sendEmail'); // Send email

// ============================================
// LOYALTY & MEMBERSHIP ROUTES
// ============================================
$router->get('/api/loyalty/history/:userId', 'LoyaltyController@getHistory');
$router->get('/api/loyalty/points/:userId', 'LoyaltyController@getCurrentPoints');
$router->post('/api/loyalty/earn', 'LoyaltyController@earnPoints');
$router->post('/api/loyalty/redeem', 'LoyaltyController@redeemPoints');
$router->get('/api/memberships', 'MembershipController@index');
$router->put('/api/memberships', 'MembershipController@update');
$router->get('/api/memberships/user/:userId', 'MembershipController@getUserTier');
$router->get('/api/memberships/check-upgrade/:userId', 'MembershipController@checkUpgrade');
$router->get('/api/memberships/:id', 'MembershipController@show');

// ============================================
// VOUCHER & PROMOTION ROUTES
// ============================================
$router->get('/api/promotions/active', 'PromotionController@getActive');
$router->get('/api/promotions', 'PromotionController@index');
$router->get('/api/promotions/:id', 'PromotionController@show');
$router->post('/api/promotions', 'PromotionController@create'); // Admin
$router->put('/api/promotions/:id', 'PromotionController@update'); // Admin
$router->delete('/api/promotions/:id', 'PromotionController@delete'); // Admin
$router->get('/api/vouchers/reward-tiers', 'VoucherController@getRewardTiers');
$router->post('/api/vouchers/redeem-points', 'VoucherController@redeemPoints');
$router->get('/api/vouchers/user/:userId', 'VoucherController@getUserVouchers');
$router->get('/api/vouchers/:id', 'VoucherController@show');
$router->post('/api/vouchers/assign', 'VoucherController@assignToUser');
$router->post('/api/vouchers/apply', 'VoucherController@applyVoucher');
$router->put('/api/vouchers/:id/use', 'VoucherController@markAsUsed');

// ============================================
// CONCESSION ROUTES
// ============================================
$router->get('/api/concessions', 'ConcessionController@index');
$router->get('/api/concessions/available', 'ConcessionController@getAvailable'); // Get available concessions
$router->get('/api/concessions/:id', 'ConcessionController@show');
$router->post('/api/concessions', 'ConcessionController@create'); // Admin
$router->post('/api/concessions/import', 'ConcessionController@import'); // Admin bulk import
$router->put('/api/concessions/:id', 'ConcessionController@update'); // Admin
$router->delete('/api/concessions/:id', 'ConcessionController@delete'); // Admin
$router->post('/api/concessions/:id/upload-image', 'ConcessionController@uploadImage'); // Admin - Upload concession image
$router->post('/api/concessions/:id/inventory', 'ConcessionController@updateInventory'); // Admin/Manager - Update inventory cho rạp


// ============================================
// REVIEW ROUTES
// ============================================
$router->get('/api/reviews', 'ReviewController@index'); // Admin - List all reviews
$router->get('/api/reviews/movie/:movieId', 'ReviewController@getMovieReviews');
$router->post('/api/reviews', 'ReviewController@create');
$router->put('/api/reviews/:id', 'ReviewController@update');
$router->delete('/api/reviews/:id', 'ReviewController@delete');
$router->put('/api/reviews/:id/approve', 'ReviewController@approve'); // Admin - Approve review
$router->put('/api/reviews/:id/reject', 'ReviewController@reject'); // Admin - Reject review
$router->post('/api/reviews/:id/report', 'ReviewController@report'); // Report review

// ============================================
// NOTIFICATION ROUTES
// ============================================
$router->get('/api/notifications/public', 'NotificationController@getPublicNotifications');
$router->get('/api/notifications/user/:userId', 'NotificationController@getUserNotifications');
$router->put('/api/notifications/:id/read', 'NotificationController@markAsRead');
$router->get('/api/admin/notifications', 'NotificationController@adminList');
$router->post('/api/admin/notifications', 'NotificationController@adminCreate');
$router->delete('/api/admin/notifications/:id', 'NotificationController@adminDelete');

// ============================================
// ADMIN DASHBOARD ROUTES
// ============================================
$router->get('/api/admin/stats', 'AdminController@getDashboardStats'); // Admin
$router->get('/api/admin/revenue', 'AdminController@getRevenueReport'); // Admin
$router->get('/api/admin/seat-heatmap', 'AdminController@getSeatHeatmap'); // Admin
$router->get('/api/admin/recent-transactions', 'AdminController@getRecentTransactions'); // Admin
$router->get('/api/admin/transactions', 'AdminController@getTransactions'); // Admin with pagination/filter
$router->get('/api/admin/transactions/export-details', 'AdminController@getTransactionsExportDetails'); // Admin detailed export
$router->put('/api/admin/bookings/:id/force-status', 'AdminController@forceUpdateBookingStatus'); // Admin force-update booking status

// ============================================
// SYSTEM CONFIG ROUTES
// ============================================
$router->get('/api/config', 'ConfigController@index');
$router->put('/api/config', 'ConfigController@update'); // Admin

// ============================================
// MANAGER ROUTES (Cinema-scoped)
// ============================================
// Dashboard
$router->get('/api/manager/dashboard/stats', 'ManagerController@getDashboardStats');
$router->get('/api/manager/dashboard/revenue', 'ManagerController@getDashboardRevenue');
$router->get('/api/manager/dashboard/upcoming-shows', 'ManagerController@getUpcomingShows');
// Cinema info
$router->get('/api/manager/cinema/info', 'ManagerController@getCinemaInfo');
$router->put('/api/manager/cinema/info', 'ManagerController@updateCinemaInfo');
$router->get('/api/manager/cinema/halls', 'ManagerController@getCinemaHalls');
// Movies (for scheduling)
$router->get('/api/manager/movies/available', 'ManagerController@getAvailableMovies');
// Showtimes
$router->get('/api/manager/showtimes', 'ManagerController@getShowtimes');
$router->post('/api/manager/showtimes', 'ManagerController@createShowtime');
$router->put('/api/manager/showtimes/:id', 'ManagerController@updateShowtime');
$router->delete('/api/manager/showtimes/:id', 'ManagerController@deleteShowtime');
// Staff
$router->get('/api/manager/staff', 'ManagerController@getStaff');
$router->post('/api/manager/staff', 'ManagerController@createStaff');
$router->post('/api/manager/staff/import', 'ManagerController@importStaff');
$router->put('/api/manager/staff/:id', 'ManagerController@updateStaff');
$router->patch('/api/manager/staff/:id/toggle-status', 'ManagerController@toggleStaffStatus');
// Reports
$router->get('/api/manager/reports/revenue', 'ManagerController@getRevenueReport');
$router->get('/api/manager/reports/occupancy', 'ManagerController@getOccupancyReport');
$router->get('/api/manager/reports/export', 'ManagerController@exportReport');
// Transactions (for Excel/PDF export)
$router->get('/api/manager/transactions', 'ManagerController@getTransactions');
$router->get('/api/manager/transactions/export-details', 'ManagerController@getTransactionsExportDetails');
// Concessions inventory (Manager)
$router->get('/api/manager/concessions', 'ManagerController@getConcessions');
$router->post('/api/manager/concessions/import', 'ManagerController@importConcessions');
$router->post('/api/manager/concessions/:id/inventory', 'ManagerController@updateConcessionInventory');

// Run router
$router->run();
