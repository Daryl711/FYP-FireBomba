import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme';
import { useApp } from '../context/AppContext';

export default function HomeScreen({ navigation }){
    const { rooms, notifications, systemStatus, user, realtimeError } = useApp();
    const warningRooms = rooms.filter((r) => r.status === 'warning');
    const navigateTo = (route, params) => {
        if (navigation?.navigate) {
            navigation.navigate(route, params);
        }
    };

    const recentAlerts = notifications.slice(0, 2).map((n) => ({
        id: n.id,
        room: n.room,
        desc: n.description,
        time: n.time,
        color: n.type === 'warning' ? COLORS.amber : n.type === 'success' ? COLORS.green : COLORS.blue, 
    }));

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <Text style={styles.greet}>Welcome Back,</Text>
                        <Text style={styles.name}>{user?.name || 'User'}</Text>
                    </View>
                    <View style={styles.headerLogo}>
                        <Ionicons name="flame" size={22} color={COLORS.white} />
                    </View>

                    {/* Stat cards */}
                    <View style={styles.statGrid}>
                        <View style={styles.statCard}>
                            <View style={styles.statCardTop}>
                                <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.white} />
                                <Text style={styles.statCardTitle}> Active Rooms</Text>
                            </View>
                            <Text style={styles.statCardVal}>{rooms.length}</Text>
                        </View>
                        <View style={styles.statCard}>
                            <View style={styles.statCardTop}>
                                <Ionicons name="warning-outline" size={14} color={COLORS.white} />
                                <Text style={styles.statCardTitle}> Warnings</Text>
                            </View>
                            <Text style={styles.statCardVal}>{warningRooms.length}</Text>
                        </View>
                    </View>
                </View>

                

                {/* System Status */}
                <View style={styles.statusCard}>
                    <View style={styles.statusCardTop}>
                        <Text style={styles.sectionTitle}>System Status</Text>
                        <View style={styles.operationalBadge}>
                            <Text style={styles.operationalText}>
                                {systemStatus.allOperational ? 'All Systems Operational' : 'Warning Detected'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.statusRow}>
                        <View style={styles.statusItem}>
                            <Text style={[styles.statusVal, { color: COLORS.blue }]}>
                                📶 {systemStatus.sensorsOnline}
                            </Text>
                            <Text style={styles.statusLbl}>Sensors Online</Text>
                        </View>
                        <View style={styles.statusItem}>
                            <Text style={[styles.statusVal, { color: COLORS.green }]}>
                                ↑ {systemStatus.uptime}%
                            </Text>
                            <Text style={styles.statusLbl}>Uptime</Text>
                        </View>
                            <View style={styles.statusItem}>
                            <Text style={[styles.statusVal, { color: COLORS.primary }]}>
                                🔥 {systemStatus.fireEvents}
                            </Text>
                            <Text style={styles.statusLbl}>Fire Events</Text>
                        </View>
                    </View>
                </View>

                {realtimeError ? (
                <View style={styles.errorCard}>
                    <Text style={styles.errorText}>Realtime API unavailable: {realtimeError}</Text>
                </View>
                ) : null}

                {/* Recent Alerts */}
                <View style={styles.section}>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Recent Alerts</Text>
                    <TouchableOpacity onPress={() => navigateTo('Alerts')}>
                    <Text style={styles.sectionLink}>View all</Text>
                    </TouchableOpacity>
                </View>
                {recentAlerts.map((alert) => (
                    <View key={alert.id} style={styles.alertCard}>
                    <View style={[styles.alertDot, { backgroundColor: alert.color }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.alertName}>{alert.room}</Text>
                        <Text style={styles.alertDesc}>{alert.desc}</Text>
                    </View>
                    <Text style={styles.alertTime}>{alert.time}</Text>
                    </View>
                ))}
                {recentAlerts.length === 0 ? <Text style={styles.emptyText}>No alerts yet</Text> : null}
                </View>

                {/* Room Overview */}
                <View style={styles.section}>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Room Overview</Text>
                    <TouchableOpacity onPress={() => navigateTo('Rooms')}>
                    <Text style={styles.sectionLink}>View all</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.roomGrid}>
                    {rooms.slice(0, 4).map((room) => (
                    <TouchableOpacity
                        key={room.id}
                        style={styles.roomMini}
                        onPress={() => navigateTo('RoomDetail', { roomId: room.id, room })}
                        activeOpacity={0.75}
                    >
                        <View style={styles.roomMiniTop}>
                        <Text style={styles.roomMiniName}>{room.name}</Text>
                        <Ionicons
                            name={room.status === 'warning' ? 'warning' : 'checkmark-circle'}
                            size={20}
                            color={room.status === 'warning' ? COLORS.amber : COLORS.green}
                        />
                        </View>
                        <Text style={styles.roomMiniTemp}>Temp: {room.temperature}°C</Text>
                    </TouchableOpacity>
                    ))}
                </View>
                </View>

                <View style={{ height: SPACING.xxl }} />
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    header: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.xxl,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    greet: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
    },
    name: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.white,
    },
    headerLogo: {
        width: 38,
        height: 38,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statGrid: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginTop: SPACING.lg,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
    },
    statCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statCardTitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
    },
    statCardVal: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.white,
        marginTop: 6,
    },
    statusCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        margin: SPACING.lg,
        ...SHADOW.small,
    },
    statusCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    operationalBadge: {
        backgroundColor: COLORS.greenLight,
        borderRadius: RADIUS.full,
        paddingHorizontal: SPACING.md,
        paddingVertical: 4,
    },
    operationalText: {
        fontSize: 11,
        fontWeight: '600',
        color: COLORS.green,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statusItem: {
        alignItems: 'center',
    },
    statusVal: {
        fontSize: 18,
        fontWeight: '700',
    },
    statusLbl: {
        fontSize: 11,
        color: COLORS.text2,
        marginTop: 3,
    },
    errorCard: {
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        backgroundColor: '#FFF3F2',
        borderRadius: RADIUS.md,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
    },
    errorText: {
        color: COLORS.primary,
        fontSize: 12,
    },
    section: {
        paddingHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
    },
    sectionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: COLORS.text,
    },
    sectionLink: {
        fontSize: 13,
        color: COLORS.primary,
        fontWeight: '600',
    },
    alertCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACING.md,
        marginBottom: SPACING.sm,
        ...SHADOW.small,
    },
    alertDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 4,
        flexShrink: 0,
    },
    alertName: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.text,
    },
    alertDesc: {
        fontSize: 12,
        color: COLORS.text2,
        marginTop: 2,
    },
    alertTime: {
        fontSize: 11,
        color: COLORS.text3,
        flexShrink: 0,
    },
    emptyText: {
        fontSize: 12,
        color: COLORS.text2,
    },
    roomGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.md,
    },
    roomMini: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        width: '47.5%',
        ...SHADOW.small,
    },
    roomMiniTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    roomMiniName: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.text,
        flex: 1,
        marginRight: 4,
    },
    roomMiniTemp: {
        fontSize: 12,
        color: COLORS.text2,
        marginTop: 6,
    },
});