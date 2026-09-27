<?php

class BaseController{
    public static function getRequestData() {
        $data = $_POST;
        if (empty($data)) {
            $raw = file_get_contents('php://input');
            $data = json_decode($raw, true) ?: [];
        }
        return $data;
    }

    /**
     * Authorize user ID
     * @param int $userId User ID to check
     * @param bool $returnBoolean If true, return bool; if false, throw 403 on fail
     * @return bool|void Returns bool if $returnBoolean=true, else throws 403
     */
    public static function authorizeUserId($userId, $returnBoolean = false) {
        $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);

        $isPrivileged = $authRole === 'Admin' || $authRoleId === 5 || $authRole === 'Manager' || $authRoleId === 4 || $authRole === 'Staff' || $authRoleId === 3;
        $isSelf = $authUserId === $userId;

        if ($isPrivileged || $isSelf) {
            if ($returnBoolean) return true;
            return;
        }

        if ($returnBoolean) return false;
        Response::forbidden('Insufficient permissions');
    }
    /**
     * Check if current user is Admin
     */
    protected function isAdmin(): bool
    {
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        return $authRole === 'Admin' || $authRoleId === 5;
    }

    /**
     * Check if current user is Manager
     */
    protected function isManager(): bool
    {
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        return $authRole === 'Manager' || $authRoleId === 4;
    }

    /**
     * Check if current user is Admin or Manager
     */
    protected function isAdminOrManager(): bool
    {
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        return $authRole === 'Admin' || $authRoleId === 5 || $authRole === 'Manager' || $authRoleId === 4;
    }

    /**
     * Check if current user is authenticated (any role)
     */
    protected function isAuthenticated(): bool
    {
        return !empty($_REQUEST['auth_user_id']);
    }
}
?>
