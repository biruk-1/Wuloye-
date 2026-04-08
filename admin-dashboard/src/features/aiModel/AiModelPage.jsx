import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AiModelPage() {
  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-slate-900">AI Model</h3>
        <p className="text-sm text-slate-500">Inspect model versions and training status.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Model Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No model telemetry connected yet.</p>
        </CardContent>
      </Card>
    </section>
  );
}
