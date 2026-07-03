import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#22d3ee", "#f472b6", "#4ade80", "#fbbf24", "#c084fc", "#fb7185"];

interface CategoryChartProps {
  data: { nombre: string; total: number }[];
}

export function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) {
    return <p className="empty-state">Sin datos todavía.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="nombre" outerRadius={100} label={{ fill: "#e5e7eb" }}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#10131f" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#161b2c", border: "1px solid #232a3d", borderRadius: 8 }}
          itemStyle={{ color: "#e5e7eb" }}
          labelStyle={{ color: "#8b93a7" }}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
