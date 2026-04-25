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

export default function RoomsScreen({ navigation }) {
    const { rooms } = useApp();
    const safeCount = rooms.filter((r) => r.status === 'safe').length;
    const warnCount = rooms.filter((r) => r.status === 'warning').length;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Room Monitor</Text>
                <Text style={styles.subtitle}>Select a room to view details</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.list}>
                {rooms.map((room) => (
                    <TouchableOpacity
                    key={room.id}
                    style={styles.roomRow}
                    onPress={() => navigation.navigate('ListRoomDetail', { roomId: room.id, room })}
                    activeOpacity={0.75}
                    >
                    <View style={{ flex: 1 }}>
                        <Text style={styles.roomName}>{room.name}</Text>
                        <View style={styles.roomBottom}>
                        <Text style={styles.roomTemp}>Temperature: {room.temperature}°C</Text>
                        {room.alertCount > 0 && (
                            <Text style={styles.roomAlert}>
                            {room.alertCount} Alert{room.alertCount > 1 ? 's' : ''}
                            </Text>
                        )}
                        </View>
                    </View>
                    <Ionicons
                        name={room.status === 'warning' ? 'warning' : 'checkmark-circle'}
                        size={24}
                        color={room.status === 'warning' ? COLORS.amber : COLORS.green}
                    />
                    </TouchableOpacity>
                ))}
                </View>

                {/* Summary Footer */}
                <View style={styles.footer}>
                <View style={styles.footerStat}>
                    <Text style={[styles.footerVal, { color: COLORS.blue }]}>{rooms.length}</Text>
                    <Text style={styles.footerLbl}>Total Rooms</Text>
                </View>
                <View style={styles.footerDivider} />
                <View style={styles.footerStat}>
                    <Text style={[styles.footerVal, { color: COLORS.green }]}>{safeCount}</Text>
                    <Text style={styles.footerLbl}>Safe</Text>
                </View>
                <View style={styles.footerDivider} />
                <View style={styles.footerStat}>
                    <Text style={[styles.footerVal, { color: COLORS.amber }]}>{warnCount}</Text>
                    <Text style={styles.footerLbl}>Warnings</Text>
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
        backgroundColor: COLORS.white,
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.text,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.text2,
        marginTop: 3,
    },
    list: {
        padding: SPACING.lg,
        gap: SPACING.sm,
    },
    roomRow: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        flexDirection: 'row',
        alignItems: 'center',
        ...SHADOW.small,
    },
    roomName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.text,
    },
    roomBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        marginTop: 4,
    },
    roomTemp: {
        fontSize: 13,
        color: COLORS.text2,
    },
    roomAlert: {
        fontSize: 12,
        color: COLORS.amber,
        fontWeight: '600',
    },
    footer: {
        marginHorizontal: SPACING.lg,
        backgroundColor: '#EEF6FF',
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    footerStat: {
        alignItems: 'center',
        flex: 1,
    },
    footerVal: {
        fontSize: 22,
        fontWeight: '700',
    },
    footerLbl: {
        fontSize: 11,
        color: COLORS.text2,
        marginTop: 3,
    },
    footerDivider: {
        width: 1,
        height: 36,
        backgroundColor: COLORS.border,
    },
});
