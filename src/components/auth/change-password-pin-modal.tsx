"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ChangePasswordPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasEmployeeProfile: boolean;
  defaultTab?: "password" | "pin";
}

export function ChangePasswordPinModal({
  open,
  onOpenChange,
  hasEmployeeProfile,
  defaultTab = "password",
}: ChangePasswordPinModalProps) {
  const [tab, setTab] = useState<"password" | "pin">(
    hasEmployeeProfile ? defaultTab : "password",
  );

  useEffect(() => {
    if (open) {
      setTab(hasEmployeeProfile ? defaultTab : "password");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open, defaultTab, hasEmployeeProfile]);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // PIN state
  const [pinCurrentPassword, setPinCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function resetMessages() {
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  function handleTabChange(nextTab: "password" | "pin") {
    setTab(nextTab);
    resetMessages();
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPinCurrentPassword("");
      setNewPin("");
      setConfirmPin("");
      resetMessages();
    }
    onOpenChange(nextOpen);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    resetMessages();

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error?.message ?? "Không thể đổi mật khẩu");
        return;
      }
      setSuccessMsg("Đã đổi mật khẩu đăng nhập thành công!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    resetMessages();

    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pinCurrentPassword,
          newPin,
          confirmPin,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error?.message ?? "Không thể đổi mã PIN");
        return;
      }
      setSuccessMsg(
        "Đã cập nhật mã PIN đăng ký ca mới! Hãy dùng mã PIN này khi đăng ký lịch rảnh.",
      );
      setPinCurrentPassword("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  const pwChecks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /\d/.test(newPassword),
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span>Bảo mật tài khoản — Đổi Mật khẩu &amp; PIN</span>
          </DialogTitle>
          <DialogDescription>
            Cập nhật mật khẩu đăng nhập và mã PIN đăng ký ca để đảm bảo an toàn
            khi vận hành.
          </DialogDescription>
        </DialogHeader>

        {hasEmployeeProfile && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleTabChange("password")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                tab === "password"
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Đổi Mật khẩu</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("pin")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                tab === "pin"
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Đổi Mã PIN</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {tab === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Mật khẩu hiện tại</Label>
              <Input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-new">Mật khẩu mới</Label>
              <Input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <ul className="grid grid-cols-2 gap-1 text-[11px] pt-1">
                <li
                  className={
                    pwChecks.length ? "text-emerald-700" : "text-slate-400"
                  }
                >
                  • Tối thiểu 8 ký tự
                </li>
                <li
                  className={
                    pwChecks.upper ? "text-emerald-700" : "text-slate-400"
                  }
                >
                  • Có chữ hoa (A-Z)
                </li>
                <li
                  className={
                    pwChecks.lower ? "text-emerald-700" : "text-slate-400"
                  }
                >
                  • Có chữ thường (a-z)
                </li>
                <li
                  className={
                    pwChecks.digit ? "text-emerald-700" : "text-slate-400"
                  }
                >
                  • Có chữ số (0-9)
                </li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Nhập lại mật khẩu mới</Label>
              <Input
                id="cp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Đóng
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Lưu mật khẩu mới"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Mã PIN dùng để xác thực nhanh khi đăng ký ca rảnh hàng tuần. Mặc
              định ban đầu là 4 số cuối SĐT; bạn có thể đổi sang mã PIN 4–6 số
              riêng của mình.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="pin-current-pw">
                Mật khẩu đăng nhập hiện tại (để xác thực)
              </Label>
              <Input
                id="pin-current-pw"
                type="password"
                autoComplete="current-password"
                value={pinCurrentPassword}
                onChange={(e) => setPinCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pin-new">Mã PIN mới (4–6 chữ số)</Label>
              <Input
                id="pin-new"
                type="password"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="Ví dụ: 2589"
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pin-confirm">Nhập lại mã PIN mới</Label>
              <Input
                id="pin-confirm"
                type="password"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="Nhập lại mã PIN"
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Đóng
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Lưu mã PIN mới"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
