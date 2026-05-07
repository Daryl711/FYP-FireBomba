// src/navigation/AppNavigator.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

// User screens
import LoginScreen from "../screens/LoginScreen";
import SignUpScreen from "../screens/SignUpScreen";
import HomeScreen from "../screens/HomeScreen";
import RoomsScreen from "../screens/RoomsScreen";
import RoomDetailScreen from "../screens/RoomDetailScreen";
import AlertsScreen from "../screens/AlertsScreen";
import ProfileScreen from "../screens/ProfileScreen";

// Admin screens
import AdminUsersTab from "../screens/admin/AdminUsersTab";
import AdminRoomsTab from "../screens/admin/AdminRoomsTab";

import { useApp } from "../context/AppContext";
import { COLORS } from "../../constants/theme";

const Tab = createBottomTabNavigator();
const AdminTab = createBottomTabNavigator();

const RootStack = createNativeStackNavigator();
const HomeStackNav = createNativeStackNavigator();
const RoomsStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();

function AdminPlaceholder({ title }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "600", color: "#111" }}>
        {title}
      </Text>
      <Text style={{ marginTop: 8, color: "#666" }}>Coming soon</Text>
    </View>
  );
}

// For demo purposes, we can toggle between user and admin flows using an environment variable.
const OFFLINE_ADMIN_MODE =
  String(process.env.EXPO_PUBLIC_DEMO_ADMIN_MODE || "").toLowerCase() ===
  "true";

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
      <ProfileStackNav.Screen name="Security" component={ProfileScreen} />
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

// Admin Bottom Tab Navigator
function AdminTabs() {
  return (
    <AdminTab.Navigator
      initialRouteName="AdminUsers"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#E53935",
        tabBarInactiveTintColor: "#9CA3AF",
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
          if (route.name === "AdminUsers")
            iconName = focused ? "people" : "people-outline";
          else if (route.name === "AdminRooms")
            iconName = focused ? "home" : "home-outline";
          else if (route.name === "AdminSensors")
            iconName = focused ? "pulse" : "pulse-outline";
          else if (route.name === "AdminAlerts")
            iconName = focused ? "notifications" : "notifications-outline";
          else if (route.name === "AdminProfile")
            iconName = focused ? "person" : "person-outline";

          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <AdminTab.Screen
        name="AdminUsers"
        component={AdminUsersTab}
        options={{ tabBarLabel: "Users" }}
      />
      <AdminTab.Screen
        name="AdminRooms"
        component={AdminRoomsTab}
        options={{ tabBarLabel: "Rooms" }}
      />
      <AdminTab.Screen
        name="AdminSensors"
        children={() => <AdminPlaceholder title="Admin Sensors" />}
        options={{ tabBarLabel: "Sensors" }}
      />
      <AdminTab.Screen
        name="AdminAlerts"
        children={() => <AdminPlaceholder title="Admin Alerts" />}
        options={{ tabBarLabel: "Alerts" }}
      />
      <AdminTab.Screen
        name="AdminProfile"
        children={() => <AdminPlaceholder title="Admin Profile" />}
        options={{ tabBarLabel: "Profile" }}
      />
    </AdminTab.Navigator>
  );
}

// Root Navigator
export default function AppNavigator() {

  // For demo purposes, we can toggle between user and admin flows using an environment variable.
  if (OFFLINE_ADMIN_MODE) {
    return (
      <NavigationContainer>
        <RootStack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Admin"
        >
          <RootStack.Screen name="Admin" component={AdminTabs} />
        </RootStack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="Login"
      >
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="SignUp" component={SignUpScreen} />
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="Admin" component={AdminTabs} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
