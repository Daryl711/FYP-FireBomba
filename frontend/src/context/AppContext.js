import React, { createContext, useContext, useMemo } from 'react';

const AppContext = createContext(null);

const mockRooms = [
    { id: 'r1', name: 'Lobby', status: 'ok', temperature: 27 },
    { id: 'r2', name: 'Server Room', status: 'warning', temperature: 46 },
    { id: 'r3', name: 'Kitchen', status: 'ok', temperature: 30 },
    { id: 'r4', name: 'Warehouse', status: 'ok', temperature: 29 },
    { id: 'r5', name: 'Office A', status: 'warning', temperature: 41 },
];

const mockNotifications = [
    {
        id: 'n1',
        room: 'Server Room',
        description: 'Temperature crossed threshold',
        time: '2m ago',
        type: 'warning',
    },
    {
        id: 'n2',
        room: 'Lobby',
        description: 'Sensor heartbeat restored',
        time: '8m ago',
        type: 'success',
    },
    {
        id: 'n3',
        room: 'Office A',
        description: 'Smoke level normalized',
        time: '14m ago',
        type: 'info',
    },
];

export function AppProvider({ children }) {
    const value = useMemo(() => {
        const warningCount = mockRooms.filter((room) => room.status === 'warning').length;
        return {
            user: { name: 'FireBomba Admin' },
            rooms: mockRooms,
            notifications: mockNotifications,
            realtimeError: null,
            systemStatus: {
                allOperational: warningCount === 0,
                sensorsOnline: 28,
                uptime: 99.8,
                fireEvents: warningCount,
            },
        };
    }, []);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used inside AppProvider');
    }
    return context;
}
