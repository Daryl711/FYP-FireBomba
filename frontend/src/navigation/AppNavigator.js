// src/navigation/AppNavigator.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";

import LoginScreen from "../screens/LoginScreen";
import SignUpScreen from "../screens/SignUpScreen";
import OtpScreen from "../screens/OtpScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import HomeScreen from "../screens/HomeScreen";
import BilikRoomsScreen from "../screens/BilikRoomsScreen";
import RoomsScreen from "../screens/RoomsScreen";
import RoomDetailScreen from "../screens/RoomDetailScreen";
import AlertsScreen from "../screens/AlertsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SecurityScreen from "../screens/SecurityScreen";
import PersonalInfoScreen from "../screens/PersonalInfoScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import UnlockScreen from "../screens/UnlockScreen";

import { useApp } from "../context/AppContext";
import { COLORS } from "../../constants/theme";

const Tab = createMaterialTopTabNavigator();

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
      <HomeStackNav.Screen name="BilikRooms" component={BilikRoomsScreen} />
      <HomeStackNav.Screen name="HomeRoomDetail" component={RoomDetailScreen} />
    </HomeStackNav.Navigator>
  );
}

// Profile stack (with sub-screens)
function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStackNav.Screen name="PersonalInfo" component={PersonalInfoScreen} />
      <ProfileStackNav.Screen name="Security" component={SecurityScreen} />
      <ProfileStackNav.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
      />
      <ProfileStackNav.Screen name="SystemSettings" component={ProfileScreen} />
    </ProfileStackNav.Navigator>
  );
}

// Swipeable tab navigator
//
// A pager with the tab bar at the bottom: swipe left/right to move between
// tabs, or tap a tab as before.
const TAB_ICONS = {
  Home: ["home", "home-outline"],
  Rooms: ["grid", "grid-outline"],
  Notifications: ["notifications", "notifications-outline"],
  Profile: ["person", "person-outline"],
};

// First screen of each tab's stack. Swiping only changes tab from these, so a
// sideways swipe on a detail screen (charts, room detail) stays on that screen.
const TAB_ROOT_SCREENS = {
  Home: "HomeMain",
  Rooms: "RoomsList",
  Profile: "ProfileMain",
};

const isAtTabRoot = (route) => {
  const root = TAB_ROOT_SCREENS[route.name];
  if (!root) return true;
  return (getFocusedRouteNameFromRoute(route) ?? root) === root;
};

function SwipeTabBar({ state, descriptors, navigation }) {
  const { unreadCount } = useApp();

  return (
    <View style={tabBar.bar}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? COLORS.primary : COLORS.text3;
        const [activeIcon, inactiveIcon] = TAB_ICONS[route.name];

        // tabPress lets a tab's stack pop back to its first screen when the
        // already-focused tab is tapped again.
        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={tabBar.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            <View style={{ position: "relative" }}>
              <Ionicons
                name={focused ? activeIcon : inactiveIcon}
                size={22}
                color={color}
              />
              {route.name === "Notifications" && (
                <TabBadge count={unreadCount} />
              )}
            </View>
            <Text style={[tabBar.label, { color }]}>
              {descriptors[route.key].options.tabBarLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabBar = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopColor: "rgba(0,0,0,0.08)",
    borderTopWidth: 1,
    paddingTop: 6,
    paddingBottom: 16,
    height: 72,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, fontWeight: "600", marginTop: 2 },
});

function MainTabs() {
  const { t } = useApp();

  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={(props) => <SwipeTabBar {...props} />}
      screenOptions={({ route }) => ({
        swipeEnabled: isAtTabRoot(route),
        lazy: true,
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
            {/* Sits in the logged-out group: the password is checked but no
                session exists until the SMS code comes back. */}
            <RootStack.Screen name="Otp" component={OtpScreen} />
            <RootStack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
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
