import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import {
  getAlerts,
  markAlertRead as apiMarkAlertRead,
  markAllAlertsRead as apiMarkAllRead,
  deleteAlert as apiDeleteAlert,
  hideAllAlerts as apiHideAllAlerts,
  getSensorReading as apiGetSensorReading,
  getRoomData as apiGetRoomData,
  logoutUser,
  saveSession,
  getRefreshToken,
  clearTokens,
  getStoredSession,
  isSessionExpired,
  refreshSession,
  setOnSessionExpired,
  getBiometricPreference,
  setBiometricPreference,
} from "../services/api";
import { getBiometricSupport, promptBiometrics } from "../services/biometrics";

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
      loading: "Loading...",
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
      clear: "Clear",
      clearAll: "Clear All",
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
        security: { title: "Security", subtitle: "Manage security settings" },
      },
      prefItems: {
        notif: { title: "Notifications", subtitle: "Alert preferences" },
        settings: { title: "System Settings", subtitle: "Configure sensors" },
      },
    },
    security: {
      title: "Security Settings",
      biometricSection: "Biometric Login",
      biometricLabel: "Unlock with biometrics",
      biometricHint:
        "Ask for Face ID or your fingerprint when you reopen the app",
      biometricUnavailable: "No biometrics are set up on this device",

      active: "active camera(s)",
      cameraDetection: "Allow camera detection",
      disableTitle: "Disable camera detection feature",
      disableConfirm:
        "Are you sure you want to disable camera detection feature? You can always turn it back on anytime.",
      enableTitle: "Enable camera detection feature",
      enableConfirm:
        "Are you sure you want to disable camera detection feature? You can always turn it off anytime.",
      disable: "Disable",
      enable: "Enable",
      enableAll: "Enable All",
      disableAll: "Disable All",
      disableAllTitle: "Disable camera detection feature for all rooms",
      noRooms: "No rooms found",
      cameraActive: "Active",
      cameraOff: "Deactivated",
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
    unlock: {
      title: "Welcome Back",
      signedInAs: "Signed in as",
      subtitleFace: "Use Face ID to continue",
      subtitleFingerprint: "Use your fingerprint to continue",
      subtitleGeneric: "Use biometrics to continue",
      prompt: "Unlock FireBomba",
      unlockButton: "Unlock",
      retry: "Try Again",
      usePassword: "Use email and password instead",
      usePasscode: "Use device passcode",
      failed: "We could not verify you. Please try again.",
      cancelled: "Unlock cancelled.",
      networkError:
        "Could not reach the server. Check your connection and try again.",
      expiredTitle: "Session Expired",
      sessionExpired:
        "Your session has ended. Please sign in with your email and password.",
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
      termsAndService: "Terms of Service and Privacy Policy",

      listOfTermsAndService: [
        "Welcome to Fire Bomba. By using this application to monitor fire safety devices and systems, you agree to these Terms & Conditions. Fire Bomba is an IoT-based fire monitoring and notification platform designed to assist users in detecting potential fire-related incidents using sensors, video analytics, and machine learning technologies.",

        "1. Purpose & Limitations: This app serves as an auxiliary safety support tool only. It does not replace official emergency response services, professional firefighting systems, fire alarms required by law, or human supervision. Users must always contact emergency services directly during actual emergencies.",

        "2. No Guarantee of Detection: The developers do not guarantee continuous uptime, perfect fire or smoke detection accuracy, immediate notification delivery, or prevention of injury, loss, or property damage. False positives or missed detections may occur due to environmental conditions, hardware limitations, network interruptions, or software errors. Users are responsible for maintaining proper fire safety measures independently of the App.",

        "3. User Responsibilities: Users agree to use the system lawfully and responsibly, maintain their IoT devices, sensors, cameras, and network connections, keep account credentials secure, and ensure authorized installation and testing of connected hardware. Users are solely responsible for any damages caused by improper use, unauthorized modifications, or negligent operation.",

        "4. Hardware Control & Testing: Certain features allow remote activation of connected hardware such as water pumps and alarms. These features should only be used during actual emergencies or authorized testing and maintenance periods. Improper use may result in property damage, equipment malfunction, or unnecessary water discharge.",

        "5. Video Monitoring & Camera Usage: Video streaming and object detection features are optional and may be disabled through the Settings menu. When enabled, video is used solely for fire and smoke detection purposes. Access to video footage is restricted to the room owner or authorized users only — administrators and developers do not intentionally access private footage unless legally required or explicitly authorized. Users are responsible for complying with local privacy and surveillance laws when deploying cameras.",

        "6. Limitation of Liability: To the maximum extent permitted by law, the developers, contributors, and affiliated parties shall not be liable for fire incidents, property damage, personal injury, data loss, service interruptions, notification failures, hardware malfunctions, or any indirect or consequential damages arising from use of the App. Use of the system is entirely at the user's own risk.",

        "7. Changes to the Service: The developers reserve the right to modify or discontinue features, update system functionality, and change these Terms & Conditions at any time without prior notice. Continued use of the App after updates constitutes acceptance of the revised terms.",
      ],

      listOfPrivacyStatement: [
        "Fire Bomba values user privacy and is committed to protecting user data and system security. Depending on enabled features, the App may collect sensor readings (temperature, smoke, gas, humidity, flame detection), device identifiers, camera and video streams, alert history and timestamps, and user account information such as email and room ownership data.",

        "1. How Data Is Used: Collected data is used exclusively for fire detection and notification services, real-time monitoring dashboards, system analytics and performance improvements, and device synchronization and alert delivery. Data is not sold to third parties.",

        "2. Video & Camera Privacy: Camera functionality is entirely optional. If enabled, video is processed for object detection and monitoring purposes only, and access is limited to authorized room owners. Video streams are not publicly accessible and administrators are not intended to access private streams. Users may disable video monitoring at any time through the Settings menu.",

        "3. Data Security: Reasonable technical measures are implemented to protect user data, including authentication controls, restricted video access, and secure communication between devices and servers where applicable. However, no system can guarantee complete security against unauthorized access, cyberattacks, or hardware failures.",

        "4. Data Retention & Third-Party Services: Sensor logs, alerts, and video-related data may be retained temporarily for operational purposes, diagnostics, or system improvements. The App may rely on third-party infrastructure including cloud hosting providers, push notification services, networking or streaming frameworks, and machine learning libraries. These services may process limited technical information necessary for system operation.",

        "5. User Rights: Users may disable optional video features, request account deletion where supported, remove connected devices from the system, and stop using the service at any time. For questions, issues, or concerns regarding privacy or system usage, please contact the Fire Bomba development team or your system administrator.",
      ],

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
      loading: "Memuatkan...",
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
      clear: "Kosongkan",
      clearAll: "Kosongkan Semua",
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
    unlock: {
      title: "Selamat Kembali",
      signedInAs: "Log masuk sebagai",
      subtitleFace: "Gunakan Face ID untuk teruskan",
      subtitleFingerprint: "Gunakan cap jari anda untuk teruskan",
      subtitleGeneric: "Gunakan biometrik untuk teruskan",
      prompt: "Buka Kunci FireBomba",
      unlockButton: "Buka Kunci",
      retry: "Cuba Lagi",
      usePassword: "Guna e-mel dan kata laluan",
      usePasscode: "Guna kod laluan peranti",
      failed: "Kami tidak dapat mengesahkan anda. Sila cuba lagi.",
      cancelled: "Buka kunci dibatalkan.",
      networkError:
        "Tidak dapat menghubungi pelayan. Sila semak sambungan anda dan cuba lagi.",
      expiredTitle: "Sesi Tamat",
      sessionExpired:
        "Sesi anda telah tamat. Sila log masuk dengan e-mel dan kata laluan anda.",
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

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // A stored session exists and is still inside its 30/7-day window, but the
  // app has just cold-started and needs a biometric scan before letting go.
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [lockedUser, setLockedUser] = useState(null);
  const [biometricSupport, setBiometricSupport] = useState({
    available: false,
    type: null,
  });
  const [biometricEnabled, setBiometricEnabledState] = useState(true);
  const [language, setLanguage] = useState("en");
  const [sensorReading, setSensorReading] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [roomData, setRoomData] = useState(null);

  const alertRef = useRef(null);
  const sensorDataRef = useRef(null);
  const soundRef = useRef(null);
  const prevUnreadRef = useRef(0);

  // Normalises the API's { userId, fullName, email } into the shape the
  // screens read, and marks the app as unlocked.
  const applySession = useCallback((sessionUser, accessToken) => {
    if (sessionUser) {
      setUser({
        id: sessionUser.userId ?? sessionUser.id,
        name: sessionUser.fullName ?? sessionUser.name,
        email: sessionUser.email,
      });
    }
    setToken(accessToken);
    setNeedsUnlock(false);
  }, []);

  // Decide on cold start: password screen, biometric unlock, or straight in.
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [session, support, preferenceEnabled] = await Promise.all([
          getStoredSession(),
          getBiometricSupport(),
          getBiometricPreference(),
        ]);

        setBiometricSupport(support);
        setBiometricEnabledState(preferenceEnabled);

        // Never signed in, or signed out last time.
        if (!session.refreshToken) {
          return;
        }

        // Past the deadline "remember me" bought (30 days ticked, 7 days not).
        // Drop it here so the biometric screen never even appears; the server
        // enforces the same rule independently on the next refresh.
        if (isSessionExpired(session.sessionExpiresAt)) {
          await clearTokens();
          return;
        }

        setLockedUser(session.user);

        if (support.available && preferenceEnabled) {
          setNeedsUnlock(true);
          return;
        }

        // No sensor, nothing enrolled, or the user turned biometrics off. The
        // session is still valid, so honour it rather than demanding a
        // password the "remember me" tick was supposed to avoid.
        const result = await refreshSession();
        if (result.ok) {
          applySession(result.user || session.user, result.accessToken);
        } else if (result.reason === "NETWORK") {
          // Server unreachable - keep the session and go in with the stored
          // token; authFetch retries the refresh once the network is back.
          applySession(session.user, session.accessToken);
        }
        // Anything else (expired / rejected) leaves us on the login screen.
      } catch {
        // Storage unavailable — start fresh at the login screen.
      } finally {
        setAuthReady(true);
      }
    };
    bootstrap();
  }, [applySession]);

  // The server can end a session mid-use (deadline passed while the app was
  // open). Drop straight back to the login screen when that happens.
  useEffect(() => {
    setOnSessionExpired(() => {
      clearInterval(alertRef.current);
      clearInterval(sensorDataRef.current);
      prevUnreadRef.current = 0;
      setUser(null);
      setToken(null);
      setNeedsUnlock(false);
      setLockedUser(null);
      setNotifications([]);
    });

    return () => setOnSessionExpired(null);
  }, []);

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

  const fetchAlerts = async () => {
    const result = await getAlerts();
    if (!result.error && Array.isArray(result)) {
      const visibleNotifications = result.filter((item) => !item.hidden);
      const newUnreadCount = visibleNotifications.filter(
        (a) => a.unread,
      ).length;
      if (newUnreadCount > prevUnreadRef.current && soundRef.current) {
        soundRef.current
          .playFromPositionAsync(0)
          .catch((e) => console.warn("Alarm play failed:", e));
      }
      prevUnreadRef.current = newUnreadCount;
      setNotifications(visibleNotifications);
    }
  };

  const fetchSensorData = async () => {
    const result = await apiGetSensorReading();
    if (Object.keys(result).length !== 0) {
      setSensorReading(result);
    }
  };

  // Start polling when the user logs in
  useEffect(() => {
    if (token) {
      fetchAlerts();
      alertRef.current = setInterval(() => fetchAlerts(), 10000);
      sensorDataRef.current = setInterval(() => fetchSensorData(), 5000);
    }
    return () => {
      clearInterval(alertRef.current);
      clearInterval(sensorDataRef.current);
    };
  }, [token]);

  useEffect(() => {
    const fetchData = async () => {
      if (token) {
        const fetchedRoomData = await apiGetRoomData();
        setRoomData([fetchedRoomData]);
      }
    };

    fetchData();
  }, [token]);

  // Accepts { userId, fullName, email } from login response + both tokens.
  // `options` carries the session deadline and remember-me flag the server
  // returned, which together drive the biometric unlock on the next launch.
  const login = async (userData, accessToken, refreshToken, options = {}) => {
    const { sessionExpiresAt = null, rememberMe = false } = options;

    await saveSession({
      accessToken,
      refreshToken,
      sessionExpiresAt,
      rememberMe,
      user: userData,
    });

    // Re-check support here so a password login always re-arms biometrics for
    // the next cold start.
    const support = await getBiometricSupport();
    setBiometricSupport(support);

    setLockedUser(userData);
    applySession(userData, accessToken);
  };

  // Called by the unlock screen. Prompt strings come from the caller so the
  // scan dialog is translated the same way as the rest of the UI.
  const unlockWithBiometrics = async (prompts = {}) => {
    const support = biometricSupport.available
      ? biometricSupport
      : await getBiometricSupport();

    if (!support.available) return { ok: false, reason: "UNAVAILABLE" };

    const scan = await promptBiometrics({
      promptMessage: prompts.promptMessage,
      cancelLabel: prompts.cancelLabel,
      fallbackLabel: prompts.fallbackLabel,
    });

    if (!scan.success) {
      return { ok: false, reason: scan.cancelled ? "CANCELLED" : "FAILED" };
    }

    const result = await refreshSession();

    if (result.ok) {
      applySession(result.user || lockedUser, result.accessToken);
      return { ok: true };
    }

    // Keep the user on the unlock screen for a network blip; the session is
    // untouched and a retry will work once the server is reachable.
    if (result.reason === "NETWORK") return { ok: false, reason: "NETWORK" };

    // Session is genuinely over - fall through to the password screen.
    setNeedsUnlock(false);
    setLockedUser(null);
    return { ok: false, reason: result.reason };
  };

  // "Use password instead" on the unlock screen: abandon the stored session.
  const usePasswordInstead = async () => {
    await clearTokens();
    setNeedsUnlock(false);
    setLockedUser(null);
    setUser(null);
    setToken(null);
  };

  const updateBiometricEnabled = async (enabled) => {
    setBiometricEnabledState(enabled);
    await setBiometricPreference(enabled);
  };

  const logout = async () => {
    clearInterval(alertRef.current);
    clearInterval(sensorDataRef.current);
    prevUnreadRef.current = 0;
    const refreshToken = await getRefreshToken();
    await logoutUser(refreshToken);
    setUser(null);
    setToken(null);
    setNeedsUnlock(false);
    setLockedUser(null);
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
    if (token) await apiMarkAllRead();
  };

  const markNotificationRead = async (id) => {
    stopAlarm();
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
    if (token) await apiMarkAlertRead(id);
  };

  const clearNotification = async (id) => {
    stopAlarm();
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    if (token) await apiDeleteAlert(id);
  };

  const clearAllNotifications = async () => {
    stopAlarm();
    setNotifications([]);
    if (token) await apiHideAllAlerts();
  };

  const value = useMemo(() => {
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
      authReady,
      needsUnlock,
      lockedUser,
      biometricSupport,
      biometricEnabled,
      unlockWithBiometrics,
      usePasswordInstead,
      updateBiometricEnabled,
      language,
      setLanguage,
      t,
      login,
      logout,
      roomData,
      notifications,
      sensorReading,
      unreadCount,
      markAllRead,
      markNotificationRead,
      clearNotification,
      clearAllNotifications,
      refreshAlerts: () => token && fetchAlerts(),
      realtimeError: null,
      systemStatus: {
        allOperational: false,
        sensorsOnline: 28,
        uptime: 99.8,
        fireEvents: 2,
      },
    };
  }, [
    language,
    notifications,
    user,
    token,
    authReady,
    needsUnlock,
    lockedUser,
    biometricSupport,
    biometricEnabled,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return context;
}
