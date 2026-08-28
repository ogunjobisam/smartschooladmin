import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel, StudentPerformance } from "@/lib/performance";

const RISK_STYLES: Record<RiskLevel, { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-success/10 text-success border-success/20" },
  watch: { label: "Watch", className: "bg-warning/10 text-warning border-warning/20" },
  at_risk: { label: "Needs attention", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const style = RISK_STYLES[level];
  return <Badge variant="outline" className={style.className}>{style.label}</Badge>;
}

function TrendIcon({ direction }: { direction: StudentPerformance["trend"]["direction"] }) {
  if (direction === "improving") return <TrendingUp className="h-4 w-4 text-success" />;
  if (direction === "declining") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function trendLabel(trend: StudentPerformance["trend"]): string {
  if (trend.direction === "unknown") return "Not enough history yet";
  if (trend.direction === "steady") return "Holding steady";
  const verb = trend.direction === "improving" ? "Up" : "Down";
  return `${verb} ${Math.abs(trend.change ?? 0)} points since last term`;
}

interface Props {
  performance: StudentPerformance;
  isLoading?: boolean;
  /** Optional class position, when the caller knows the cohort. */
  position?: { position: number | null; outOf: number };
}

export function PerformanceSummary({ performance, isLoading, position }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (performance.average === null && performance.attendance.total === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No performance data yet"
        description="Once exam scores are entered and attendance is marked, this student's averages, subject strengths and term-on-term trend will appear here."
      />
    );
  }

  const chartData = performance.periods
    .filter((p) => p.average !== null)
    .map((p) => ({ name: p.periodName, average: p.average as number }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Overall average</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
              {performance.average === null ? "—" : `${performance.average}%`}
            </p>
            <p className="text-xs text-muted-foreground">Grade {performance.grade}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Trend</p>
            <div className="mt-1 flex items-center gap-2">
              <TrendIcon direction={performance.trend.direction} />
              <span className="text-sm font-medium">{trendLabel(performance.trend)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
              {performance.attendance.rate === null ? "—" : `${performance.attendance.rate}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {performance.attendance.present + performance.attendance.late} of{" "}
              {performance.attendance.total - performance.attendance.excused} days
              {performance.attendance.excused > 0 && ` · ${performance.attendance.excused} excused`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">
              {position ? "Position in class" : "Status"}
            </p>
            {position ? (
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {position.position === null ? "—" : `${position.position}`}
                <span className="text-sm font-normal text-muted-foreground"> of {position.outOf}</span>
              </p>
            ) : (
              <div className="mt-2"><RiskBadge level={performance.risk.level} /></div>
            )}
            {position && <div className="mt-2"><RiskBadge level={performance.risk.level} /></div>}
          </CardContent>
        </Card>
      </div>

      {performance.risk.reasons.length > 0 && (
        <Card className={cn("border-l-4", performance.risk.level === "at_risk" ? "border-l-destructive" : "border-l-warning")}>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Why this student is flagged</p>
            <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
              {performance.risk.reasons.map((reason) => (
                <li key={reason} className="flex gap-2"><span aria-hidden>·</span>{reason}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Term-on-term average</CardTitle></CardHeader>
          <CardContent>
            {chartData.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                A trend line needs results from at least two terms.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, "Average"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Line type="monotone" dataKey="average" strokeWidth={2} className="stroke-accent" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Subject strengths</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {performance.subjects.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No subject scores recorded.</p>
            ) : (
              performance.subjects.map((subject) => (
                <div key={subject.subjectId} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{subject.subjectName}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {subject.average === null ? "—" : `${subject.average}%`} · {subject.grade}
                    </span>
                  </div>
                  <Progress value={subject.average ?? 0} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
