import { useMemo } from "react";

export function useAuth() {
  const token = window.localStorage.getItem("adminToken");

  return useMemo(
    () => ({
      isAuthenticated: Boolean(token),
      token,
    }),
    [token]
  );
}
