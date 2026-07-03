import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendChartProps {
  data: { fecha: string; creados: number; resueltos: number }[];
}

export function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) {
    return <p className="empty-state">Sin datos todavía.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232a3d" />
        <XAxis dataKey="fecha" tick={{ fontSize: 12, fill: "#8b93a7" }} stroke="#232a3d" />
        <YAxis allowDecimals={false} tick={{ fill: "#8b93a7" }} stroke="#232a3d" />
        <Tooltip
          contentStyle={{ background: "#161b2c", border: "1px solid #232a3d", borderRadius: 8 }}
          itemStyle={{ color: "#e5e7eb" }}
          labelStyle={{ color: "#8b93a7" }}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1" }} />
        <Line
          type="monotone"
          dataKey="creados"
          stroke="#22d3ee"
          strokeWidth={2}
          name="Creados"
          dot={{ r: 3, fill: "#22d3ee" }}
        />
        <Line
          type="monotone"
          dataKey="resueltos"
          stroke="#4ade80"
          strokeWidth={2}
          name="Resueltos"
          dot={{ r: 3, fill: "#4ade80" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
