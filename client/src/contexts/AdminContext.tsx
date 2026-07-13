import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const ADMIN_TOKEN_KEY = "kna_admin_token";

interface AdminContextType {
  isAdmin: boolean;
  isVerifying: boolean;
  token: string | null;
  pendingOtp: boolean;
  login: (password: string) => Promise<"ok" | "otp_required" | "error">;
  verifyOtp: (code: string, trustDevice?: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [pendingOtp, setPendingOtp] = useState(false);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!storedToken) { setIsVerifying(false); return; }
      try {
        const response = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: storedToken }),
        });
        const data = await response.json();
        if (data.valid) {
          setIsAdmin(true);
          setToken(storedToken);
        } else {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      } finally {
        setIsVerifying(false);
      }
    };
    verifyToken();
  }, []);

  const login = async (password: string): Promise<"ok" | "otp_required" | "error"> => {
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) return "error";
      const data = await response.json();
      if (data.requiresOtp) {
        setPendingOtp(true);
        setPendingChallengeId(data.challengeId ?? null);
        return "otp_required";
      }
      if (data.token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setToken(data.token);
        setIsAdmin(true);
        return "ok";
      }
      return "error";
    } catch {
      return "error";
    }
  };

  const verifyOtp = async (code: string, trustDevice = false): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch("/api/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: pendingChallengeId, code, trustDevice }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { ok: false, error: data.error ?? "코드가 올바르지 않거나 만료되었습니다." };
      }
      if (data.token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setToken(data.token);
        setIsAdmin(true);
        setPendingOtp(false);
        setPendingChallengeId(null);
        return { ok: true };
      }
      return { ok: false, error: "코드가 올바르지 않거나 만료되었습니다." };
    } catch {
      return { ok: false, error: "네트워크 오류가 발생했습니다." };
    }
  };

  const logout = () => {
    fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setIsAdmin(false);
    setPendingOtp(false);
    setPendingChallengeId(null);
  };

  return (
    <AdminContext.Provider value={{ isAdmin, isVerifying, token, pendingOtp, login, verifyOtp, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin must be used within an AdminProvider");
  return context;
}
