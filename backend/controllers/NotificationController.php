<?php

class NotificationController extends BaseController {
    private $model;

    public function __construct() {
        $this->model = new Notification();
    }

    public function getUserNotifications($userId) {
        AuthMiddleware::authenticate();

        try {
            $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
            $authRole = (string)($_REQUEST['auth_user_role'] ?? '');
            $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            $requestedUserId = (int)$userId;

            // Prevent path/user mismatch from hiding notifications for normal users.
            // Admin/Manager may query arbitrary user ids; others always query self.
            if ($authRole === 'Admin' || $authRoleId === 5 || $authRole === 'Manager' || $authRoleId === 4) {
                $effectiveUserId = $requestedUserId > 0 ? $requestedUserId : $authUserId;
            } else {
                $effectiveUserId = $authUserId;
            }

            if ($effectiveUserId <= 0) {
                Response::forbidden('Insufficient permissions');
            }

            $roleId = (int)($_REQUEST['auth_user_role_id'] ?? 2);
            $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 30;
            $items = $this->model->getUserNotifications($effectiveUserId, $roleId, $limit);
        } catch (Throwable $e) {
            error_log('NotificationController@getUserNotifications error: ' . $e->getMessage());
            $items = [];
        }

        Response::success(['items' => $items]);
    }

    public function getPublicNotifications() {
        try {
            $limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 20;
            $items = $this->model->getPublicNotifications($limit);
        } catch (Throwable $e) {
            error_log('NotificationController@getPublicNotifications error: ' . $e->getMessage());
            $items = [];
        }

        Response::success(['items' => $items]);
    }

    public function markAsRead($id) {
        AuthMiddleware::authenticate();
        $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);

        try {
            $ok = $this->model->markAsRead((int)$id, $authUserId);
        } catch (Throwable $e) {
            error_log('NotificationController@markAsRead error: ' . $e->getMessage());
            $ok = false;
        }

        if (!$ok) {
            Response::error('Không thể cập nhật trạng thái đã đọc', 400);
        }

        Response::success([], 'Đã đánh dấu đã đọc');
    }

    public function adminList() {
        AuthMiddleware::requireManager();

        try {
            $search = trim((string)($_GET['search'] ?? ''));
            $type = trim((string)($_GET['type'] ?? 'all'));

            $campaigns = $this->model->listCampaigns($search, $type);

            $stats = [
                'total_notifications' => count($campaigns),
                'total_recipients' => array_sum(array_map(function ($n) {
                    return (int)$n['recipient_count'];
                }, $campaigns)),
                'total_reads' => array_sum(array_map(function ($n) {
                    return (int)$n['read_count'];
                }, $campaigns)),
                'sent_notifications' => count(array_filter($campaigns, function ($n) {
                    return strtoupper((string)($n['status'] ?? 'SENT')) === 'SENT';
                })),
                'scheduled_notifications' => count(array_filter($campaigns, function ($n) {
                    return strtoupper((string)($n['status'] ?? 'SENT')) === 'SCHEDULED';
                })),
            ];
        } catch (Throwable $e) {
            error_log('NotificationController@adminList error: ' . $e->getMessage());
            $campaigns = [];
            $stats = [
                'total_notifications' => 0,
                'total_recipients' => 0,
                'total_reads' => 0,
                'sent_notifications' => 0,
                'scheduled_notifications' => 0,
            ];
        }

        Response::success([
            'items' => $campaigns,
            'stats' => $stats,
        ]);
    }

    public function adminCreate() {
        AuthMiddleware::requireManager();

        try {
            $data = self::getRequestData();

            $title = trim((string)($data['title'] ?? ''));
            $message = trim((string)($data['message'] ?? ''));
            $type = trim((string)($data['type'] ?? 'SYSTEM'));
            $targetAudience = trim((string)($data['target_audience'] ?? 'ALL'));
            $scheduledAt = trim((string)($data['scheduled_at'] ?? ''));

            if ($title === '' || $message === '') {
                Response::validationError([
                    'title' => $title === '' ? 'Tiêu đề là bắt buộc' : null,
                    'message' => $message === '' ? 'Nội dung là bắt buộc' : null,
                ], 'Dữ liệu không hợp lệ');
            }

            $validTypes = ['BOOKING', 'PROMOTION', 'SYSTEM'];
            if (!in_array(strtoupper($type), $validTypes, true)) {
                Response::validationError(['type' => 'Loại thông báo không hợp lệ']);
            }

            $validAudience = ['ALL', 'GUEST', 'USER', 'STAFF', 'ADMIN'];
            $targetAudience = strtoupper($targetAudience);
            if (!in_array($targetAudience, $validAudience, true)) {
                Response::validationError(['target_audience' => 'Đối tượng nhận không hợp lệ']);
            }

            if ($scheduledAt !== '') {
                $dt = DateTime::createFromFormat('Y-m-d H:i:s', $scheduledAt)
                    ?: DateTime::createFromFormat('Y-m-d\TH:i', $scheduledAt)
                    ?: DateTime::createFromFormat('Y-m-d\TH:i:s', $scheduledAt);

                if (!$dt) {
                    Response::validationError(['scheduled_at' => 'Định dạng thời gian hẹn không hợp lệ']);
                }

                $now = new DateTime('now');
                if ($dt <= $now) {
                    Response::validationError(['scheduled_at' => 'Thời gian hẹn phải lớn hơn thời điểm hiện tại']);
                }

                $scheduledAt = $dt->format('Y-m-d H:i:s');
            } else {
                $scheduledAt = null;
            }

            $createdBy = (int)($_REQUEST['auth_user_id'] ?? 0);
            $inserted = $this->model->createCampaign(
                $title,
                $message,
                $type,
                $targetAudience,
                $createdBy ?: null,
                $scheduledAt
            );

            if (($inserted['id'] ?? 0) <= 0) {
                Response::error('Không có người nhận phù hợp hoặc gửi thất bại', 400);
            }

            Response::created([
                'id' => (int)$inserted['id'],
                'recipient_count' => (int)$inserted['recipient_count'],
                'status' => (string)($inserted['status'] ?? 'SENT'),
            ], 'Gửi thông báo thành công');
        } catch (Throwable $e) {
            error_log('NotificationController@adminCreate error: ' . $e->getMessage());
            Response::error('Không thể tạo thông báo ở thời điểm hiện tại', 400);
        }
    }

    public function adminDelete($id) {
        AuthMiddleware::requireManager();

        try {
            $deleted = $this->model->deleteCampaignBySeedId((int)$id);
            if ($deleted <= 0) {
                Response::notFound('Không tìm thấy thông báo để xóa');
            }

            Response::success(['deleted' => $deleted], 'Đã xóa thông báo');
        } catch (Throwable $e) {
            error_log('NotificationController@adminDelete error: ' . $e->getMessage());
            Response::error('Không thể xóa thông báo ở thời điểm hiện tại', 400);
        }
    }
}
