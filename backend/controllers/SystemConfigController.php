<?php

class SystemConfigController extends BaseController {
    private $configModel;

    public function __construct() {
        $this->configModel = new SystemConfig();
    }

    /**
     * GET /api/settings
     * Get all public settings
     */
    public function getSettings() {
        try {
            $settings = $this->configModel->getAll();
            Response::success($settings);
        } catch (Exception $e) {
            error_log("Error in getSettings: " . $e->getMessage());
            Response::error('Failed to retrieve settings', 500);
        }
    }

    /**
     * PUT /api/settings
     * Update settings (Admin only)
     */
    public function updateSettings() {
        try {
            AuthMiddleware::requirePermission('system.settings');

            // Get JSON payload
            $data = json_decode(file_get_contents('php://input'), true);

            if (!$data || !is_array($data)) {
                Response::error('Invalid settings payload provided', 400);
            }
            $errors=ChatSchedulePolicy::validationErrors($data);
            if ($errors) Response::validationError($errors);
            if (array_key_exists('ai_chat_show_reasons', $data)) {
                $data['ai_chat_show_reasons'] = (string)(int)$data['ai_chat_show_reasons'];
            }

            // Map frontend camelCase to snake_case if necessary, or just save them directly
            // The frontend should send exactly the keys matching DB or we map them.
            // But we will handle mapping on Frontend to make Backend cleaner, 
            // so we assume $data is [config_key => config_value]

            if ($this->configModel->updateAll($data)) {
                Response::success(['message' => 'Settings updated successfully']);
            } else {
                Response::error('Failed to update settings in database', 500);
            }

        } catch (Exception $e) {
            error_log("Error in updateSettings: " . $e->getMessage());
            Response::error('Failed to update settings', 500);
        }
    }
}
