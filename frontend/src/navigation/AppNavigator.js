// src/navigation/AppNavigator.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import HomeScreen from '../screens/HomeScreen';
import RoomsScreen from '../screens/RoomsScreen';
import RoomDetailScreen from '../screens/RoomDetailScreen';

import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabBadge({ count }) {
    if (!count) return null;
    return (
        <View style={badge.wrap}>
        <Text style={badge.text}>{count > 9 ? '9+' : count}</Text>
        </View>
    );
}

const badge = StyleSheet.create({
    wrap: {
        position: 'absolute', top: -4, right: -8,
        backgroundColor: COLORS.primary, minWidth: 16, height: 16,
        borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    text: { color: '#fff', fontSize: 9, fontWeight: '700' },
});

// Rooms stack
function RoomsStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RoomsList" component={RoomsScreen} />
        <Stack.Screen name="RoomDetail" component={RoomDetailScreen} />
        </Stack.Navigator>
    );
}

// Home stack
function HomeStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="HomeMain" component={HomeScreen} />
        <Stack.Screen name="RoomDetail" component={RoomDetailScreen} />
        </Stack.Navigator>
    );
}

// Profile stack (with sub-screens)
function ProfileStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ProfileMain" component={ProfileScreen} />
        <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
        <Stack.Screen name="SystemSettings" component={SystemSettingsScreen} />
        </Stack.Navigator>
    );
}

// Bottom Tab Navigator
function MainTabs() {
    const { unreadCount } = useApp();

    return (
        <Tab.Navigator
        screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.text3,
            tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: 'rgba(0,0,0,0.08)',
            borderTopWidth: 1,
            paddingTop: 6,
            paddingBottom: 16,
            height: 72,
            },
            tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
            tabBarIcon: ({ focused, color }) => {
            let iconName;
            if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Rooms') iconName = focused ? 'grid' : 'grid-outline';
            else if (route.name === 'Notifications') iconName = focused ? 'notifications' : 'notifications-outline';
            else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

            return (
                <View style={{ position: 'relative' }}>
                <Ionicons name={iconName} size={22} color={color} />
                {route.name === 'Notifications' && <TabBadge count={unreadCount} />}
                </View>
            );
            },
        })}
        >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Rooms" component={RoomsStack} />
        <Tab.Screen name="Notifications" component={AlertsScreen} />
        <Tab.Screen name="Profile" component={ProfileStack} />
        </Tab.Navigator>
    );
}

// Root Navigator
export default function AppNavigator() {
    return (
        <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
        </Stack.Navigator>
        </NavigationContainer>
    );
}
