import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface CategoryChartProps {
  data: { nombre: string; total: number }[];
}

export function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) {
    return <p className="empty-state">Sin datos todavía.</p>;
  }

  const sorted = [...data].sort((a, b) => b.total - a.total);
  const height = Math.max(180, sorted.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232a3d" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: "#8b93a7", fontSize: 12 }} stroke="#232a3d" />
        <YAxis
          type="category"
          dataKey="nombre"
          width={110}
          tick={{ fill: "#e5e7eb", fontSize: 13 }}
          stroke="#232a3d"
        />
        <Tooltip
          cursor={{ fill: "rgba(34, 211, 238, 0.06)" }}
          contentStyle={{ background: "#161b2c", border: "1px solid #232a3d", borderRadius: 8 }}
          itemStyle={{ color: "#e5e7eb" }}
          labelStyle={{ color: "#8b93a7" }}
        />
        <Bar dataKey="total" fill="#22d3ee" radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList dataKey="total" position="right" fill="#e5e7eb" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
