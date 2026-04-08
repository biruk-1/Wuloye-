import { createContext, useContext, useMemo, useState } from "react";

export const AuthContext = createContext(null);

export function useAuthContext() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => window.localStorage.getItem("adminToken") || "");

  const setToken = (value) => {
    const nextToken = (value || "").trim();
    if (nextToken) {
      window.localStorage.setItem("adminToken", nextToken);
    } else {
      window.localStorage.removeItem("adminToken");
    }
    setTokenState(nextToken);
  };

  const clearToken = () => {
    window.localStorage.removeItem("adminToken");
    setTokenState("");
  };

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      setToken,
      clearToken,
    }),
    [token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
