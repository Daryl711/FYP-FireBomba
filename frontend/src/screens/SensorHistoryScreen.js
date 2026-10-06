import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { COLORS, RADIUS, SHADOW, SPACING } from "../../constants/theme";
import { subscribeToSensorAggregates } from "../services/api";

const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000;
const GRAPH_HEIGHT = 150;
const GRAPH_PADDING = { top: 12, right: 10, bottom: 24, left: 46 };

function metricNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

const METRICS = [
  {
    key: "avg_temperature",
    title: "Temperature",
    unit: "°C",
    color: COLORS.primary,
  },
  { key: "avg_smoke", title: "Smoke", unit: "ppm", color: COLORS.amber },
  { key: "avg_co", title: "Carbon monoxide", unit: "ppm", color: COLORS.green },
  { key: "avg_humidity", title: "Humidity", unit: "%", color: COLORS.blue },
];

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AggregateGraph({ metric, data }) {
  const [width, setWidth] = useState(320);
  const now = data.now ?? Date.now();
  const aggregates = data.aggregates || [];
  const values = aggregates
    .map((aggregate) => ({
      time: new Date(aggregate.window_end).getTime(),
      value: metricNumber(aggregate[metric.key]),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value) &&
        point.time >= now - HISTORY_WINDOW_MS,
    )
    .sort((left, right) => left.time - right.time);

  const latest = values.at(-1)?.value;
  const plotWidth = Math.max(
    1,
    width - GRAPH_PADDING.left - GRAPH_PADDING.right,
  );
  const plotHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;
  const latestTime = values.at(-1)?.time ?? now;
  const baseTime = data.base_time
    ? new Date(data.base_time).getTime()
    : latestTime;
  const predictionStart = values.find((point) => point.time === baseTime);
  const predictionValues = Array.isArray(data.predictions)
    ? data.predictions
        .map((prediction, index) => ({
          time: prediction?.forecast_at
            ? new Date(prediction.forecast_at).getTime()
            : baseTime + (index + 1) * 5 * 60 * 1000,
          value: metricNumber(prediction?.[metric.key]),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.time) &&
            Number.isFinite(point.value) &&
            point.time >= now - HISTORY_WINDOW_MS,
        )
    : [];
  const plottedValues = [
    ...values,
    ...(predictionStart ? [predictionStart] : []),
    ...predictionValues,
  ];
  const minValue = plottedValues.length
    ? Math.min(...plottedValues.map((point) => point.value))
    : 0;
  const maxValue = plottedValues.length
    ? Math.max(...plottedValues.map((point) => point.value))
    : 1;
  const valueRange = maxValue - minValue;
  const verticalPadding =
    valueRange === 0 ? Math.max(Math.abs(minValue) * 0.1, 1) : valueRange * 0.1;
  const lowerBound = minValue - verticalPadding;
  const upperBound = maxValue + verticalPadding;
  // Synced windows may be ahead of the phone clock. Include every visible
  // point and the full forecast rather than drawing them outside the SVG.
  const anchorTime = Math.max(now, latestTime);
  const startTime = Math.min(now - HISTORY_WINDOW_MS, values[0]?.time ?? now);
  const endTime = Math.max(
    anchorTime + 30 * 60 * 1000,
    predictionValues.at(-1)?.time ?? anchorTime,
  );
  const xForTime = (time) =>
    GRAPH_PADDING.left +
    ((time - startTime) / (endTime - startTime)) * plotWidth;
  const yForValue = (value) =>
    GRAPH_PADDING.top +
    ((upperBound - value) / (upperBound - lowerBound)) * plotHeight;
  const points = values.map((point) => {
    return {
      x: xForTime(point.time),
      y: yForValue(point.value),
    };
  });
  const predictionPoints = [
    ...(predictionStart && predictionValues.length ? [predictionStart] : []),
    ...predictionValues,
  ].map((point) => ({ x: xForTime(point.time), y: yForValue(point.value) }));

  return (
    <View style={styles.graphCard}>
      <View style={styles.graphHeader}>
        <View>
          <Text style={styles.metricTitle}>{metric.title} average</Text>
          <Text style={styles.metricPeriod}>
            Last 2 hours · 5-minute windows
          </Text>
        </View>
        <Text style={[styles.metricValue, { color: metric.color }]}>
          {latest === undefined ? "--" : latest.toFixed(1)} {metric.unit}
        </Text>
      </View>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {values.length === 0 && predictionValues.length === 0 ? (
          <View style={styles.graphEmpty}>
            <Text style={styles.emptyText}>Waiting for aggregate data...</Text>
          </View>
        ) : (
          <Svg
            width={width}
            height={GRAPH_HEIGHT}
            viewBox={`0 0 ${width} ${GRAPH_HEIGHT}`}
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = GRAPH_PADDING.top + fraction * plotHeight;
              return (
                <React.Fragment key={fraction}>
                  <Line
                    x1={GRAPH_PADDING.left}
                    y1={y}
                    x2={width - GRAPH_PADDING.right}
                    y2={y}
                    stroke={COLORS.border}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={GRAPH_PADDING.left - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill={COLORS.text3}
                    fontSize={9}
                  >
                    {(
                      upperBound -
                      fraction * (upperBound - lowerBound)
                    ).toFixed(1)}
                  </SvgText>
                </React.Fragment>
              );
            })}
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
            {predictionPoints.length > 1 ? (
              <Polyline
                points={predictionPoints
                  .map(({ x, y }) => `${x},${y}`)
                  .join(" ")}
                fill="none"
                stroke={metric.color}
                strokeOpacity={0.5}
                strokeWidth={2.5}
                strokeDasharray="5,4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {points.map((point, index) => (
              <Circle
                key={`${metric.key}-${values[index].time}`}
                cx={point.x}
                cy={point.y}
                r={index === points.length - 1 ? 4 : 2.5}
                fill={metric.color}
              />
            ))}
            {predictionValues.map((point) => (
              <Circle
                key={`${metric.key}-prediction-${point.time}`}
                cx={xForTime(point.time)}
                cy={yForValue(point.value)}
                r={3}
                fill={metric.color}
                opacity={0.5}
              />
            ))}
            <SvgText
              x={GRAPH_PADDING.left}
              y={GRAPH_HEIGHT - 5}
              fill={COLORS.text3}
              fontSize={10}
            >
              {formatTime(startTime)}
            </SvgText>
            <SvgText
              x={xForTime(endTime)}
              y={GRAPH_HEIGHT - 5}
              fill={COLORS.text3}
              fontSize={10}
              textAnchor="end"
            >
              {formatTime(endTime)}
            </SvgText>
          </Svg>
        )}
      </View>
      <Text style={styles.readingCount}>
        {values.length} aggregate{values.length === 1 ? "" : "s"}
        {` · ${predictionValues.length} forecast points`}
      </Text>
    </View>
  );
}

