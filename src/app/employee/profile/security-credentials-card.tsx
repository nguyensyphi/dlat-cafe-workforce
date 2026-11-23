"use client";

import { useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordPinModal } from "@/components/auth/change-password-pin-modal";

export function SecurityCredentialsCard({
  hasEmployeeProfile,
}: {
  hasEmployeeProfile: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<"password" | "pin">("password");

  function openTab(tab: "password" | "pin") {
    setDefaultTab(tab);
    setModalOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Bảo mật tài khoản — Mật khẩu &amp; Mã PIN</span>
          </CardTitle>
          <CardDescription>
            Đổi mật khẩu đăng nhập hệ thống và mã PIN đăng ký ca rảnh hàng tuần
            (mặc định ban đầu là 4 số cuối SĐT).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => openTab("password")}
            className="min-h-[44px]"
          >
            <Lock className="h-4 w-4" />
            <span>Đổi mật khẩu đăng nhập</span>
          </Button>
          {hasEmployeeProfile && (
            <Button
              type="button"
              variant="outline"
              onClick={() => openTab("pin")}
              className="min-h-[44px]"
            >
              <KeyRound className="h-4 w-4" />
              <span>Đổi mã PIN đăng ký ca</span>
            </Button>
          )}
        </CardContent>
      </Card>

      <ChangePasswordPinModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        hasEmployeeProfile={hasEmployeeProfile}
        defaultTab={defaultTab}
      />
    </>
  );
}
