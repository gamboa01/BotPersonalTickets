import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="creados" stroke="#4f46e5" strokeWidth={2} name="Creados" />
        <Line type="monotone" dataKey="resueltos" stroke="#10b981" strokeWidth={2} name="Resueltos" />
      </LineChart>
    </ResponsiveContainer>
  );
}
