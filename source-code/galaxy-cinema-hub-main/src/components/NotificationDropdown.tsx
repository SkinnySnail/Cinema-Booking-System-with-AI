import React, { useCallback, useEffect, useState } from "react";
import { Bell, Film, Gift, AlertCircle, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import { getPusherClient } from "@/lib/pusher";
import { useAuth } from "@/contexts/AppContext";

interface Notification {
  id: string;
  type: "booking" | "promotion" | "system";
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  icon: React.ReactNode;
}

interface NotificationApiItem {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: number | boolean;
  created_at: string;
}

interface NotificationApiResponse {
  success: boolean;
  message: string;
  data: {
    items: NotificationApiItem[];
  };
}

const NotificationDropdown: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const getHiddenStorageKey = useCallback(() => {
    const userKey = user?.id ? `user_${user.id}` : "guest";
    return `hidden_notifications_${userKey}`;
  }, [user?.id]);

  const getHiddenNotificationIds = useCallback((): Set<string> => {
    if (!isAuthenticated) return new Set<string>();

    try {
      const raw = localStorage.getItem(getHiddenStorageKey());
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set<string>(parsed.map((id) => String(id)));
    } catch {
      return new Set<string>();
    }
  }, [getHiddenStorageKey, isAuthenticated]);

  const saveHiddenNotificationIds = useCallback(
    (ids: Set<string>) => {
      if (!isAuthenticated) return;
      localStorage.setItem(
        getHiddenStorageKey(),
        JSON.stringify(Array.from(ids)),
      );
    },
    [getHiddenStorageKey, isAuthenticated],
  );

  const getIconByType = (type: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "BOOKING") {
      return <Film className="w-5 h-5 text-green-500" />;
    }
    if (normalized === "PROMOTION") {
      return <Gift className="w-5 h-5 text-primary" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return "Vừa xong";
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} phút trước`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} giờ trước`;
    return `${Math.floor(diffMs / day)} ngày trước`;
  };

  const loadNotifications = useCallback(async () => {
    try {
      const endpoint =
        isAuthenticated && user?.id
          ? API_ENDPOINTS.USER_NOTIFICATIONS(Number(user.id))
          : API_ENDPOINTS.PUBLIC_NOTIFICATIONS;

      const response = await apiCall<NotificationApiResponse>(endpoint);

      const mapped: Notification[] = (response.data?.items || []).map(
        (item) => {
          const normalizedType = item.type?.toUpperCase() || "SYSTEM";
          return {
            id: String(item.id),
            type:
              normalizedType === "BOOKING"
                ? "booking"
                : normalizedType === "PROMOTION"
                  ? "promotion"
                  : "system",
            title: item.title,
            message: item.message,
            time: formatRelativeTime(item.created_at),
            isRead: isAuthenticated ? Boolean(Number(item.is_read)) : true,
            icon: getIconByType(normalizedType),
          };
        },
      );

      const hiddenIds = getHiddenNotificationIds();
      setNotifications(mapped.filter((item) => !hiddenIds.has(item.id)));
    } catch (error) {
      if (isAuthenticated) {
        try {
          // If user-specific endpoint fails (e.g., stale user id in storage),
          // still show public notifications instead of an empty dropdown.
          const fallbackResponse = await apiCall<NotificationApiResponse>(
            API_ENDPOINTS.PUBLIC_NOTIFICATIONS,
          );

          const mappedFallback: Notification[] = (
            fallbackResponse.data?.items || []
          ).map((item) => {
            const normalizedType = item.type?.toUpperCase() || "SYSTEM";
            return {
              id: String(item.id),
              type:
                normalizedType === "BOOKING"
                  ? "booking"
                  : normalizedType === "PROMOTION"
                    ? "promotion"
                    : "system",
              title: item.title,
              message: item.message,
              time: formatRelativeTime(item.created_at),
              isRead: true,
              icon: getIconByType(normalizedType),
            };
          });

          const hiddenIds = getHiddenNotificationIds();
          setNotifications(
            mappedFallback.filter((item) => !hiddenIds.has(item.id)),
          );
          return;
        } catch {
          // no-op, fall through to empty list
        }
      }

      // Avoid noisy console spam in UI when notification service is temporarily unavailable.
      setNotifications([]);
    }
  }, [getHiddenNotificationIds, isAuthenticated, user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime: reload when the backend announces a new notification via Pusher.
  // Events carry no content; the list is fetched again through the authenticated API.
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channelNames = ["notifications"];
    if (isAuthenticated && user?.id) {
      channelNames.push(`user-notifications.${user.id}`);
    }
    const onUpdate = () => {
      void loadNotifications();
    };
    const channels = channelNames.map((name) => {
      const channel = pusher.subscribe(name);
      channel.bind("notifications-updated", onUpdate);
      return channel;
    });

    return () => {
      channels.forEach((channel, i) => {
        channel.unbind("notifications-updated", onUpdate);
        pusher.unsubscribe(channelNames[i]);
      });
    };
  }, [isAuthenticated, user?.id, loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const badgeCount = isAuthenticated ? unreadCount : notifications.length;

  const markAsRead = async (id: string) => {
    if (!isAuthenticated) return;

    try {
      await apiCall(API_ENDPOINTS.MARK_READ(Number(id)), { method: "PUT" });
    } catch (error) {
      console.error("Mark as read failed:", error);
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  };

  const markAllAsRead = async () => {
    if (!isAuthenticated) return;

    try {
      const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
      await Promise.all(
        unreadIds.map((id) =>
          apiCall(API_ENDPOINTS.MARK_READ(Number(id)), { method: "PUT" }),
        ),
      );
    } catch (error) {
      console.error("Mark all as read failed:", error);
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    if (!isAuthenticated) return;
    const hiddenIds = getHiddenNotificationIds();
    hiddenIds.add(id);
    saveHiddenNotificationIds(hiddenIds);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    if (!isAuthenticated) return;

    const hiddenIds = getHiddenNotificationIds();
    notifications.forEach((notification) => hiddenIds.add(notification.id));
    saveHiddenNotificationIds(hiddenIds);

    setNotifications([]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-secondary-foreground hover:bg-secondary-foreground/10"
        >
          <Bell className="w-5 h-5" />
          {badgeCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
              {badgeCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Thông báo</h3>
          {isAuthenticated && notifications.length > 0 && unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary"
            >
              Đánh dấu đã đọc
            </Button>
          )}
        </div>

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <ScrollArea className="h-[400px]">
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${!notification.isRead ? "bg-primary/5" : ""
                    }`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0">{notification.icon}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-semibold text-sm">
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {notification.time}
                        </span>
                        {isAuthenticated && (
                          <div className="flex gap-1">
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead(notification.id)}
                                className="h-7 px-2 text-xs"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteNotification(notification.id)
                              }
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Không có thông báo mới</p>
          </div>
        )}

        {isAuthenticated && notifications.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="w-full text-destructive hover:text-destructive"
            >
              Xóa tất cả
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationDropdown;
