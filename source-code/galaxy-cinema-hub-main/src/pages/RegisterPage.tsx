import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Film,
  Eye,
  EyeOff,
  Mail,
  User as UserIcon,
  Phone,
  Calendar,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_ENDPOINTS } from "@/lib/api";

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    dob: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  
  // Verification states
  const [step, setStep] = useState<"form" | "verify">("form");
  const [verificationCode, setVerificationCode] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập họ tên",
        variant: "destructive",
      });
      return false;
    }

    if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast({
        title: "Lỗi",
        description: "Email không hợp lệ",
        variant: "destructive",
      });
      return false;
    }

    if (!formData.phone.match(/^[0-9]{10,11}$/)) {
      toast({
        title: "Lỗi",
        description: "Số điện thoại không hợp lệ (10-11 số)",
        variant: "destructive",
      });
      return false;
    }

    if (!formData.dob) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập ngày sinh",
        variant: "destructive",
      });
      return false;
    }

    // Validate age only for impossible values
    const birthDate = new Date(formData.dob);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    const calculatedAge =
      monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

    if (calculatedAge > 100) {
      toast({
        title: "Lỗi",
        description: "Ngày sinh không hợp lệ",
        variant: "destructive",
      });
      return false;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Lỗi",
        description: "Mật khẩu phải có ít nhất 6 ký tự",
        variant: "destructive",
      });
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Lỗi",
        description: "Mật khẩu xác nhận không khớp",
        variant: "destructive",
      });
      return false;
    }

    if (!acceptTerms) {
      toast({
        title: "Lỗi",
        description: "Vui lòng đồng ý với điều khoản sử dụng",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Countdown timer effect
  useEffect(() => {
    if (step === "verify" && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCanResend(true);
    }
  }, [countdown, step]);

  // Send verification code
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.SEND_VERIFICATION, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          dob: formData.dob,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Thành công!",
          description: "Mã xác minh đã được gửi đến email của bạn",
        });
        setStep("verify");
        setCountdown(60);
        setCanResend(false);
      } else {
        toast({
          title: "Lỗi",
          description: data.message || "Không thể gửi mã xác minh",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể kết nối đến server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Verify code and create account
  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Lỗi",
        description: "Mã xác minh phải có 6 số",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.VERIFY_EMAIL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          code: verificationCode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Đăng ký thành công!",
          description: "Tài khoản của bạn đã được tạo. Vui lòng đăng nhập.",
        });
        setTimeout(() => {
          navigate("/login");
        }, 1000);
      } else {
        toast({
          title: "Lỗi",
          description: data.message || "Mã xác minh không đúng",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể kết nối đến server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend verification code
  const handleResendCode = async () => {
    setIsLoading(true);
    setCanResend(false);
    setCountdown(60);

    try {
      const response = await fetch(API_ENDPOINTS.SEND_VERIFICATION, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          dob: formData.dob,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Thành công!",
          description: "Mã xác minh mới đã được gửi",
        });
      } else {
        toast({
          title: "Lỗi",
          description: data.message || "Không thể gửi lại mã",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể kết nối đến server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Back to form
  const handleBackToForm = () => {
    setStep("form");
    setVerificationCode("");
    setCountdown(60);
    setCanResend(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-cinema relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920')] bg-cover bg-center opacity-30" />
        <div className="relative z-10 flex flex-col justify-center items-center text-center p-12 w-full">
          <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-6 glow-orange">
            <Film className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 text-center">
            Galaxy Cinema
          </h1>
          <p className="text-white/80 text-lg max-w-md text-center mx-auto">
            Tham gia cộng đồng yêu điện ảnh lớn nhất Việt Nam và nhận ngay ưu
            đãi hấp dẫn
          </p>

          <div className="mt-8 space-y-3 text-left max-w-md mx-auto">
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                ✓
              </div>
              <span>Đặt vé nhanh chóng, tiện lợi</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                ✓
              </div>
              <span>Tích điểm và nhận ưu đãi</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                ✓
              </div>
              <span>Thông tin phim mới nhất</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Register Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <Film className="w-7 h-7 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-foreground">
                Galaxy Cinema
              </span>
            </Link>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {step === "form" ? "Đăng Ký Tài Khoản" : "Xác Minh Email"}
            </h2>
            <p className="text-muted-foreground">
              {step === "form"
                ? "Tạo tài khoản mới để bắt đầu"
                : `Nhập mã xác minh đã gửi đến ${formData.email}`}
            </p>
          </div>

          {step === "form" ? (
            // STEP 1: Registration Form
            <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ và tên</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="Nguyễn Văn A"
                  className="h-12 pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  className="h-12 pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  maxLength={11}
                  placeholder="0912345678"
                  className="h-12 pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob">Ngày sinh</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="dob"
                  name="dob"
                  type="date"
                  value={formData.dob}
                  onChange={handleChange}
                  max={new Date().toISOString().split("T")[0]}
                  className="h-12 pl-10"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ngày sinh dùng để kiểm tra độ tuổi khi đặt vé phim
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="h-12 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="h-12 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <label
                htmlFor="terms"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Tôi đồng ý với{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowTermsDialog(true);
                  }}
                  className="text-primary hover:underline"
                >
                  Điều khoản dịch vụ
                </a>{" "}
                và{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPrivacyDialog(true);
                  }}
                  className="text-primary hover:underline"
                >
                  Chính sách bảo mật
                </a>
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isLoading ? "Đang gửi mã..." : "Tiếp Theo"}
            </Button>
          </form>
          ) : (
            // STEP 2: Verification Code
            <div className="space-y-6">
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <div className="flex items-center justify-center mb-4">
                  <Mail className="w-12 h-12 text-primary" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Chúng tôi đã gửi mã xác minh gồm 6 số đến email của bạn.
                  <br />
                  Vui lòng kiểm tra hộp thư và nhập mã để hoàn tất đăng ký.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verificationCode">Mã xác minh</Label>
                <Input
                  id="verificationCode"
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    setVerificationCode(value);
                  }}
                  placeholder="000000"
                  className="h-14 text-center text-2xl font-bold tracking-widest"
                  autoFocus
                />
              </div>

              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Mã có hiệu lực trong{" "}
                    <span className="font-semibold text-primary">
                      {countdown}s
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Mã đã hết hạn.{" "}
                    {canResend && (
                      <button
                        onClick={handleResendCode}
                        disabled={isLoading}
                        className="text-primary hover:underline font-semibold"
                      >
                        Gửi lại mã
                      </button>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleVerifyCode}
                  disabled={isLoading || verificationCode.length !== 6}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {isLoading ? "Đang xác minh..." : "Xác Nhận"}
                </Button>

                <Button
                  type="button"
                  onClick={handleBackToForm}
                  variant="outline"
                  className="w-full h-12"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Quay lại
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>💡 Mẹo:</strong> Nếu không thấy email, hãy kiểm tra
                  thư mục Spam hoặc Junk. Email có thể mất 1-2 phút để đến.
                </p>
              </div>
            </div>
          )}

          {step === "form" && (
            <>
              <p className="text-center mt-6 text-muted-foreground">
                Đã có tài khoản?{" "}
                <Link
                  to="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Đăng nhập ngay
                </Link>
              </p>

              <Link
                to="/"
                className="block text-center mt-4 text-sm text-muted-foreground hover:text-foreground"
              >
                ← Quay về trang chủ
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Terms of Service Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Điều Khoản Dịch Vụ
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-bold text-base mb-2">1. Giới Thiệu</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Chào mừng bạn đến với Galaxy Cinema. Bằng việc truy cập và sử dụng
                  dịch vụ của chúng tôi, bạn đồng ý tuân thủ các điều khoản và điều
                  kiện được nêu dưới đây. Vui lòng đọc kỹ trước khi sử dụng dịch vụ.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">2. Tài Khoản Người Dùng</h3>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Bạn phải cung cấp thông tin chính xác, đầy đủ khi đăng ký tài khoản.
                  </li>
                  <li>
                    Bạn có trách nhiệm bảo mật thông tin đăng nhập và chịu trách nhiệm
                    về mọi hoạt động diễn ra dưới tài khoản của mình.
                  </li>
                  <li>
                    Bạn phải từ 13 tuổi trở lên để đăng ký tài khoản. Đối với người dưới
                    18 tuổi, cần có sự đồng ý của phụ huynh hoặc người giám hộ.
                  </li>
                  <li>
                    Nghiêm cấm việc sử dụng tài khoản cho mục đích bất hợp pháp hoặc vi
                    phạm điều khoản dịch vụ.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">3. Dịch Vụ Đặt Vé</h3>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Vé đã đặt không thể hoàn lại hoặc đổi trừ trường hợp đặc biệt được
                    quy định bởi Galaxy Cinema.
                  </li>
                  <li>
                    Giá vé và suất chiếu có thể thay đổi mà không cần thông báo trước.
                  </li>
                  <li>
                    Bạn cần xuất trình mã QR hoặc mã đặt vé hợp lệ khi nhận vé tại rạp.
                  </li>
                  <li>
                    Galaxy Cinema có quyền từ chối cung cấp dịch vụ nếu phát hiện hành vi
                    gian lận hoặc lạm dụng.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">4. Thanh Toán</h3>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Chúng tôi chấp nhận các phương thức thanh toán: thẻ tín dụng/ghi nợ,
                    ví điện tử, và chuyển khoản ngân hàng.
                  </li>
                  <li>
                    Mọi giao dịch đều được mã hóa và bảo mật theo tiêu chuẩn quốc tế.
                  </li>
                  <li>
                    Bạn chịu trách nhiệm về các khoản phí phát sinh từ phương thức thanh
                    toán của mình.
                  </li>
                  <li>
                    Trong trường hợp giao dịch thất bại, vui lòng liên hệ bộ phận hỗ trợ
                    khách hàng.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">5. Quyền Sở Hữu Trí Tuệ</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Tất cả nội dung trên website bao gồm văn bản, hình ảnh, logo, và các
                  tài liệu khác đều thuộc quyền sở hữu của Galaxy Cinema. Nghiêm cấm
                  mọi hành vi sao chép, phân phối, hoặc sử dụng cho mục đích thương mại
                  mà không có sự cho phép bằng văn bản.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">6. Giới Hạn Trách Nhiệm</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Galaxy Cinema không chịu trách nhiệm về bất kỳ thiệt hại trực tiếp,
                  gián tiếp, ngẫu nhiên, hoặc hậu quả phát sinh từ việc sử dụng hoặc
                  không thể sử dụng dịch vụ của chúng tôi. Chúng tôi cũng không đảm bảo
                  rằng dịch vụ sẽ không bị gián đoạn hoặc không có lỗi.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">7. Thay Đổi Điều Khoản</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Galaxy Cinema có quyền cập nhật các điều khoản dịch vụ này bất kỳ lúc
                  nào. Các thay đổi sẽ có hiệu lực ngay khi được đăng tải trên website.
                  Việc bạn tiếp tục sử dụng dịch vụ sau khi có thay đổi đồng nghĩa với
                  việc bạn chấp nhận các điều khoản mới.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">8. Liên Hệ</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Nếu bạn có bất kỳ câu hỏi nào về Điều Khoản Dịch Vụ, vui lòng liên hệ
                  với chúng tôi qua:
                </p>
                <ul className="list-none pl-0 mt-2 space-y-1 text-muted-foreground">
                  <li>• Email: support@galaxycinema.vn</li>
                  <li>• Hotline: 1900 2224</li>
                  <li>• Địa chỉ: Tầng 2, Tòa nhà Galaxy, Quận 1, TP.HCM</li>
                </ul>
              </section>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground italic">
                  Điều khoản có hiệu lực từ ngày 01/01/2026
                </p>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Chính Sách Bảo Mật
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-bold text-base mb-2">1. Thu Thập Thông Tin</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Galaxy Cinema thu thập các loại thông tin sau từ người dùng:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Thông tin cá nhân:</strong> Họ tên, email, số điện thoại,
                    ngày sinh, địa chỉ khi bạn đăng ký tài khoản.
                  </li>
                  <li>
                    <strong>Thông tin giao dịch:</strong> Lịch sử đặt vé, phương thức
                    thanh toán, và các giao dịch khác.
                  </li>
                  <li>
                    <strong>Thông tin kỹ thuật:</strong> Địa chỉ IP, loại trình duyệt,
                    thiết bị, hệ điều hành, và thông tin truy cập website.
                  </li>
                  <li>
                    <strong>Cookies:</strong> Chúng tôi sử dụng cookies để cải thiện trải
                    nghiệm người dùng và phân tích hành vi sử dụng.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">2. Mục Đích Sử Dụng</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Thông tin được thu thập sẽ được sử dụng cho các mục đích sau:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Xử lý đặt vé và quản lý tài khoản người dùng.</li>
                  <li>Gửi thông báo về giao dịch, suất chiếu mới, và các chương trình khuyến mãi.</li>
                  <li>Cải thiện chất lượng dịch vụ và trải nghiệm người dùng.</li>
                  <li>Phân tích dữ liệu để hiểu rõ hơn về nhu cầu và sở thích khách hàng.</li>
                  <li>Tuân thủ các quy định pháp luật và yêu cầu của cơ quan có thẩm quyền.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">3. Bảo Vệ Thông Tin</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Galaxy Cinema cam kết bảo vệ thông tin cá nhân của bạn bằng các biện pháp sau:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Mã hóa dữ liệu nhạy cảm bằng giao thức SSL/TLS trong quá trình truyền tải.
                  </li>
                  <li>
                    Lưu trữ dữ liệu trên máy chủ an toàn với các biện pháp bảo mật vật lý và kỹ thuật.
                  </li>
                  <li>
                    Giới hạn quyền truy cập thông tin chỉ cho nhân viên có thẩm quyền và cần thiết.
                  </li>
                  <li>
                    Thường xuyên kiểm tra và cập nhật các biện pháp bảo mật để chống lại các mối đe dọa mới.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">4. Chia Sẻ Thông Tin</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Chúng tôi có thể chia sẻ thông tin của bạn trong các trường hợp sau:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Đối tác thanh toán:</strong> Để xử lý giao dịch thanh toán an toàn.
                  </li>
                  <li>
                    <strong>Nhà cung cấp dịch vụ:</strong> Các đối tác hỗ trợ vận hành website, gửi email, và phân tích dữ liệu.
                  </li>
                  <li>
                    <strong>Yêu cầu pháp lý:</strong> Khi có yêu cầu từ cơ quan có thẩm quyền hoặc để tuân thủ pháp luật.
                  </li>
                  <li>
                    <strong>Với sự đồng ý của bạn:</strong> Trong các trường hợp khác, chúng tôi sẽ xin phép trước khi chia sẻ.
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-2">
                  Galaxy Cinema không bán hoặc cho thuê thông tin cá nhân của bạn cho bên thứ ba cho mục đích marketing.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">5. Quyền Của Người Dùng</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Bạn có các quyền sau đối với thông tin cá nhân của mình:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Quyền truy cập:</strong> Yêu cầu xem thông tin cá nhân mà chúng tôi đang lưu trữ.
                  </li>
                  <li>
                    <strong>Quyền chỉnh sửa:</strong> Cập nhật hoặc sửa đổi thông tin không chính xác.
                  </li>
                  <li>
                    <strong>Quyền xóa:</strong> Yêu cầu xóa thông tin cá nhân (trừ khi pháp luật yêu cầu lưu trữ).
                  </li>
                  <li>
                    <strong>Quyền phản đối:</strong> Từ chối việc xử lý dữ liệu cho mục đích marketing.
                  </li>
                  <li>
                    <strong>Quyền rút lại đồng ý:</strong> Rút lại sự đồng ý đã cung cấp trước đó.
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-2">
                  Để thực hiện các quyền trên, vui lòng liên hệ với chúng tôi qua email: privacy@galaxycinema.vn
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">6. Cookies và Công Nghệ Theo Dõi</h3>
                <p className="text-muted-foreground leading-relaxed mb-2">
                  Chúng tôi sử dụng cookies và các công nghệ tương tự để:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Lưu trữ thông tin đăng nhập và tùy chọn của bạn.</li>
                  <li>Phân tích lưu lượng truy cập và hành vi người dùng.</li>
                  <li>Cá nhân hóa nội dung và quảng cáo.</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-2">
                  Bạn có thể tắt cookies trong cài đặt trình duyệt, nhưng điều này có thể ảnh hưởng đến trải nghiệm sử dụng website.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">7. Lưu Trữ Dữ Liệu</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Chúng tôi lưu trữ thông tin cá nhân của bạn trong thời gian cần thiết để cung cấp dịch vụ và tuân thủ nghĩa vụ pháp lý. 
                  Sau khi không còn cần thiết, dữ liệu sẽ được xóa hoặc ẩn danh hóa một cách an toàn.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">8. Thay Đổi Chính Sách</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Galaxy Cinema có thể cập nhật Chính Sách Bảo Mật này theo thời gian. 
                  Chúng tôi sẽ thông báo về các thay đổi quan trọng qua email hoặc thông báo trên website. 
                  Phiên bản mới nhất sẽ luôn được đăng tải tại trang này.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-base mb-2">9. Liên Hệ</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Nếu bạn có câu hỏi hoặc thắc mắc về Chính Sách Bảo Mật, vui lòng liên hệ:
                </p>
                <ul className="list-none pl-0 mt-2 space-y-1 text-muted-foreground">
                  <li>• Email: privacy@galaxycinema.vn</li>
                  <li>• Hotline: 1900 2224</li>
                  <li>• Địa chỉ: Tầng 2, Tòa nhà Galaxy, Quận 1, TP.HCM</li>
                </ul>
              </section>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground italic">
                  Chính sách có hiệu lực từ ngày 01/01/2026 - Cập nhật lần cuối: 10/02/2026
                </p>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegisterPage;
