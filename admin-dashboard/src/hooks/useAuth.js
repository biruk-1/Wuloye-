import { useAuthContext } from "@/context/AuthContext";

export function useAuth() {
  const context = useAuthContext();
  if (context) return context;

  const token = window.localStorage.getItem("adminToken") || "";

  const setToken = (value) => {
    const nextToken = (value || "").trim();
    if (nextToken) {
      window.localStorage.setItem("adminToken", nextToken);
    } else {
      window.localStorage.removeItem("adminToken");
    }
  };

  const clearToken = () => {
    window.localStorage.removeItem("adminToken");
  };

  return {
    token,
    isAuthenticated: Boolean(token),
    setToken,
    clearToken,
  };
}
