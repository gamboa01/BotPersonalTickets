interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: string;
}

export function KpiCard({ label, value, accent = "#4f46e5" }: KpiCardProps) {
  return (
    <div className="kpi-card" style={{ borderTopColor: accent }}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
