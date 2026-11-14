import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Save, Clock, Shield, ShieldAlert, TrendingUp, Award, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AppContext";
import { systemConfig } from "@/data/mockData";
import { SystemConfig } from "@/types/cinema";
import { apiCall, API_ENDPOINTS } from "@/lib/api";

import { AdminHeroBanner } from "@/components/admin/AdminHeroBanner";

const AdminSettings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin =
    user?.id === "1" ||
    (user as any)?.id === 1 ||
    user?.email === "admin@galaxy.vn" ||
    (user as any)?.role_id === 5 ||
    (user as any)?.roles?.some((r: any) => r.id === 5 || r.code === "SYSTEM_ADMIN");

  const hasSettingsPerm =
    isSuperAdmin ||
    (Array.isArray((user as any)?.permissions) &&
      (user as any).permissions.includes("system.settings"));

  const [config, setConfig] = useState<SystemConfig>(systemConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chatScheduleDays, setChatScheduleDays] = useState(7);
  const [chatShowtimesPerDay, setChatShowtimesPerDay] = useState(8);
  const [chatShowReasons, setChatShowReasons] = useState(true);
  const [chatGroupBy, setChatGroupBy] = useState("date_movie");
  const [chatEmptyPolicy, setChatEmptyPolicy] = useState("suggest_alternatives");
  const [chatContextTtl, setChatContextTtl] = useState(15);
  const [chatAmbiguityPolicy, setChatAmbiguityPolicy] = useState("clarify");

  // Membership tiers from DB (ids are needed for PUT)
  const [dbTiers, setDbTiers] = useState<any[]>([]);

  useEffect(() => {
    if (hasSettingsPerm) {
      fetchSettings();
      fetchMemberships();
    }
  }, [hasSettingsPerm]);

  if (!hasSettingsPerm) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4 pt-20">
        <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Không có quyền truy cập</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Tài khoản <strong>{user?.email}</strong> thuộc vai trò tùy chỉnh không được cấp quyền quản lý cấu hình hệ thống (<code>system.settings</code>).
        </p>
        <Button onClick={() => window.history.back()} variant="outline" className="mt-2">
          Quay lại trang trước
        </Button>
      </div>
    );
  }

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiCall<{ success: boolean; data: any }>(
        API_ENDPOINTS.SETTINGS,
      );
      if (res.success && res.data) {
        const dbConfig = res.data;
        setChatScheduleDays(Number(dbConfig.ai_chat_schedule_days ?? 7));
        setChatShowtimesPerDay(Number(dbConfig.ai_chat_showtimes_per_day ?? 8));
        setChatShowReasons(String(dbConfig.ai_chat_show_reasons ?? "1") !== "0");
        setChatGroupBy(dbConfig.ai_chat_group_by === "date_cinema" ? "date_cinema" : "date_movie");
        setChatEmptyPolicy(dbConfig.ai_chat_empty_result_policy === "report_only" ? "report_only" : "suggest_alternatives");
        setChatContextTtl(Number(dbConfig.ai_chat_context_ttl_minutes ?? 15));
        setChatAmbiguityPolicy(dbConfig.ai_chat_ambiguity_policy === "first_match" ? "first_match" : "clarify");
        const mappedConfig: Partial<SystemConfig> = {};
        if (dbConfig.curfew_u13) mappedConfig.curfewTimeU13 = dbConfig.curfew_u13.substring(0, 5);
        if (dbConfig.curfew_u16) mappedConfig.curfewTimeU16 = dbConfig.curfew_u16.substring(0, 5);
        if (dbConfig.min_vietnamese_quota) mappedConfig.minVietnameseQuota = Number(dbConfig.min_vietnamese_quota);
        if (dbConfig.seat_hold_duration) mappedConfig.seatHoldDuration = Math.max(1, Math.floor(Number(dbConfig.seat_hold_duration) / 60));
        if (dbConfig.cleanup_duration) mappedConfig.defaultCleanupDuration = Number(dbConfig.cleanup_duration);
        if (dbConfig.loyalty_points_rate) mappedConfig.loyaltyPointsRate = Number(dbConfig.loyalty_points_rate);
        setConfig(prev => ({ ...prev, ...mappedConfig }));
      }
    } catch (error) {
      toast({ title: "Lỗi tải cấu hình", description: "Không thể lấy cấu hình mới nhất từ máy chủ", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberships = async () => {
    try {
      const res = await apiCall<{ success: boolean; data: { memberships: any[] } }>(
        API_ENDPOINTS.MEMBERSHIPS,
      );
      if (res.success && res.data?.memberships) {
        const tiers = res.data.memberships;
        setDbTiers(tiers);
        // Map DB tiers → local config keys (bronze/silver/gold/platinum by order)
        const tierNames = ["bronze", "silver", "gold", "platinum"];
        const sortedTiers = [...tiers].sort((a, b) => Number(a.min_points_required) - Number(b.min_points_required));
        const mappedTiers: Record<string, { minSpent: number; discount: number }> = {};
        sortedTiers.forEach((t, i) => {
          mappedTiers[tierNames[i]] = {
            minSpent: Number(t.min_points_required),
            discount: Number(t.discount_rate),
          };
        });
        setConfig(prev => ({ ...prev, membershipTiers: { ...prev.membershipTiers, ...mappedTiers } }));
      }
    } catch (error) {
      console.error("Failed to load memberships:", error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!Number.isInteger(chatScheduleDays) || chatScheduleDays < 1 || chatScheduleDays > 7 ||
          !Number.isInteger(chatShowtimesPerDay) || chatShowtimesPerDay < 1 || chatShowtimesPerDay > 20) {
        throw new Error("Chatbot hỗ trợ từ 1 đến 7 ngày và từ 1 đến 20 suất mỗi ngày.");
      }
      if (!Number.isInteger(chatContextTtl) || chatContextTtl < 1 || chatContextTtl > 120) {
        throw new Error("Thời hạn ngữ cảnh phải là số nguyên từ 1 đến 120 phút.");
      }

      // 1. Save system_configs (giờ giới nghiêm, booking, loyalty rate, vietnamese quota)
      const payload = {
        curfew_u13: config.curfewTimeU13 + ":00",
        curfew_u16: config.curfewTimeU16 + ":00",
        min_vietnamese_quota: config.minVietnameseQuota,
        seat_hold_duration: config.seatHoldDuration * 60,
        cleanup_duration: config.defaultCleanupDuration,
        loyalty_points_rate: config.loyaltyPointsRate,
        ai_chat_schedule_days: chatScheduleDays,
        ai_chat_showtimes_per_day: chatShowtimesPerDay,
        ai_chat_show_reasons: chatShowReasons ? "1" : "0",
        ai_chat_group_by: chatGroupBy,
        ai_chat_empty_result_policy: chatEmptyPolicy,
        ai_chat_context_ttl_minutes: chatContextTtl,
        ai_chat_ambiguity_policy: chatAmbiguityPolicy,
      };

      const settingsRes = await apiCall<{ success: boolean; message: string }>(
        API_ENDPOINTS.SETTINGS,
        { method: "PUT", body: JSON.stringify(payload) }
      );
      if (!settingsRes.success) throw new Error(settingsRes.message || "Lỗi lưu system settings");

      // 2. Save membership tiers → bảng memberships
      const tierNames = ["bronze", "silver", "gold", "platinum"];
      const sortedDbTiers = [...dbTiers].sort((a, b) => Number(a.min_points_required) - Number(b.min_points_required));
      const tiersPayload = sortedDbTiers.map((dbTier, i) => ({
        id: dbTier.id,
        min_points_required: config.membershipTiers[tierNames[i] as keyof typeof config.membershipTiers]?.minSpent ?? dbTier.min_points_required,
        discount_rate: config.membershipTiers[tierNames[i] as keyof typeof config.membershipTiers]?.discount ?? dbTier.discount_rate,
      }));

      const memberRes = await apiCall<{ success: boolean; message: string }>(
        API_ENDPOINTS.MEMBERSHIPS,
        { method: "PUT", body: JSON.stringify({ tiers: tiersPayload }) }
      );
      if (!memberRes.success) throw new Error(memberRes.message || "Lỗi lưu membership tiers");

      Object.assign(systemConfig, config);
      toast({ title: "Đã lưu cấu hình", description: "Cấu hình hệ thống và hạng thành viên đã được cập nhật thành công" });

    } catch (error: any) {
      toast({ title: "Lỗi khi lưu", description: error.message || "Không thể cập nhật cấu hình hệ thống", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateMembershipTier = (tier: string, field: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      membershipTiers: {
        ...prev.membershipTiers,
        [tier]: {
          ...prev.membershipTiers[tier as keyof typeof prev.membershipTiers],
          [field]: value,
        },
      },
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cấu Hình Hệ Thống</h1>
        <p className="text-muted-foreground">
          Điều chỉnh các thông số hoạt động của hệ thống và giao diện
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl">
        {/* Hero Banner Manager */}
        <AdminHeroBanner />

        {/* Legal Compliance Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <CardTitle>Cấu Hình Tuân Thủ Pháp Luật</CardTitle>
                <CardDescription>
                  Các quy định về phân loại phim và giờ giới nghiêm
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="curfewU13">
                  Giờ giới nghiêm dưới 13 tuổi (HH:mm)
                </Label>
                <Input
                  id="curfewU13"
                  type="time"
                  value={config.curfewTimeU13}
                  onChange={(e) =>
                    updateConfig("curfewTimeU13", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Khách dưới 13 tuổi không được xem phim kết thúc sau giờ này
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="curfewU16">
                  Giờ giới nghiêm dưới 16 tuổi (HH:mm)
                </Label>
                <Input
                  id="curfewU16"
                  type="time"
                  value={config.curfewTimeU16}
                  onChange={(e) =>
                    updateConfig("curfewTimeU16", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Khách dưới 16 tuổi không được xem phim kết thúc sau giờ này
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vnQuota">Tỷ lệ phim Việt tối thiểu (%)</Label>
              <Input
                id="vnQuota"
                type="number"
                min="0"
                max="100"
                value={config.minVietnameseQuota}
                onChange={(e) =>
                  updateConfig("minVietnameseQuota", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Tỷ lệ tối thiểu suất chiếu phim Việt Nam theo quy định pháp luật
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Booking Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <CardTitle>Cấu Hình Đặt Vé</CardTitle>
                <CardDescription>
                  Các thông số liên quan đến quy trình đặt vé
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="seatHold">Thời gian giữ ghế (phút)</Label>
                <Input
                  id="seatHold"
                  type="number"
                  value={config.seatHoldDuration}
                  onChange={(e) =>
                    updateConfig("seatHoldDuration", Number(e.target.value))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Thời gian tối đa người dùng có thể giữ ghế trước khi thanh
                  toán
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cleanupTime">Thời gian dọn phòng (phút)</Label>
                <Input
                  id="cleanupTime"
                  type="number"
                  value={config.defaultCleanupDuration}
                  onChange={(e) =>
                    updateConfig(
                      "defaultCleanupDuration",
                      Number(e.target.value),
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Khoảng thời gian cần thiết để dọn dẹp giữa các suất chiếu
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cấu Hình Chatbot</CardTitle>
            <CardDescription>Giới hạn tra cứu và cách trợ lý điện ảnh trả lời khách.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="chatScheduleDays">Số ngày được tra cứu</Label>
              <Input id="chatScheduleDays" type="number" min={1} max={7} step={1}
                value={chatScheduleDays} onChange={event => setChatScheduleDays(Number(event.target.value))} />
              <p className="text-xs text-muted-foreground">Mặc định 7 ngày, gồm hôm nay và 6 ngày tiếp theo. Tối đa 1 tuần.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chatShowtimesPerDay">Số suất hiển thị mỗi ngày</Label>
              <Input id="chatShowtimesPerDay" type="number" min={1} max={20} step={1}
                value={chatShowtimesPerDay} onChange={event => setChatShowtimesPerDay(Number(event.target.value))} />
              <p className="text-xs text-muted-foreground">Từ 1 đến 20 suất. Khi còn kết quả, chatbot dẫn đến trang Lịch chiếu.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chatGroupBy">Nhóm suất chiếu theo</Label>
              <Select value={chatGroupBy} onValueChange={setChatGroupBy}>
                <SelectTrigger id="chatGroupBy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_movie">Ngày và phim</SelectItem>
                  <SelectItem value="date_cinema">Ngày và rạp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chatEmptyPolicy">Khi không có suất phù hợp</Label>
              <Select value={chatEmptyPolicy} onValueChange={setChatEmptyPolicy}>
                <SelectTrigger id="chatEmptyPolicy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggest_alternatives">Gợi ý ngày hoặc rạp khác</SelectItem>
                  <SelectItem value="report_only">Chỉ báo không có suất</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chatContextTtl">Thời hạn ngữ cảnh (phút)</Label>
              <Input id="chatContextTtl" type="number" min={1} max={120} step={1}
                value={chatContextTtl} onChange={event => setChatContextTtl(Number(event.target.value))} />
              <p className="text-xs text-muted-foreground">Tính từ lượt hỏi gần nhất. Mặc định 15 phút.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chatAmbiguityPolicy">Khi câu hỏi có nhiều cách hiểu</Label>
              <Select value={chatAmbiguityPolicy} onValueChange={setChatAmbiguityPolicy}>
                <SelectTrigger id="chatAmbiguityPolicy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clarify">Hỏi lại phim, rạp hoặc ngày</SelectItem>
                  <SelectItem value="first_match">Dùng kết quả nhận diện đầu tiên</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="chatShowReasons" checked={chatShowReasons} onCheckedChange={setChatShowReasons} />
              <Label htmlFor="chatShowReasons">Hiện lý do gợi ý phim</Label>
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Program Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <div>
                <CardTitle>Chương Trình Thành Viên</CardTitle>
                <CardDescription>
                  Cấu hình điểm tích lũy và hạng thành viên
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="pointsRate">
                Tỷ lệ quy đổi điểm (VNĐ = 1 điểm)
              </Label>
              <Input
                id="pointsRate"
                type="number"
                value={config.loyaltyPointsRate}
                onChange={(e) =>
                  updateConfig("loyaltyPointsRate", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Số tiền chi tiêu để nhận được 1 điểm tích lũy
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Cấu hình hạng thành viên</h4>

              {/* Bronze */}
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-3">
                <h5 className="font-medium text-orange-900">Hạng Đồng</h5>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Chi tiêu tối thiểu (VNĐ)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.bronze.minSpent}
                      onChange={(e) =>
                        updateMembershipTier(
                          "bronze",
                          "minSpent",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Giảm giá (%)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.bronze.discount}
                      onChange={(e) =>
                        updateMembershipTier(
                          "bronze",
                          "discount",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Silver */}
              <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg space-y-3">
                <h5 className="font-medium text-gray-900">Hạng Bạc</h5>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Chi tiêu tối thiểu (VNĐ)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.silver.minSpent}
                      onChange={(e) =>
                        updateMembershipTier(
                          "silver",
                          "minSpent",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Giảm giá (%)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.silver.discount}
                      onChange={(e) =>
                        updateMembershipTier(
                          "silver",
                          "discount",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Gold */}
              <div className="p-4 bg-yellow-50 border border-yellow-400 rounded-lg space-y-3">
                <h5 className="font-medium text-yellow-900">Hạng Vàng</h5>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Chi tiêu tối thiểu (VNĐ)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.gold.minSpent}
                      onChange={(e) =>
                        updateMembershipTier(
                          "gold",
                          "minSpent",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Giảm giá (%)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.gold.discount}
                      onChange={(e) =>
                        updateMembershipTier(
                          "gold",
                          "discount",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Platinum */}
              <div className="p-4 bg-purple-50 border border-purple-400 rounded-lg space-y-3">
                <h5 className="font-medium text-purple-900">Hạng Kim Cương</h5>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Chi tiêu tối thiểu (VNĐ)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.platinum.minSpent}
                      onChange={(e) =>
                        updateMembershipTier(
                          "platinum",
                          "minSpent",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Giảm giá (%)</Label>
                    <Input
                      type="number"
                      value={config.membershipTiers.platinum.discount}
                      onChange={(e) =>
                        updateMembershipTier(
                          "platinum",
                          "discount",
                          Number(e.target.value),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} size="lg" className="gap-2" disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Đang lưu..." : "Lưu Cấu Hình"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
