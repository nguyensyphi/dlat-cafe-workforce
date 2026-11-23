"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={handleLogout}
      disabled={loading}
      aria-label="Đăng xuất"
      title="Đăng xuất"
      className={compact ? "min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0 px-2.5 sm:px-3" : "min-h-[44px]"}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      <span className={compact ? "hidden sm:inline" : ""}>
        {loading ? "Đang thoát..." : "Đăng xuất"}
      </span>
    </Button>
  );
}

