import React, { useState, useEffect, useCallback } from "react";
import { Building2, Save, Loader2, MapPin, Phone, Map, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { API_ENDPOINTS, apiCall } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import LocationPickerMap from "@/components/cinema/LocationPickerMap";
import { usePermissions } from "@/hooks/usePermissions";

interface CinemaDetail {
  id: number;
  name: string;
  address: string;
  street: string | null;
  district: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  hotline: string | null;
  status: string;
  hall_count: number;
}

const ManagerCinema: React.FC = () => {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission("cinemas.update");
  const [cinema, setCinema] = useState<CinemaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    street: "",
    district: "",
    city: "",
    hotline: "",
    lat: null as number | null,
    lng: null as number | null,
  });

  const fetchCinema = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall<{
        success: boolean;
        data: { cinema: CinemaDetail };
      }>(API_ENDPOINTS.MANAGER_CINEMA_INFO);
      if (res.success && res.data?.cinema) {
        const c = res.data.cinema;
        setCinema(c);
        setFormData({
          name: c.name || "",
          address: c.address || "",
          street: c.street || "",
          district: c.district || "",
          city: c.city || "",
          hotline: c.hotline || "",
          lat: c.lat ? Number(c.lat) : null,
          lng: c.lng ? Number(c.lng) : null,
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error
            ? error.message
            : "Không thể tải thông tin rạp",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCinema();
  }, [fetchCinema]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Tên rạp không được để trống",
        variant: "destructive",
      });
      return;
    }
    if (!formData.address.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Địa chỉ không được để trống",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        street: formData.street.trim() || null,
        district: formData.district.trim() || null,
        city: formData.city.trim() || null,
        hotline: formData.hotline.trim() || null,
        lat: formData.lat,
        lng: formData.lng,
      };

      const res = await apiCall<{
        success: boolean;
        data: { cinema: CinemaDetail };
      }>(API_ENDPOINTS.MANAGER_CINEMA_UPDATE, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.success && res.data?.cinema) {
        setCinema(res.data.cinema);
      }

      toast({
        title: "Thành công",
        description: "Thông tin rạp đã được cập nhật",
      });
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description:
          error instanceof Error
            ? error.message
            : "Không thể cập nhật thông tin rạp",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500 text-white">Hoạt động</Badge>;
      case "maintenance":
        return <Badge className="bg-yellow-500 text-white">Bảo trì</Badge>;
      case "closed":
        return <Badge variant="secondary">Đã đóng</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const addressForSearch =
    [formData.street, formData.district, formData.city]
      .filter(Boolean)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ") || formData.address;

  if (!canUpdate) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Truy Cập Bị Từ Chối
          </h2>
          <p className="text-slate-500 max-w-md text-sm">
            Vai trò hiện tại của bạn không có quyền cập nhật thông tin rạp (yêu cầu quyền: <code className="text-destructive font-mono font-bold">cinemas.update</code>).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!cinema) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Không tìm thấy thông tin rạp được gán cho tài khoản của bạn.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-orange-500" />
            Cập Nhật Rạp
          </h1>
          <p className="text-muted-foreground">
            Chỉnh sửa thông tin rạp chiếu phim của bạn
          </p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(cinema.status)}
          <Badge variant="outline">{cinema.hall_count} phòng chiếu</Badge>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" />
              Thông Tin Cơ Bản
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Tên rạp *</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Galaxy Cinema Nguyễn Du"
              />
            </div>

            <div className="grid gap-2">
              <Label>Địa chỉ đầy đủ *</Label>
              <Input
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="116 Nguyễn Du, Quận 1, TP.HCM"
              />
            </div>

            <div className="grid gap-2">
              <Label>Đường / Số nhà</Label>
              <Input
                value={formData.street}
                onChange={(e) =>
                  setFormData({ ...formData, street: e.target.value })
                }
                placeholder="116 Nguyễn Du"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quận / Huyện</Label>
                <Input
                  value={formData.district}
                  onChange={(e) =>
                    setFormData({ ...formData, district: e.target.value })
                  }
                  placeholder="Quận 1"
                />
              </div>
              <div className="grid gap-2">
                <Label>Thành phố / Tỉnh</Label>
                <Input
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  placeholder="TP. Hồ Chí Minh"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="flex items-center gap-1">
                <Phone className="w-4 h-4" /> Hotline
              </Label>
              <Input
                value={formData.hotline}
                onChange={(e) =>
                  setFormData({ ...formData, hotline: e.target.value })
                }
                placeholder="1900 2224"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-orange-500 hover:bg-orange-600 mt-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Lưu Thay Đổi
            </Button>
          </CardContent>
        </Card>

        {/* Right: Map */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Map className="w-5 h-5 text-orange-500" />
              Vị Trí Trên Bản Đồ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Nhấp vào bản đồ hoặc tìm kiếm để chọn vị trí rạp
            </p>
            <LocationPickerMap
              lat={formData.lat}
              lng={formData.lng}
              onChange={(lat, lng) => setFormData(prev => ({ ...prev, lat, lng }))}
              className="h-[400px] rounded-lg"
              addressToSearch={addressForSearch}
            />
            {formData.lat && formData.lng && (
              <p className="text-xs text-muted-foreground mt-2">
                Tọa độ: {formData.lat.toFixed(6)}, {formData.lng.toFixed(6)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ManagerCinema;
