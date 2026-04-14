// src/components/SensorChart.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants/theme';

const W = 320;
const H = 110;
const PAD = { top: 10, bottom: 30, left: 22, right: 10 };

function toSafeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function scalePoints(data, key, maxVal) {
    if (!Array.isArray(data) || data.length < 2) {
        return '';
    }
    const xs = W - PAD.left - PAD.right;
    const ys = H - PAD.top - PAD.bottom;
    const safeMax = Math.max(toSafeNumber(maxVal), 1);
    return data
        .map((d, i) => {
        const x = PAD.left + (i / (data.length - 1)) * xs;
        const raw = key === 'temp' ? (d?.temp ?? d?.temperature ?? 0) : (d?.[key] ?? 0);
        const value = toSafeNumber(raw);
        const y = PAD.top + ys - (value / safeMax) * ys;
        return `${x},${y}`;
        })
        .join(' ');
}

export default function SensorChart({ data }) {
    const safeData = Array.isArray(data) ? data : [];
    const maxTemp = 50;
    const maxSmoke = 100;
    const maxGas = 50;

    const tempPts = scalePoints(safeData, 'temp', maxTemp);
    const smokePts = scalePoints(safeData, 'smoke', maxSmoke);
    const gasPts = scalePoints(safeData, 'gas', maxGas);

    const yLabels = [0, 12, 24, 36, 48];

    return (
        <View style={styles.wrap}>
        <Svg width={W} height={H}>
            {/* Grid lines */}
            {yLabels.map((val) => {
            const ys = H - PAD.top - PAD.bottom;
            const y = PAD.top + ys - (val / 48) * ys;
            return (
                <React.Fragment key={val}>
                <Line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#F0F0F0" strokeWidth={1} />
                <SvgText x={0} y={y + 4} fontSize={8} fill={COLORS.text3}>{val}</SvgText>
                </React.Fragment>
            );
            })}

            {/* Temperature line */}
            {tempPts ? (
                <Polyline
                points={tempPts}
                fill="none"
                stroke={COLORS.blue}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                />
            ) : null}

            {/* Smoke line (dashed) */}
            {smokePts ? (
                <Polyline
                points={smokePts}
                fill="none"
                stroke={COLORS.green}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeDasharray="4 2"
                />
            ) : null}

            {/* Gas line (dotted) */}
            {gasPts ? (
                <Polyline
                points={gasPts}
                fill="none"
                stroke={COLORS.amber}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeDasharray="2 3"
                />
            ) : null}
        </Svg>

        {/* Legend */}
        <View style={styles.legend}>
            <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: COLORS.blue }]} />
            <Text style={styles.legendText}>Temperature (°C)</Text>
            </View>
            <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: COLORS.green }]} />
            <Text style={styles.legendText}>Smoke (%)</Text>
            </View>
            <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: COLORS.amber }]} />
            <Text style={styles.legendText}>Gas (ppm)</Text>
            </View>
        </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginTop: 6,
        flexWrap: 'wrap',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendLine: {
        width: 16,
        height: 2,
        borderRadius: 1,
    },
    legendText: {
        fontSize: 10,
        color: COLORS.text2,
    },
});
