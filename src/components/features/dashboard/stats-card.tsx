import { Card, CardBody } from "@/components/ui/card";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  iconColor?: string;
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend, iconColor = "bg-brand-50 text-brand-600" }: StatsCardProps) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
            {trend && (
              <p className={clsx("mt-1 text-xs font-medium", trend.positive ? "text-green-600" : "text-red-600")}>
                {trend.positive ? "↑" : "↓"} {trend.value}
              </p>
            )}
          </div>
          <div className={clsx("flex h-12 w-12 items-center justify-center rounded-xl", iconColor)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
