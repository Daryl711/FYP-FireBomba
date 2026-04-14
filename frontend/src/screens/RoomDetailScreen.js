import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme';
import { useApp } from '../context/AppContext';
import SensorChart from '../../components/SensorChart';

function SensorCard({ icon,label, value, unit, fillPct, fillColor }) {
    return (
        <View style={sStyles.card}>
            <View style={sStyles.iconWrap}>
                <Ionicons name={icon} size={20} color={COLORS.green} />
            </View>
            <Text style={sStyles.label}>{label}</Text>
            <Text style={sStyles.value}>
                {value}{' '}
                {unit ? <Text style={sStyles.unit}>{unit}</Text> : null}
            </Text>
            {fillPct !== undefined && (
                <View style={sStyles.bar}>
                <View style={[sStyles.fill, { width: `${fillPct}%`, backgroundColor: fillColor || COLORS.green }]} />
                </View>
            )}
        </View>
    )
}

const sStyles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        flex: 1,
        ...SHADOW.small,
    },
    iconWrap: {
        width: 36,
        height: 36,
        backgroundColor: COLORS.greenLight,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: COLORS.text2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    value: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.green,
        marginTop: 3,
    },
    unit: {
        fontSize: 13,
        fontWeight: '400',
        color: COLORS.text2,
    },
    bar: {
        height: 4,
        backgroundColor: '#F0F0F0',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 2,
    },
});