export default function SensorHistoryScreen({ route, navigation }) {
  const room = route?.params?.room;
  const roomId = room?.roomId;
  const roomName = room?.name || "Room";
  const [aggregates, setAggregates] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sensorError, setSensorError] = useState(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let closeStream;
    let latestBaseTime = -Infinity;
    let latestGeneratedTime = -Infinity;
    setAggregates([]);
    setForecast(null);
    setSensorError(null);
    setConnecting(true);

    const handleAggregate = (aggregate) => {
      if (!mounted || String(aggregate.room_id) !== String(roomId)) return;

      const cutoff = Date.now() - HISTORY_WINDOW_MS;
      const aggregateTime = new Date(aggregate.window_end).getTime();
      if (!Number.isFinite(aggregateTime) || aggregateTime < cutoff) return;

      setAggregates((current) => {
        const key = aggregate.aggregate_id ?? aggregate.window_start;
        const updated = current.filter(
          (item) => (item.aggregate_id ?? item.window_start) !== key,
        );
        updated.push(aggregate);
        return updated
          .filter((item) => new Date(item.window_end).getTime() >= cutoff)
          .sort(
            (left, right) =>
              new Date(left.window_end).getTime() -
              new Date(right.window_end).getTime(),
          );
      });
      setSensorError(null);
      setConnecting(false);
    };

    const handlePrediction = (incoming) => {
      if (!mounted) return;
      const next = Array.isArray(incoming)
        ? { predictions: incoming }
        : incoming;
      if (!next || !Array.isArray(next.predictions)) return;
      if (next.room_id !== undefined && String(next.room_id) !== String(roomId))
        return;
      const base = next.base_time ? new Date(next.base_time).getTime() : 0;
      const generated = next.generated_at
        ? new Date(next.generated_at).getTime()
        : 0;
      if (
        !Number.isFinite(base) ||
        !Number.isFinite(generated) ||
        base < latestBaseTime ||
        (base === latestBaseTime && generated < latestGeneratedTime)
      )
        return;
      // Keep indices intact: a missing metric must not shift later forecast times.
      if (
        !next.predictions.length ||
        !next.predictions.some((point) =>
          METRICS.some((metric) =>
            Number.isFinite(metricNumber(point?.[metric.key])),
          ),
        )
      )
        return;
      latestBaseTime = base;
      latestGeneratedTime = generated;
      setForecast(next);
      setSensorError(null);
      setConnecting(false);
    };

    if (!roomId) {
      setSensorError("Room information is unavailable.");
      setConnecting(false);
      return () => {
        mounted = false;
      };
    }

    subscribeToSensorAggregates(
      roomId,
      handleAggregate,
      handlePrediction,
      (error) => {
        if (mounted) {
          setSensorError(error.message);
          setConnecting(false);
        }
      },
    )
      .then((close) => {
        if (mounted) closeStream = close;
        else close();
      })
      .catch((error) => {
        if (mounted) {
          setSensorError(error.message);
          setConnecting(false);
        }
      });

    return () => {
      mounted = false;
      closeStream?.();
    };
  }, [roomId]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Sensor History</Text>
          <Text style={styles.subtitle}>{roomName}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <View style={styles.liveIndicator} />
          <Text style={styles.statusText}>
            {sensorError
              ? `Stream unavailable: ${sensorError}`
              : connecting
                ? "Connecting to live aggregate stream..."
                : "Live · averages update every 5 minutes"}
          </Text>
          {connecting ? (
            <ActivityIndicator size="small" color={COLORS.blue} />
          ) : null}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.actualLegendLine} />
            <Text style={styles.legendText}>Actual average</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.predictionLegendLine} />
            <Text style={styles.legendText}>Prediction</Text>
          </View>
        </View>
        <Text style={styles.forecastStatus}>
          {forecast
            ? `Forecast generated ${formatTime(forecast.generated_at)}${
                forecast.predictions.at(-1)?.forecast_at &&
                new Date(forecast.predictions.at(-1).forecast_at).getTime() <=
                  now
                  ? " · forecast period ended; waiting for a new run"
                  : ""
              }`
            : "Waiting for the first saved forecast..."}
        </Text>
        {METRICS.map((metric) => (
          <AggregateGraph
            key={metric.key}
            metric={metric}
            data={{
              aggregates,
              predictions: forecast?.predictions || [],
              base_time: forecast?.base_time,
              now,
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.text2,
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  legend: {
    flexDirection: "row",
    gap: SPACING.lg,
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  actualLegendLine: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.text2,
  },
  predictionLegendLine: {
    width: 22,
    borderTopWidth: 2,
    borderColor: COLORS.text2,
    borderStyle: "dashed",
    opacity: 0.6,
  },
  legendText: {
    color: COLORS.text2,
    fontSize: 11,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  statusText: {
    color: COLORS.text2,
    fontSize: 12,
    flex: 1,
  },
  forecastStatus: {
    color: COLORS.text2,
    fontSize: 11,
  },
  graphCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOW.small,
  },
  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  metricTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  metricPeriod: {
    color: COLORS.text3,
    fontSize: 10,
    marginTop: 3,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  graphEmpty: {
    height: GRAPH_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.text2,
    fontSize: 12,
  },
  readingCount: {
    color: COLORS.text3,
    fontSize: 10,
    textAlign: "right",
  },
});
