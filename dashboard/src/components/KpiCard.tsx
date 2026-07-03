interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: string;
}

export function KpiCard({ label, value, accent = "#22d3ee" }: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{ borderTopColor: accent, boxShadow: `0 0 24px ${accent}22, 0 12px 28px rgba(0, 0, 0, 0.4)` }}
    >
      <span className="kpi-value" style={{ color: accent }}>
        {value}
      </span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