export default function RoomDetailScreen({ route, navigation }) {
    const { rooms } = useApp();
    const { room: initialRoom, roomId } = route?.params || {};
    const resolvedRoomId = roomId ? String(roomId) : undefined;
    const room = rooms.find((item) => item.id === resolvedRoomId) || initialRoom;

    if (!room) {
        return(
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.unavailableWrap}>
                    <Text style={styles.unavailableText}>Room data is currently unavailable.</Text>
                    <TouchableOpacity style={styles.unavailableBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.unavailableBtnText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const sensors = room.sensors || {
        temperature: room.temperature ?? 0,
        smoke: 0,
        gas: 0,
        flame: false,
    };
    const sensorHistory = Array.isArray(room.sensorHistory) ? room.sensorHistory : [];
    const name = room.name || 'Room';

    const [pumpActive, setPumpActive] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [camTime, setCamTime] = useState(new Date());

    // Spinning animation for camera loader
    const spinAnim = useRef(new Animated.Value(0)).current;
    const pumpPulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            })
        ).start();
    }, []);

    useEffect (() => {
        const timer = setInterval(() => setCamTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (pumpActive) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pumpPulse, { toValue: 1.03, duration: 600, useNativeDriver: true }),
                    Animated.timing(pumpPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pumpPulse.stopAnimation();
            pumpPulse.setValue(1);
        }
    }, [pumpActive]);


    const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    const formatTime = (d) =>
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const handlePumpToggle = () => {
        if (!pumpActive) {
            Alert.alert(
                'Activate Water Pump',
                `Are you sure you want to activate the water pump in ${name}?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Activate',
                        style: 'destructive',
                        onPress: () => {
                            setPumpActive(true);
                            setLastUpdated(new Date());
                        },
                    },
                ]
            );
        } else {
            setPumpActive(false);
            setLastUpdated(new Date());
        }
    };

    const tempPct = Math.min((sensors.temperature / 60) * 100, 100);
    const smokePct = Math.min(sensors.smoke, 100);
    const gasPct = Math.min((sensors.gas / 100) * 100, 100);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>{name}</Text>
                    <Text style={styles.headerSub}>Real-time monitoring</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: room.status === 'warning' ? COLORS.amber : COLORS.green }]} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* Live Camera Feed */}
                <View style={styles.cameraBlock}>
                    <View style={styles.cameraInner}>
                        <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
                        <Text style={styles.camLabel}>Live Camera Feed</Text>
                        <Text style={styles.camRoom}>{name}</Text>
                    </View>
                    {/* REC badge */}
                    <View style={styles.recBadge}>
                        <View style={styles.recDot} />
                        <Text style={styles.recText}>REC</Text>
                    </View>
                    {/* Timestamp */}
                    <Text style={styles.camTime}>{formatTime(camTime)}</Text>
                </View>

                {/* Sensor Cards */}
                <View style={styles.sensorGrid}>
                    <View style={styles.sensorRow}>
                        <SensorCard
                        icon="thermometer-outline"
                        label="Temperature"
                        value={sensors.temperature}
                        unit="°C"
                        fillPct={tempPct}
                        fillColor={sensors.temperature > 30 ? COLORS.primary : COLORS.green}
                        />
                        <SensorCard
                        icon="cloud-outline"
                        label="Smoke"
                        value={sensors.smoke}
                        unit="%"
                        fillPct={smokePct}
                        fillColor={COLORS.blue}
                        />
                    </View>
                    <View style={styles.sensorRow}>
                        <SensorCard
                        icon="wind-outline"
                        label="Gas"
                        value={sensors.gas}
                        unit="ppm"
                        fillPct={gasPct}
                        fillColor={COLORS.amber}
                        />
                        <View style={[sStyles.card, { justifyContent: 'center' }]}>
                        <View style={sStyles.iconWrap}>
                            <Ionicons name="flame-outline" size={20} color={COLORS.green} />
                        </View>
                        <Text style={sStyles.label}>Flame</Text>
                        <Text style={[sStyles.value, { color: sensors.flame ? COLORS.primary : COLORS.green, fontSize: 18 }]}>
                            {sensors.flame ? 'DETECTED' : 'Clear'}
                        </Text>
                        <Text style={{ fontSize: 11, color: sensors.flame ? COLORS.primary : COLORS.green, marginTop: 8 }}>
                            {sensors.flame ? '⚠ Flame detected!' : 'No flame detected'}
                        </Text>
                        </View>
                    </View>
                </View>

                {/* Sensor History */}
                <View style={styles.historyCard}>
                    <Text style={styles.cardTitle}>Sensor History</Text>
                    {sensorHistory.length > 0 ? (
                        <SensorChart data={sensorHistory} />
                    ) : (
                        <View style={styles.chartEmpty}>
                            <Text style={styles.chartEmptyText}>No sensor data yet.</Text>
                        </View>
                    )}
                </View>

                {/* Water Pump System */}
                <Animated.View style={[styles.pumpCard, { transform: [{ scale: pumpPulse }] }]}>
                    <View style={styles.pumpTop}>
                        <View>
                            <Text style={styles.cardTitle}>Water Pump System</Text>
                            <Text style={styles.pumpSub}>Manual fire suppression control</Text>
                        </View>
                        <Ionicons name="water-outline" size={24} color={COLORS.text3} />
                    </View>

                    {/* Status row */}
                    <View style={styles.pumpStatusRow}>
                        <Text style={styles.pumpStatusLbl}>Status:</Text>
                        <View style={[styles.pumpBadge, pumpActive ? styles.badgeActive : styles.badgeStandby]}>
                            <Text style={[styles.pumpBadgeText, { color: pumpActive ? COLORS.green : COLORS.text2 }]}>
                                {pumpActive ? 'Active' : 'Standby'}
                            </Text>
                        </View>
                    </View>

                    {/* Activate / Deactivate Button */}
                    <TouchableOpacity
                        style={[styles.pumpBtn, pumpActive && styles.pumpBtnActive]}
                        onPress={handlePumpToggle}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="power" size={18} color={COLORS.white} />
                        <Text style={styles.pumpBtnText}>
                            {pumpActive ? 'Deactivate Pump' : 'Activate Pump'}
                        </Text>
                    </TouchableOpacity>

                    {/* Meta row */}
                    <View style={styles.pumpMeta}>
                        <View>
                            <Text style={styles.pumpMetaLbl}>Last Update</Text>
                            <Text style={styles.pumpMetaVal}>{formatTime(lastUpdated)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.pumpMetaLbl}>Connection</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <View style={styles.onlineDot} />
                                <Text style={styles.pumpMetaVal}>Online</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                <View style={{ height: SPACING.xxl }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    unavailableWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
        gap: SPACING.md,
    },
    unavailableText: {
        fontSize: 15,
        color: COLORS.text2,
        textAlign: 'center',
    },
    unavailableBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
    },
    unavailableBtnText: {
        color: COLORS.white,
        fontWeight: '700',
    },
    header: {
        backgroundColor: COLORS.white,
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backBtn: {
        width: 34,
        height: 34,
        backgroundColor: COLORS.bg,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: COLORS.text,
    },
    headerSub: {
        fontSize: 12,
        color: COLORS.text2,
        marginTop: 1,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginLeft: 'auto',
    },
    cameraBlock: {
        margin: SPACING.lg,
        backgroundColor: '#0D0D0D',
        borderRadius: RADIUS.xl,
        height: 200,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    cameraInner: {
        alignItems: 'center',
    },
    spinner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.1)',
        borderTopColor: COLORS.primary,
        marginBottom: 12,
    },
    camLabel: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: '500',
    },
    camRoom: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 3,
    },
    recBadge: {
        position: 'absolute',
        top: 12,
        left: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    recDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.primary,
    },
    recText: {
        color: COLORS.white,
        fontSize: 11,
        fontWeight: '700',
    },
    camTime: {
        position: 'absolute',
        bottom: 10,
        right: 12,
        color: 'rgba(255,255,255,0.65)',
        fontSize: 11,
        fontVariant: ['tabular-nums'],
    },
    sensorGrid: {
        paddingHorizontal: SPACING.lg,
        gap: SPACING.md,
        marginBottom: SPACING.md,
    },
    sensorRow: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    historyCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.md,
        ...SHADOW.small,
    },
    chartEmpty: {
        height: 140,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chartEmptyText: {
        fontSize: 12,
        color: COLORS.text2,
        fontWeight: '500',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: SPACING.md,
    },
    pumpCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginHorizontal: SPACING.lg,
        ...SHADOW.small,
    },
    pumpTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    pumpSub: {
        fontSize: 12,
        color: COLORS.text2,
        marginTop: 2,
    },
    pumpStatusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
        borderRadius: RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    pumpStatusLbl: {
        fontSize: 13,
        color: COLORS.text2,
    },
    pumpBadge: {
        borderRadius: RADIUS.full,
        paddingHorizontal: SPACING.md,
        paddingVertical: 4,
    },
    badgeStandby: {
        backgroundColor: '#F0F0F0',
    },
    badgeActive: {
        backgroundColor: COLORS.greenLight,
    },
    pumpBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    pumpBtn: {
        backgroundColor: COLORS.blue,
        borderRadius: RADIUS.lg,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.sm,
        marginBottom: SPACING.md,
    },
    pumpBtnActive: {
        backgroundColor: COLORS.primary,
    },
    pumpBtnText: {
        color: COLORS.white,
        fontSize: 15,
        fontWeight: '700',
    },
    pumpMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        paddingTop: SPACING.md,
    },
    pumpMetaLbl: {
        fontSize: 12,
        color: COLORS.text2,
    },
    pumpMetaVal: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.text,
        marginTop: 2,
    },
    onlineDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: COLORS.green,
    },
})