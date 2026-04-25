import React, { createContext, useContext, useMemo, useState } from 'react';

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
        description: 'Flame sensor restored',
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
    const [user, setUser] = useState(null);
    const [notifications, setNotifications] = useState(
        mockNotifications.map((item, index) => ({
            ...item,
            title: item.type === 'warning' ? 'Warning Alert' : item.type === 'success' ? 'System Update' : 'Information',
            unread: index < 2,
        }))
    );

    // Accepts the user object returned from your backend login API
    const login = (userData) => {
        setUser({
            id: userData.id,
            name: userData.fullName,
            email: userData.email,
        });
    };

    const logout = async () => {
        try {
            await fetch('http://192.168.1.100:3000/api/logout', { method: 'POST' });
        } catch (_) {}
        setUser(null);
    };

    const markAllRead = () => {
        setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
    };

    const markNotificationRead = (id) => {
        setNotifications((prev) =>
            prev.map((item) => (item.id === id ? { ...item, unread: false } : item))
        );
    };

    const value = useMemo(() => {
        const warningCount = mockRooms.filter((room) => room.status === 'warning').length;
        const unreadCount = notifications.filter((item) => item.unread).length;
        return {
            user,
            login,
            logout,
            rooms: mockRooms,
            notifications,
            unreadCount,
            markAllRead,
            markNotificationRead,
            realtimeError: null,
            systemStatus: {
                allOperational: warningCount === 0,
                sensorsOnline: 28,
                uptime: 99.8,
                fireEvents: warningCount,
            },
        };
    }, [notifications, user]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used inside AppProvider');
    }
    return context;
}