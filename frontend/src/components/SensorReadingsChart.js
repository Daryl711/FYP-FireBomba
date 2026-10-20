import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { COLORS, SPACING } from "../../constants/theme";

const METRICS = [
  {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    color: COLORS.primary,
  },
  { key: "humidity", label: "Humidity", unit: "%", color: COLORS.blue },
  { key: "smoke", label: "Smoke", unit: "ppm", color: COLORS.amber },
  { key: "co", label: "CO", unit: "ppm", color: COLORS.green },
];

function getMetricValue(reading, key) {
  const value = reading?.[key];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function MetricPlot({ metric, data, width }) {
  const plotWidth = Math.max(width, 1);
  const values = data.map((reading) => getMetricValue(reading, metric.key));
  const validValues = values.filter((value) => value !== null);
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x =
        data.length < 2
          ? plotWidth / 2
          : 4 + (index / (data.length - 1)) * (plotWidth - 8);
      const y = max === min ? 25 : 45 - ((value - min) / (max - min)) * 40;
      return { x, y };
    })
    .filter(Boolean);
  const latest = validValues.at(-1);

  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{metric.label}</Text>
        <Text style={[styles.metricValue, { color: metric.color }]}>
          {latest === undefined ? "--" : latest.toFixed(1)} {metric.unit}
        </Text>
      </View>
      <Svg width={plotWidth} height={52} viewBox={`0 0 ${plotWidth} 52`}>
        <Line
          x1={0}
          y1={46}
          x2={plotWidth}
          y2={46}
          stroke={COLORS.border}
          strokeWidth={1}
        />
        {points.length > 1 ? (
          <Polyline
            points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={metric.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((point, index) => (
          <Circle
            key={`${metric.key}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 3 : 1.8}
            fill={metric.color}
          />
        ))}
      </Svg>
    </View>
  );
}

export default function SensorReadingsChart({ data }) {
  const readings = Array.isArray(data) ? data.slice(-10) : [];
  const [width, setWidth] = React.useState(300);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {readings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Waiting for sensor readings...</Text>
        </View>
      ) : (
        <>
          {METRICS.map((metric) => (
            <MetricPlot
              key={metric.key}
              metric={metric}
              data={readings}
              width={width}
            />
          ))}
          <View style={styles.axisLabels}>
            <Text style={styles.axisText}>{readings.length} readings</Text>
            <Text style={styles.axisText}>Oldest to latest</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    marginBottom: SPACING.sm,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    color: COLORS.text2,
    fontSize: 11,
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text2,
    fontSize: 12,
  },
  axisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.xs,
  },
  axisText: {
    color: COLORS.text3,
    fontSize: 10,
  },
});
