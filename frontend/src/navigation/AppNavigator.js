// src/navigation/AppNavigator.js
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import LoginScreen from "../screens/LoginScreen";
import SignUpScreen from "../screens/SignUpScreen";
import HomeScreen from "../screens/HomeScreen";
import RoomsScreen from "../screens/RoomsScreen";
import RoomDetailScreen from "../screens/RoomDetailScreen";
import AlertsScreen from "../screens/AlertsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SecurityScreen from "../screens/SecurityScreen";
import UnlockScreen from "../screens/UnlockScreen";

import { useApp } from "../context/AppContext";
import { COLORS } from "../../constants/theme";

const Tab = createBottomTabNavigator();

const RootStack = createNativeStackNavigator();
const HomeStackNav = createNativeStackNavigator();
const RoomsStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();

function TabBadge({ count }) {
  if (!count) return null;
  return (
    <View style={badge.wrap}>
      <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: COLORS.primary,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  text: { color: "#fff", fontSize: 9, fontWeight: "700" },
});

// Rooms stack
function RoomsStack() {
  return (
    <RoomsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <RoomsStackNav.Screen name="RoomsList" component={RoomsScreen} />
      <RoomsStackNav.Screen
        name="ListRoomDetail"
        component={RoomDetailScreen}
      />
    </RoomsStackNav.Navigator>
  );
}

// Home stack
function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeStackNav.Screen name="HomeRoomDetail" component={RoomDetailScreen} />
    </HomeStackNav.Navigator>
  );
}

// Profile stack (with sub-screens)
function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStackNav.Screen
        name="PersonalInfo"
        component={ProfileScreen}
      />
      <ProfileStackNav.Screen name="Security" component={SecurityScreen} />
      <ProfileStackNav.Screen
        name="NotificationSettings"
        component={ProfileScreen}
      />
      <ProfileStackNav.Screen
        name="SystemSettings"
        component={ProfileScreen}
      />
    </ProfileStackNav.Navigator>
  );
}

// Bottom Tab Navigator
function MainTabs() {
  const { unreadCount, t } = useApp();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.text3,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "rgba(0,0,0,0.08)",
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: 16,
          height: 72,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === "Home")
            iconName = focused ? "home" : "home-outline";
          else if (route.name === "Rooms")
            iconName = focused ? "grid" : "grid-outline";
          else if (route.name === "Notifications")
            iconName = focused ? "notifications" : "notifications-outline";
          else if (route.name === "Profile")
            iconName = focused ? "person" : "person-outline";

          return (
            <View style={{ position: "relative" }}>
              <Ionicons name={iconName} size={22} color={color} />
              {route.name === "Notifications" && (
                <TabBadge count={unreadCount} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{ tabBarLabel: t("nav.home") }}
      />
      <Tab.Screen
        name="Rooms"
        component={RoomsStack}
        options={{ tabBarLabel: t("nav.rooms") }}
      />
      <Tab.Screen
        name="Notifications"
        component={AlertsScreen}
        options={{ tabBarLabel: t("nav.notifications") }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarLabel: t("nav.profile") }}
      />
    </Tab.Navigator>
  );
}

// Root Navigator
//
// Which screens exist is derived from auth state rather than navigated to, so
// the app moves on its own when a session is unlocked or expires - including
// the 30/7-day auto-logout, which can fire while the app is already open.
export default function AppNavigator() {
  const { authReady, token, needsUnlock } = useApp();

  // Held until the stored session has been read, otherwise the login screen
  // flashes before the unlock screen replaces it.
  if (!authReady) {
    return (
      <View style={splash.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : needsUnlock ? (
          <RootStack.Screen name="Unlock" component={UnlockScreen} />
        ) : (
          <>
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF9F9",
  },
});
