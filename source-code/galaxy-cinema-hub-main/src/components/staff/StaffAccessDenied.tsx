import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AppContext";

interface StaffAccessDeniedProps {
  title?: string;
  description?: string;
  requiredPermission?: string;
  returnPath?: string;
  returnLabel?: string;
}

export const StaffAccessDenied: React.FC<StaffAccessDeniedProps> = ({
  title = "Bạn không có quyền truy cập chức năng này",
  description,
  requiredPermission,
  returnPath = "/staff/scanner",
  returnLabel = "Chuyển sang Quét Vé",
}) => {
  const { user } = useAuth();
  const primaryRole =
    user?.roles?.[0]?.display_name || user?.roles?.[0]?.name || "Nhân viên";

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 animate-in fade-in duration-300">
      <Card className="border-destructive/30 bg-destructive/5 shadow-sm text-center">
        <CardContent className="pt-10 pb-10 px-6 sm:px-12 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-5 ring-8 ring-destructive/5">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            {title}
          </h2>

          <p className="text-base text-gray-600 max-w-xl mb-4 leading-relaxed">
            {description || (
              <>
                Tài khoản của bạn <strong>{user?.name || user?.email}</strong>{" "}
                (Vai trò:{" "}
                <span className="font-semibold text-primary">{primaryRole}</span>
                ) hiện chưa được cấp quyền truy cập chức năng này. Vui lòng liên hệ
                Quản lý rạp hoặc Quản trị viên để được phân quyền!
              </>
            )}
          </p>

          {requiredPermission && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border text-xs font-mono text-muted-foreground mb-6 shadow-sm">
              <span>Mã quyền hạn yêu cầu:</span>
              <code className="text-destructive font-semibold">
                {requiredPermission}
              </code>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Link to={returnPath} className="flex items-center gap-2">
                <QrCode className="w-4 h-4" />
                {returnLabel}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Về Trang Chủ
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffAccessDenied;
