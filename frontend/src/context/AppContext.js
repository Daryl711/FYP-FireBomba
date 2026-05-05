import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Audio } from "expo-av";
import {
  getAlerts,
  markAlertRead as apiMarkAlertRead,
  markAllAlertsRead as apiMarkAllRead,
  getSensorReading as apiGetSensorReading,
} from "../services/api";

const AppContext = createContext(null);

const translations = {
  en: {
    nav: {
      home: "Home",
      rooms: "Rooms",
      notifications: "Alerts",
      profile: "Profile",
    },
    common: {
      cancel: "Cancel",
      comingSoon: "Coming Soon",
      noData: "No data yet.",
    },
    home: {
      welcomeBack: "Welcome Back,",
      activeRooms: "Active Rooms",
      warnings: "Warnings",
      systemStatus: "System Status",
      allOperational: "All Systems Operational",
      warningDetected: "Warning Detected",
      sensorsOnline: "Sensors Online",
      uptime: "Uptime",
      fireEvents: "Fire Events",
      realtimeUnavailable: "Realtime API unavailable: {{error}}",
      recentAlerts: "Recent Alerts",
      viewAll: "View all",
      noAlerts: "No alerts yet",
      roomOverview: "Room Overview",
      temp: "Temp",
      userFallback: "User",
    },
    rooms: {
      title: "Room Monitor",
      subtitle: "Select a room to view details",
      temperature: "Temperature",
      alert: "Alert",
      alerts: "Alerts",
      totalRooms: "Total Rooms",
      safe: "Safe",
      warnings: "Warnings",
    },
    alerts: {
      title: "Notifications",
      unreadSubtitle: "{{count}} unread notification{{suffix}}",
      allCaughtUp: "All caught up!",
      markAllRead: "Mark all as read",
      empty: "No notifications yet",
      warningTitle: "Warning Alert",
      successTitle: "System Update",
      infoTitle: "Information",
    },
    roomDetail: {
      unavailable: "Room data is currently unavailable.",
      goBack: "Go Back",
      realtimeMonitoring: "Real-time monitoring",
      liveCameraFeed: "Live Camera Feed",
      temperature: "Temperature",
      smoke: "Smoke",
      co: "Carbon monoxide",
      flame: "Flame",
      detected: "DETECTED",
      clear: "Clear",
      flameDetected: "Flame detected!",
      noFlameDetected: "No flame detected",
      sensorHistory: "Sensor History",
      noSensorData: "No sensor data yet.",
      waterPumpSystem: "Water Pump System",
      manualSuppression: "Manual fire suppression control",
      status: "Status:",
      active: "Active",
      standby: "Standby",
      deactivatePump: "Deactivate Pump",
      activatePump: "Activate Pump",
      lastUpdate: "Last Update",
      connection: "Connection",
      online: "Online",
      activateTitle: "Activate Water Pump",
      activateConfirm:
        "Are you sure you want to activate the water pump in {{room}}?",
      activate: "Activate",
    },
    profile: {
      account: "ACCOUNT",
      preferences: "PREFERENCES",
      about: "ABOUT",
      rooms: "Rooms",
      sensors: "Sensors",
      alerts: "Alerts",
      signOut: "Sign Out",
      signOutTitle: "Sign Out",
      signOutConfirm: "Are you sure you want to sign out?",
      userFallback: "User",
      language: "Language",
      languageSubtitle: "Choose app language",
      english: "English",
      bahasaMalaysia: "Bahasa Malaysia",
      comingSoonMessage: "This feature will be available in a future update.",
      accountItems: {
        personal: {
          title: "Personal Information",
          subtitle: "Update your details",
        },
        email: { title: "Email & Contact", subtitle: "Manage contact info" },
        security: { title: "Security", subtitle: "Password & 2FA" },
      },
      prefItems: {
        notif: { title: "Notifications", subtitle: "Alert preferences" },
        settings: { title: "System Settings", subtitle: "Configure sensors" },
      },
    },
    login: {
      title: "Welcome Back",
      subtitle: "Sign in to your account",
      email: "Email",
      emailPlaceholder: "Enter your email",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      rememberMe: "Remember me",
      forgotPassword: "Forgot password?",
      signIn: "Sign In",
      noAccount: "Don't have an account?",
      signUp: "Sign Up",
      missingFieldsTitle: "Missing Fields",
      missingFieldsMessage: "Please enter both email and password.",
      loginFailed: "Login Failed",
      errorTitle: "Error",
      connectError: "Could not connect to the server. Is your backend running?",
    },
    signup: {
      title: "Create Account",
      subtitle: "Sign up for FireGuard to monitor your home",
      fullName: "Full Name",
      fullNamePlaceholder: "John Doe",
      email: "Email Address",
      emailPlaceholder: "you@example.com",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      confirmPassword: "Confirm Password",
      confirmPasswordPlaceholder: "Confirm your password",
      terms: "I agree to the",
      termsOfService: "Terms of Service",
      and: "and",
      privacyPolicy: "Privacy Policy",
      createAccount: "Create Account",
      alreadyHaveAccount: "Already have an account?",
      signIn: "Sign In",
      enterFullName: "Please enter your full name.",
      enterEmail: "Please enter your email address.",
      invalidEmail: "Please enter a valid email address.",
      enterPassword: "Please enter a password.",
      passwordMin: "Password must be at least 6 characters.",
      passwordMismatch: "Passwords do not match.",
      mustAgreeTerms: "You must agree to the Terms of Service to sign up.",
      signupFailed: "Sign Up Failed: {{error}}",
      signupSuccess: "Success! Account created. You can now log in.",
      connectError:
        "Error: Could not connect to the server. Make sure your backend is running!",
    },
  },
  ms: {
    nav: {
      home: "Laman Utama",
      rooms: "Bilik",
      notifications: "Amaran",
      profile: "Profil",
    },
    common: {
      cancel: "Batal",
      comingSoon: "Akan Datang",
      noData: "Tiada data lagi.",
    },
    home: {
      welcomeBack: "Selamat Kembali,",
      activeRooms: "Bilik Aktif",
      warnings: "Amaran",
      systemStatus: "Status Sistem",
      allOperational: "Semua Sistem Beroperasi",
      warningDetected: "Amaran Dikesan",
      sensorsOnline: "Sensor Dalam Talian",
      uptime: "Masa Operasi",
      fireEvents: "Kejadian Kebakaran",
      realtimeUnavailable: "API masa nyata tidak tersedia: {{error}}",
      recentAlerts: "Amaran Terkini",
      viewAll: "Lihat semua",
      noAlerts: "Belum ada amaran",
      roomOverview: "Gambaran Bilik",
      temp: "Suhu",
      userFallback: "Pengguna",
    },
    rooms: {
      title: "Pemantau Bilik",
      subtitle: "Pilih bilik untuk lihat butiran",
      temperature: "Suhu",
      alert: "Amaran",
      alerts: "Amaran",
      totalRooms: "Jumlah Bilik",
      safe: "Selamat",
      warnings: "Amaran",
    },
    alerts: {
      title: "Notifikasi",
      unreadSubtitle: "{{count}} notifikasi belum dibaca",
      allCaughtUp: "Semua sudah dibaca!",
      markAllRead: "Tandakan semua dibaca",
      empty: "Belum ada notifikasi",
      warningTitle: "Amaran Bahaya",
      successTitle: "Kemas Kini Sistem",
      infoTitle: "Maklumat",
    },
    roomDetail: {
      unavailable: "Data bilik tidak tersedia buat masa ini.",
      goBack: "Kembali",
      realtimeMonitoring: "Pemantauan masa nyata",
      liveCameraFeed: "Paparan Kamera Langsung",
      temperature: "Suhu",
      smoke: "Asap",
      gas: "Gas",
      flame: "Api",
      detected: "DIKESAN",
      clear: "Normal",
      flameDetected: "Api dikesan!",
      noFlameDetected: "Tiada api dikesan",
      sensorHistory: "Rekod Sensor",
      noSensorData: "Belum ada data sensor.",
      waterPumpSystem: "Sistem Pam Air",
      manualSuppression: "Kawalan pemadaman kebakaran manual",
      status: "Status:",
      active: "Aktif",
      standby: "Sedia",
      deactivatePump: "Nyahaktifkan Pam",
      activatePump: "Aktifkan Pam",
      lastUpdate: "Kemaskini Terakhir",
      connection: "Sambungan",
      online: "Dalam Talian",
      activateTitle: "Aktifkan Pam Air",
      activateConfirm:
        "Adakah anda pasti mahu mengaktifkan pam air di {{room}}?",
      activate: "Aktifkan",
    },
    profile: {
      account: "AKAUN",
      preferences: "KEUTAMAAN",
      about: "TENTANG",
      rooms: "Bilik",
      sensors: "Sensor",
      alerts: "Amaran",
      signOut: "Log Keluar",
      signOutTitle: "Log Keluar",
      signOutConfirm: "Adakah anda pasti mahu log keluar?",
      userFallback: "Pengguna",
      language: "Bahasa",
      languageSubtitle: "Pilih bahasa aplikasi",
      english: "Inggeris",
      bahasaMalaysia: "Bahasa Malaysia",
      comingSoonMessage: "Ciri ini akan tersedia dalam kemas kini akan datang.",
      accountItems: {
        personal: {
          title: "Maklumat Peribadi",
          subtitle: "Kemas kini butiran anda",
        },
        email: { title: "E-mel & Kontak", subtitle: "Urus maklumat hubungan" },
        security: { title: "Keselamatan", subtitle: "Kata laluan & 2FA" },
      },
      prefItems: {
        notif: { title: "Notifikasi", subtitle: "Keutamaan amaran" },
        settings: { title: "Tetapan Sistem", subtitle: "Konfigurasi sensor" },
      },
    },
    login: {
      title: "Selamat Kembali",
      subtitle: "Log masuk ke akaun anda",
      email: "E-mel",
      emailPlaceholder: "Masukkan e-mel anda",
      password: "Kata Laluan",
      passwordPlaceholder: "Masukkan kata laluan anda",
      rememberMe: "Ingat saya",
      forgotPassword: "Lupa kata laluan?",
      signIn: "Log Masuk",
      noAccount: "Tiada akaun?",
      signUp: "Daftar",
      missingFieldsTitle: "Medan Tidak Lengkap",
      missingFieldsMessage: "Sila masukkan e-mel dan kata laluan.",
      loginFailed: "Log Masuk Gagal",
      errorTitle: "Ralat",
      connectError:
        "Tidak dapat menyambung ke pelayan. Adakah backend anda sedang berjalan?",
    },
    signup: {
      title: "Cipta Akaun",
      subtitle: "Daftar FireBomba untuk memantau rumah anda",
      fullName: "Nama Penuh",
      fullNamePlaceholder: "Ali Ahmad",
      email: "Alamat E-mel",
      emailPlaceholder: "anda@contoh.com",
      password: "Kata Laluan",
      passwordPlaceholder: "Masukkan kata laluan anda",
      confirmPassword: "Sahkan Kata Laluan",
      confirmPasswordPlaceholder: "Sahkan kata laluan anda",
      terms: "Saya bersetuju dengan",
      termsOfService: "Terma Perkhidmatan",
      and: "dan",
      privacyPolicy: "Dasar Privasi",
      createAccount: "Cipta Akaun",
      alreadyHaveAccount: "Sudah ada akaun?",
      signIn: "Log Masuk",
      enterFullName: "Sila masukkan nama penuh anda.",
      enterEmail: "Sila masukkan alamat e-mel anda.",
      invalidEmail: "Sila masukkan alamat e-mel yang sah.",
      enterPassword: "Sila masukkan kata laluan.",
      passwordMin: "Kata laluan mesti sekurang-kurangnya 6 aksara.",
      passwordMismatch: "Kata laluan tidak sepadan.",
      mustAgreeTerms:
        "Anda mesti bersetuju dengan Terma Perkhidmatan untuk mendaftar.",
      signupFailed: "Pendaftaran Gagal: {{error}}",
      signupSuccess: "Berjaya! Akaun telah dicipta. Anda kini boleh log masuk.",
      connectError:
        "Ralat: Tidak dapat menyambung ke pelayan. Pastikan backend anda sedang berjalan!",
    },
  },
};

