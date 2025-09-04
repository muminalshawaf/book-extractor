import React from "react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer } from "@/components/ui/chart";

interface ChartData {
  type: 'line' | 'bar' | 'scatter' | 'area';
  title: string;
  xAxis: {
    label: string;
    unit?: string;
    scale?: 'linear' | 'log';
  };
  yAxis: {
    label: string;
    unit?: string;
    scale?: 'linear' | 'log';
  };
  data: Array<Record<string, any>>;
  series: Array<{
    key: string;
    name: string;
    color: string;
  }>;
}

interface ChartRendererProps {
  chartData: ChartData;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({ chartData }) => {
  const { type, title, xAxis, yAxis, data, series } = chartData;

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 20, right: 30, left: 20, bottom: 60 },
    };

    const xAxisProps = {
      dataKey: series[0]?.key?.split('_')[0] || 'x',
      label: { value: `${xAxis.label}${xAxis.unit ? ` (${xAxis.unit})` : ''}`, position: 'insideBottom', offset: -10 },
      ...(xAxis.scale === 'log' && { scale: 'log' as const }),
    };

    const yAxisProps = {
      label: { value: `${yAxis.label}${yAxis.unit ? ` (${yAxis.unit})` : ''}`, angle: -90, position: 'insideLeft' },
      ...(yAxis.scale === 'log' && { scale: 'log' as const }),
    };

    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            <Legend />
            {series.map((s, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                name={s.name}
                strokeWidth={2}
                dot={{ fill: s.color, r: 4 }}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            <Legend />
            {series.map((s, idx) => (
              <Bar key={idx} dataKey={s.key} fill={s.color} name={s.name} />
            ))}
          </BarChart>
        );

      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            <Legend />
            {series.map((s, idx) => (
              <Scatter key={idx} dataKey={s.key} fill={s.color} name={s.name} />
            ))}
          </ScatterChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip />
            <Legend />
            {series.map((s, idx) => (
              <Area
                key={idx}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.6}
                name={s.name}
              />
            ))}
          </AreaChart>
        );

      default:
        return <div>Unsupported chart type: {type}</div>;
    }
  };

  return (
    <div className="w-full bg-background rounded-lg border p-4 my-4">
      <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
      <ChartContainer config={{}}>
        <ResponsiveContainer width="100%" height={400}>
          {renderChart()}
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};

export default ChartRenderer;