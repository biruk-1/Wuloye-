import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHealth, getMetrics } from "@/services/endpoints";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function buildSeries(baseValue, spread = 12) {
  return Array.from({ length: 12 }, (_, index) => {
    const variance = Math.sin(index / 1.3) * spread + (Math.random() - 0.5) * spread;
    return Math.max(0, Math.round(baseValue + variance));
  });
}

function Sparkline({ values, colorClass }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-24 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={`${value}-${index}`}
          className={`flex-1 rounded-md ${colorClass}`}
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthError,
    error: healthErrorMessage,
  } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 15000,
  });

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    error: metricsErrorMessage,
  } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
    refetchInterval: 15000,
  });

  const health = healthData?.data;
  const metrics = metricsData?.data;
  const errorRate = metrics
    ? ((metrics.errorCount4xx + metrics.errorCount5xx) / Math.max(1, metrics.requestCount)) * 100
    : 0;

  const requestsSeries = useMemo(
    () => buildSeries(metrics?.requestCount ? metrics.requestCount / 60 : 120),
    [metrics?.requestCount]
  );
  const errorsSeries = useMemo(
    () => buildSeries(metrics ? metrics.errorCount4xx + metrics.errorCount5xx : 8, 4),
    [metrics]
  );

  const statusLabel = health?.status || "unknown";
  const statusVariant = statusLabel === "ok" ? "success" : "warning";
  const p95Value = metrics?.p95Ms || 0;
  const p95Progress = Math.min(100, (p95Value / 500) * 100);

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Dashboard</h3>
          <p className="text-sm text-slate-500">System-level health and traffic insight.</p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      {(healthLoading || metricsLoading) && (
        <p className="mb-4 text-sm text-slate-500">Loading live metrics...</p>
      )}

      {(healthError || metricsError) && (
        <p className="mb-4 text-sm text-rose-600">
          {healthErrorMessage?.message || metricsErrorMessage?.message || "Unable to load metrics."}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900 capitalize">{statusLabel}</p>
            <p className="mt-2 text-sm text-slate-500">Firestore: {health?.dependencies?.firestore || "unknown"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{metrics?.requestCount ?? "--"}</p>
            <p className="mt-2 text-sm text-slate-500">Last sample window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{errorRate.toFixed(2)}%</p>
            <p className="mt-2 text-sm text-slate-500">
              {metrics ? metrics.errorCount4xx + metrics.errorCount5xx : "--"} errors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>P95 Latency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{p95Value} ms</p>
            <Progress className="mt-3" value={p95Progress} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests over time</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={requestsSeries} colorClass="bg-sky-300" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Errors over time</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={errorsSeries} colorClass="bg-rose-300" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
