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
const GRAPH_PADDING = { top: 12, right: 10, bottom: 24, left: 10 };

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
  const aggregates = data.aggregates || [];
  const values = aggregates
    .map((aggregate) => ({
      time: new Date(aggregate.window_end).getTime(),
      value: Number(aggregate[metric.key]),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value) &&
        point.time >= Date.now() - HISTORY_WINDOW_MS,
    );

  const latest = values.at(-1)?.value;
  const now = Date.now();
  const plotWidth = Math.max(1, width - GRAPH_PADDING.left - GRAPH_PADDING.right);
  const plotHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;
  const latestTime = values.at(-1)?.time ?? now;
  const predictionStart = values.at(-1);
  const predictionValues = Array.isArray(data.predictions)
    ? data.predictions
        .map((prediction, index) => ({
          time: latestTime + (index + 1) * 5 * 60 * 1000,
          value: Number(prediction?.[metric.key]),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.time) && Number.isFinite(point.value),
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
  const startTime = now - HISTORY_WINDOW_MS;
  const endTime = now + 30 * 60 * 1000;
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
  const predictionPoints = predictionStart
    ? [
        {
          x: xForTime(predictionStart.time),
          y: yForValue(predictionStart.value),
        },
        ...predictionValues.map((point) => ({
          x: xForTime(point.time),
          y: yForValue(point.value),
        })),
      ]
    : [];

  return (
    <View style={styles.graphCard}>
      <View style={styles.graphHeader}>
        <View>
          <Text style={styles.metricTitle}>{metric.title} average</Text>
          <Text style={styles.metricPeriod}>Last 2 hours · 5-minute windows</Text>
        </View>
        <Text style={[styles.metricValue, { color: metric.color }]}>
          {latest === undefined ? "--" : latest.toFixed(1)} {metric.unit}
        </Text>
      </View>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {values.length === 0 ? (
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
                <Line
                  key={fraction}
                  x1={GRAPH_PADDING.left}
                  y1={y}
                  x2={width - GRAPH_PADDING.right}
                  y2={y}
                  stroke={COLORS.border}
                  strokeWidth={1}
                />
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
            {predictionPoints.slice(1).map((point, index) => (
              <Circle
                key={`${metric.key}-prediction-${predictionValues[index].time}`}
                cx={point.x}
                cy={point.y}
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
              +30m
            </SvgText>
          </Svg>
        )}
      </View>
      <Text style={styles.readingCount}>
        {values.length} aggregate{values.length === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

export default function SensorHistoryScreen({ route, navigation }) {
  const room = route?.params?.room;
  const roomId = room?.roomId;
  const roomName = room?.name || "Room";
  const [aggregates, setAggregates] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [sensorError, setSensorError] = useState(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let mounted = true;
    let closeStream;

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

    const handlePrediction = (nextPredictions) => {
      if (!mounted || !Array.isArray(nextPredictions)) return;

      setPredictions(
        nextPredictions.filter(
          (prediction) =>
            prediction &&
            METRICS.every((metric) =>
              Number.isFinite(Number(prediction[metric.key])),
            ),
        ),
      );
      setSensorError(null);
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
          {connecting ? <ActivityIndicator size="small" color={COLORS.blue} /> : null}
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
        {METRICS.map((metric) => (
          <AggregateGraph
            key={metric.key}
            metric={metric}
            data={{ aggregates, predictions }}
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
