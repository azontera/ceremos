"use client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="nav-item"
      style={{ marginTop: 6 }}
      title="ログアウト"
      onClick={async () => {
        await fetch("/api/v1/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      <span aria-hidden>↩</span><span className="nav-label">ログアウト</span>
    </button>
  );
}