const getNestedValue = (object, path) => {
  const keys = path.split(".");
  let cursor = object;

  for (const key of keys) {
    cursor = cursor?.[key];
    if (cursor === undefined) {
      return undefined;
    }
  }

  return cursor;
};

const interpolate = (template, params = {}) =>
  Object.entries(params).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`{{${key}}}`, "g"), String(value)),
    template,
  );

const mockRooms = [
  { id: "r1", name: "Room 1", status: "ok", temperature: 27 },
  { id: "r2", name: "Server Room", status: "warning", temperature: 46 },
  { id: "r3", name: "Kitchen", status: "ok", temperature: 30 },
  { id: "r4", name: "Warehouse", status: "ok", temperature: 29 },
  { id: "r5", name: "Office A", status: "warning", temperature: 41 },
];

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [language, setLanguage] = useState("en");
  const [sensorReading, setSensorReading] = useState({});
  const [notifications, setNotifications] = useState([]);
  const alertRef = useRef(null);
  const sensorDataRef = useRef(null);
  const soundRef = useRef(null);
  const prevUnreadRef = useRef(0);

  // Load alarm sound once on mount
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
    }).catch(() => {});
    Audio.Sound.createAsync(require("../../assets/sounds/alarm.wav"), {
      isLooping: true,
    })
      .then(({ sound }) => {
        soundRef.current = sound;
      })
      .catch((e) => {
        console.warn("Alarm sound failed to load:", e);
      });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const fetchAlerts = async (authToken) => {
    const result = await getAlerts(authToken);
    if (!result.error && Array.isArray(result)) {
      const newUnreadCount = result.filter((a) => a.unread).length;
      if (newUnreadCount > prevUnreadRef.current && soundRef.current) {
        soundRef.current
          .playFromPositionAsync(0)
          .catch((e) => console.warn("Alarm play failed:", e));
      }
      prevUnreadRef.current = newUnreadCount;
      setNotifications(result);
    }
  };

  const fetchSensorData = async (authToken) => {
    const result = await apiGetSensorReading(authToken);
    if (Object.keys(result).length !== 0) {
      setSensorReading(result);
    }

  };

  // Start polling when the user logs in
  useEffect(() => {
    if (token) {
      fetchAlerts(token);
      alertRef.current = setInterval(() => fetchAlerts(token), 10000);
      sensorDataRef.current = setInterval(() => fetchSensorData(token), 5000);
    }
    return () => {
      clearInterval(alertRef.current);
      clearInterval(sensorDataRef.current);
    };
  }, [token]);

  // Accepts { userId, fullName, email } from login response + the JWT token
  const login = (userData, authToken) => {
    setUser({
      id: userData.userId,
      name: userData.fullName,
      email: userData.email,
    });
    setToken(authToken);
  };

  const logout = async () => {
    clearInterval(alertRef.current);
    clearInterval(sensorDataRef.current);
    prevUnreadRef.current = 0;
    setUser(null);
    setToken(null);
    setNotifications([]);
  };

  const stopAlarm = () => {
    soundRef.current?.stopAsync().catch(() => {});
  };

  const markAllRead = async () => {
    stopAlarm();
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, unread: false })),
    );
    if (token) await apiMarkAllRead(token);
  };

  const markNotificationRead = async (id) => {
    stopAlarm();

    console.log(token);

  
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
    if (token) await apiMarkAlertRead(id, token);
  };

  const value = useMemo(() => {
    const warningCount = mockRooms.filter(
      (room) => room.status === "warning",
    ).length;
    const unreadCount = notifications.filter((item) => item.unread).length;
    // expose so components can manually refresh (e.g. after pump activation)
    const t = (key, params) => {
      const dictionary = translations[language] || translations.en;
      const fallback = translations.en;
      const localized = getNestedValue(dictionary, key);
      const fallbackText = getNestedValue(fallback, key);
      const resolved = localized ?? fallbackText ?? key;

      return typeof resolved === "string"
        ? interpolate(resolved, params)
        : resolved;
    };

    return {
      user,
      token,
      language,
      setLanguage,
      t,
      login,
      logout,
      rooms: mockRooms,
      notifications,
      sensorReading,
      unreadCount,
      markAllRead,
      markNotificationRead,
      refreshAlerts: () => token && fetchAlerts(token),
      realtimeError: null,
      systemStatus: {
        allOperational: warningCount === 0,
        sensorsOnline: 28,
        uptime: 99.8,
        fireEvents: warningCount,
      },
    };
  }, [language, notifications, user, token]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return context;
}
