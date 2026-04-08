import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function AdminGate() {
  const { isAuthenticated, setToken } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Paste a Firebase ID token to continue.");
      return;
    }
    setToken(trimmed);
    setError("");
  };

  if (isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Sign in with a Firebase ID token that has admin access.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
              placeholder="Paste Firebase ID token"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <p className="mt-4 text-xs text-slate-400">
            Access is granted for tokens with admin claims or emails listed in
            the backend `ADMIN_EMAILS` setting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
