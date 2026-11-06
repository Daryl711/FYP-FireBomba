import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as SecureStore from "expo-secure-store";
import {
  getAlerts,
  markAlertRead as apiMarkAlertRead,
  markAllAlertsRead as apiMarkAllRead,
  deleteAlert as apiDeleteAlert,
  hideAllAlerts as apiHideAllAlerts,
  getBilikData as apiGetBilikData,
  getRoomsByBilik,
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
  getAvatar as apiGetAvatar,
  uploadAvatar as apiUploadAvatar,
  updateStoredUser,
  registerPushToken as apiRegisterPushToken,
  unregisterPushToken as apiUnregisterPushToken,
  sendTestAlarm as apiSendTestAlarm,
  getSystemHealth as apiGetSystemHealth,
  getFireSafetyProgress as apiGetFireSafetyProgress,
  recordFireSafetyQuizPass as apiRecordFireSafetyQuizPass,
} from "../services/api";
import { getBiometricSupport, promptBiometrics } from "../services/biometrics";
import {
  registerForPushNotifications,
  addNotificationTapListener,
} from "../services/notifications";
import {
  DEFAULT_ALARM_SOUND,
  getAlarmSound,
  getAlarmSoundPreference,
  setAlarmSoundPreference,
} from "../services/alarmSounds";

const AppContext = createContext(null);

// Fire-safety learning content is kept here so every screen uses the same
// English/Bahasa Malaysia wording selected by the user.
const FIRE_SAFETY_CONTENT = {
  en: {
    title: "Fire Safety Modules",
    subtitle: "Practical fire safety for your longhouse community",
    learningHeading: "LEARNING MODULES",
    practiceHeading: "PUT IT INTO PRACTICE",
    moduleLabel: "MODULE",
    modules: [
      {
        id: "basics",
        icon: "flame-outline",
        title: "Fire basics",
        summary: "Recognise fire growth and common fire classes.",
        bullets: [
          "Ignition is the safest time to act.",
          "Growth means the fire is spreading; only tackle a small fire if safe.",
          "A fully developed fire is not for residents to fight. Evacuate.",
          "Smoke and heat remain dangerous during decay.",
        ],
        detailTitle: "Fire classes",
        details: [
          "Class A — wood, bamboo, cloth, paper and thatch.",
          "Class B — petrol, kerosene and cooking oil.",
          "Class C — LPG and other flammable gases.",
          "Class E — wiring, sockets, appliances and generators.",
        ],
        takeaway:
          "Padam dan lari: extinguish only when it is safe; otherwise leave immediately.",
      },
      {
        id: "extinguishers",
        icon: "water-outline",
        title: "Extinguisher guide",
        summary: "Choose suitable equipment and use PASS safely.",
        bullets: [
          "Raise the alarm before attempting to fight a fire.",
          "Keep a clear exit behind you.",
          "Aim at the base of the fire and sweep side to side.",
          "Leave immediately if the fire grows or you feel unsure.",
        ],
        detailTitle: "Tap an extinguisher type",
        details: [
          "Dry powder — suitable for Classes A, B, C and E; a useful general-purpose choice.",
          "CO₂ — suitable for electrical fires and some liquid fires; leaves no residue. Avoid confined spaces.",
          "Foam — suitable for liquid fires and some solid materials.",
          "Water or water mist — suitable for Class A. Never use plain water on oil or electrical fires.",
        ],
        takeaway:
          "PASS: Pull the pin, Aim at the base, Squeeze the handle, Sweep side to side.",
      },
      {
        id: "cycle",
        icon: "people-outline",
        title: "Incident management",
        summary: "Prepare, respond and recover together.",
        bullets: [
          "Prevention: keep exits clear and maintain safe wiring and fuel storage.",
          "Preparedness: practise drills, alarms, evacuation and headcounts.",
          "Response: evacuate, gather upwind and call Bomba at 999.",
          "Relief: wait for clearance, provide first aid and organise support.",
        ],
        detailTitle: "When calling 999",
        details: [
          "Give the longhouse name and nearest road, river or landmark.",
          "Say what is burning and where it is located.",
          "Share the number of people involved or still unaccounted for.",
          "Do not re-enter until Bomba declares the area safe.",
        ],
        takeaway:
          "Agree on an alarm signal, assembly point and helpers for children, older people and anyone needing assistance.",
      },
    ],
    checklistTitle: "Longhouse safety checklist",
    checklistSubtitle:
      "Mark each item that is ready. Your progress is saved on this device.",
    checklist: [
      "Smoke alarms installed and working",
      "Extinguishers present, in date and easy to reach",
      "Exits and ruai clear of obstructions",
      "Wiring and sockets in good condition",
      "Gas cylinders upright; hoses checked",
      "Fuel stored away from living areas",
      "Everyone knows the community alarm signal",
      "Assembly point agreed and known",
      "Helpers assigned for alarm, Bomba call and evacuation support",
      "Emergency numbers displayed",
    ],
    quizTitle: "Fire safety quiz",
    quizSubtitle: "10 questions",
    startQuiz: "Start quiz",
    submitQuiz: "Check answers",
    tryAgain: "Try again",
    retrySync: "Sync badge",
    nextQuestion: "Next question",
    question: "Question {{current}} of {{total}}",
    score: "You scored {{score}}/10",
    passed: "Passed! Safety quiz badge earned.",
    failed: "Not passed yet. Review the modules and try again.",
    badge: "Fire Safety Certified",
    syncPending:
      "Saved on this device. We will sync your badge when you are online.",
    correct: "Correct",
    incorrect: "Review this answer",
    finish: "Finish",
    checklistScore: "{{done}}/10 ready",
    checklistComplete: "All checklist items are ready!",
    questions: [
      [
        "When is the best time to extinguish a fire?",
        [
          "During ignition, while it is small and safe",
          "When it is fully developed",
          "After smoke fills the building",
        ],
        0,
      ],
      [
        "What should you do if a fire becomes large?",
        ["Keep fighting it", "Evacuate immediately", "Go back for belongings"],
        1,
      ],
      [
        "Which class includes burning wood and bamboo?",
        ["Class A", "Class B", "Class C"],
        0,
      ],
      [
        "Which class covers LPG gas fires?",
        ["Class A", "Class C", "Class E"],
        1,
      ],
      [
        "Which extinguisher is suitable for an electrical fire?",
        ["CO₂", "Plain water", "Cooking oil"],
        0,
      ],
      [
        "What does the P in PASS mean?",
        ["Push the alarm", "Pull the pin", "Point at the smoke"],
        1,
      ],
      [
        "Where should you aim an extinguisher?",
        ["At the base of the fire", "At the ceiling", "At the smoke"],
        0,
      ],
      [
        "What should be behind you when using an extinguisher?",
        ["A clear exit", "A locked room", "Other people"],
        0,
      ],
      [
        "Can plain water be used on an oil fire?",
        ["Yes, always", "No", "Only indoors"],
        1,
      ],
      [
        "Where should people gather after evacuating?",
        [
          "At the agreed assembly point, upwind",
          "Beside the fire",
          "Inside the house",
        ],
        0,
      ],
      [
        "What number do you call for Bomba in an emergency?",
        ["999", "111", "123"],
        0,
      ],
      [
        "What location information helps Bomba find a longhouse?",
        [
          "Longhouse name and nearest landmark",
          "Only your first name",
          "The weather",
        ],
        0,
      ],
      [
        "Should you return for belongings during evacuation?",
        ["Yes, if they are nearby", "No", "Only after dark"],
        1,
      ],
      [
        "What should you do before fighting even a small fire?",
        ["Raise the alarm", "Close every exit", "Hide the extinguisher"],
        0,
      ],
      ["Which fuel is a Class B fire?", ["Petrol", "Wood", "LPG"], 0],
      [
        "Which fuel is a Class E fire?",
        ["Electrical wiring", "Cloth", "Kerosene"],
        0,
      ],
      [
        "Which extinguisher is a general-purpose option for A, B, C and E?",
        ["Dry powder", "Plain water", "Foam only"],
        0,
      ],
      [
        "What does the A in PASS mean?",
        ["Aim at the base", "Alert a neighbour", "Avoid the exit"],
        0,
      ],
      [
        "What does the first S in PASS mean?",
        ["Squeeze the handle", "Stand in smoke", "Stop the alarm"],
        0,
      ],
      [
        "What does the final S in PASS mean?",
        ["Sweep side to side", "Step closer", "Spray the ceiling"],
        0,
      ],
      [
        "What should residents do if unsure whether it is safe to fight a fire?",
        ["Leave immediately", "Wait and watch", "Try every extinguisher"],
        0,
      ],
      [
        "What helps prevent fires in shared walkways?",
        [
          "Keeping exits and ruai clear",
          "Storing fuel there",
          "Blocking doors",
        ],
        0,
      ],
      [
        "How should LPG cylinders be stored?",
        [
          "Upright with hoses checked",
          "On their side beside a flame",
          "In an escape route",
        ],
        0,
      ],
      [
        "What is useful to practise in a community fire drill?",
        [
          "Alarm, evacuation and headcount",
          "Cooking together",
          "Moving furniture",
        ],
        0,
      ],
      [
        "What should a community agree on before an emergency?",
        [
          "Alarm signal and assembly point",
          "A place to store rubbish",
          "A way to block exits",
        ],
        0,
      ],
      [
        "Who may need evacuation assistance?",
        [
          "Children, older people and people needing support",
          "Only visitors",
          "Nobody",
        ],
        0,
      ],
      [
        "When may residents return after a fire?",
        [
          "After Bomba says the area is safe",
          "As soon as flames are out",
          "Whenever they choose",
        ],
        0,
      ],
      [
        "What is a first step for a minor burn?",
        [
          "Cool it under running water and seek medical help",
          "Apply cooking oil",
          "Rub it hard",
        ],
        0,
      ],
      [
        "What does 'decay' mean for a fire?",
        [
          "Fuel is running out, but heat and smoke remain dangerous",
          "The area is safe",
          "The fire cannot restart",
        ],
        0,
      ],
      [
        "What should you report after an incident?",
        [
          "The cause and changes needed, with Tuai Rumah/Bomba",
          "Nothing to anyone",
          "Only the damage to belongings",
        ],
        0,
      ],
    ],
  },
  ms: {
    title: "Modul Keselamatan Kebakaran",
    subtitle:
      "Panduan praktikal keselamatan kebakaran untuk komuniti rumah panjang",
    learningHeading: "MODUL PEMBELAJARAN",
    practiceHeading: "AMALAN KESELAMATAN",
    moduleLabel: "MODUL",
    modules: [
      {
        id: "basics",
        icon: "flame-outline",
        title: "Asas kebakaran",
        summary: "Kenali perkembangan kebakaran dan kelas api biasa.",
        bullets: [
          "Peringkat pencucuhan ialah masa paling selamat untuk bertindak.",
          "Peringkat pertumbuhan bermakna api merebak; padamkan hanya jika kecil dan selamat.",
          "Jangan cuba memadam kebakaran besar. Keluar segera.",
          "Asap dan haba masih berbahaya semasa api mereput.",
        ],
        detailTitle: "Kelas kebakaran",
        details: [
          "Kelas A — kayu, buluh, kain, kertas dan atap rumbia.",
          "Kelas B — petrol, minyak tanah dan minyak masak.",
          "Kelas C — LPG dan gas mudah terbakar lain.",
          "Kelas E — pendawaian, soket, peralatan dan generator.",
        ],
        takeaway:
          "Padam dan lari: padamkan hanya jika selamat; jika tidak, keluar segera.",
      },
      {
        id: "extinguishers",
        icon: "water-outline",
        title: "Panduan pemadam api",
        summary: "Pilih alat yang sesuai dan gunakan PASS dengan selamat.",
        bullets: [
          "Bunyikan penggera sebelum cuba memadam api.",
          "Pastikan laluan keluar berada di belakang anda.",
          "Halakan ke pangkal api dan sembur dari sisi ke sisi.",
          "Keluar segera jika api membesar atau anda berasa ragu.",
        ],
        detailTitle: "Tekan jenis pemadam api",
        details: [
          "Serbuk kering — sesuai untuk Kelas A, B, C dan E; pilihan serbaguna.",
          "CO₂ — sesuai untuk kebakaran elektrik dan sesetengah cecair; tidak meninggalkan sisa. Elakkan ruang tertutup.",
          "Buih — sesuai untuk kebakaran cecair dan sesetengah bahan pepejal.",
          "Air atau kabus air — sesuai untuk Kelas A. Jangan guna air biasa pada minyak atau kebakaran elektrik.",
        ],
        takeaway:
          "PASS: Pull (tarik pin), Aim (halakan ke pangkal api), Squeeze (tekan pemegang), Sweep (hayun sisi ke sisi).",
      },
      {
        id: "cycle",
        icon: "people-outline",
        title: "Pengurusan insiden",
        summary: "Bersedia, bertindak dan pulih bersama-sama.",
        bullets: [
          "Pencegahan: pastikan laluan keluar lapang dan pendawaian serta simpanan bahan api selamat.",
          "Persediaan: berlatih menggunakan penggera, pemindahan dan kiraan penghuni.",
          "Tindak balas: keluar, berkumpul di kawasan lapang melawan arah angin dan hubungi Bomba 999.",
          "Pemulihan: tunggu pengesahan selamat, beri bantuan awal dan urus sokongan.",
        ],
        detailTitle: "Semasa menelefon 999",
        details: [
          "Berikan nama rumah panjang dan jalan, sungai atau mercu tanda terdekat.",
          "Nyatakan apa yang terbakar dan lokasinya.",
          "Maklumkan jumlah orang terlibat atau belum ditemui.",
          "Jangan masuk semula sehingga Bomba mengesahkan kawasan selamat.",
        ],
        takeaway:
          "Sepakati isyarat penggera, tempat berkumpul dan pembantu untuk kanak-kanak, warga emas serta mereka yang memerlukan bantuan.",
      },
    ],
    checklistTitle: "Senarai semak keselamatan rumah panjang",
    checklistSubtitle:
      "Tandakan perkara yang sudah tersedia. Kemajuan disimpan pada peranti ini.",
    checklist: [
      "Penggera asap dipasang dan berfungsi",
      "Pemadam api tersedia, belum luput dan mudah dicapai",
      "Pintu keluar dan ruai bebas daripada halangan",
      "Pendawaian dan soket dalam keadaan baik",
      "Silinder gas tegak; hos diperiksa",
      "Bahan api disimpan jauh dari ruang kediaman",
      "Semua keluarga tahu isyarat penggera komuniti",
      "Tempat berkumpul dipersetujui dan diketahui",
      "Pembantu ditugaskan untuk penggera, panggilan Bomba dan bantuan pemindahan",
      "Nombor kecemasan dipaparkan",
    ],
    quizTitle: "Kuiz keselamatan kebakaran",
    quizSubtitle: "10 soalan",
    startQuiz: "Mula kuiz",
    submitQuiz: "Semak jawapan",
    tryAgain: "Cuba lagi",
    retrySync: "Segerakkan lencana",
    nextQuestion: "Soalan seterusnya",
    question: "Soalan {{current}} daripada {{total}}",
    score: "Markah anda {{score}}/10",
    passed: "Lulus! Lencana kuiz keselamatan diperoleh.",
    failed: "Belum lulus. Ulang kaji modul dan cuba lagi.",
    badge: "Bertauliah Keselamatan Kebakaran",
    syncPending:
      "Disimpan pada peranti ini. Lencana akan disegerakkan apabila dalam talian.",
    correct: "Betul",
    incorrect: "Semak jawapan ini",
    finish: "Selesai",
    checklistScore: "{{done}}/10 tersedia",
    checklistComplete: "Semua perkara senarai semak sudah tersedia!",
    questions: [
      [
        "Bilakah masa terbaik untuk memadam api?",
        [
          "Semasa pencucuhan, ketika api kecil dan keadaan selamat",
          "Apabila api marak sepenuhnya",
          "Selepas asap memenuhi bangunan",
        ],
        0,
      ],
      [
        "Apakah tindakan jika api menjadi besar?",
        [
          "Terus cuba memadam",
          "Keluar segera",
          "Masuk semula mengambil barang",
        ],
        1,
      ],
      [
        "Apakah kelas kebakaran kayu dan buluh?",
        ["Kelas A", "Kelas B", "Kelas C"],
        0,
      ],
      ["Apakah kelas kebakaran gas LPG?", ["Kelas A", "Kelas C", "Kelas E"], 1],
      [
        "Pemadam apakah sesuai untuk kebakaran elektrik?",
        ["CO₂", "Air biasa", "Minyak masak"],
        0,
      ],
      [
        "Apakah maksud P dalam PASS?",
        ["Tekan penggera", "Tarik pin", "Halakan ke asap"],
        1,
      ],
      [
        "Ke manakah pemadam api patut dihalakan?",
        ["Ke pangkal api", "Ke siling", "Ke asap"],
        0,
      ],
      [
        "Apakah yang perlu berada di belakang anda semasa menggunakan pemadam?",
        ["Laluan keluar yang lapang", "Bilik berkunci", "Orang lain"],
        0,
      ],
      [
        "Bolehkah air biasa digunakan pada kebakaran minyak?",
        ["Ya, sentiasa", "Tidak", "Hanya di dalam bangunan"],
        1,
      ],
      [
        "Di manakah orang ramai perlu berkumpul selepas keluar?",
        [
          "Di tempat berkumpul yang dipersetujui, melawan arah angin",
          "Di sebelah api",
          "Di dalam rumah",
        ],
        0,
      ],
      [
        "Nombor apakah untuk menghubungi Bomba semasa kecemasan?",
        ["999", "111", "123"],
        0,
      ],
      [
        "Maklumat lokasi apakah membantu Bomba mencari rumah panjang?",
        [
          "Nama rumah panjang dan mercu tanda terdekat",
          "Nama pertama sahaja",
          "Keadaan cuaca",
        ],
        0,
      ],
      [
        "Perlukah anda kembali mengambil barang semasa pemindahan?",
        ["Ya, jika berdekatan", "Tidak", "Hanya selepas gelap"],
        1,
      ],
      [
        "Apakah yang perlu dibuat sebelum memadam api kecil?",
        [
          "Bunyikan penggera",
          "Tutup semua jalan keluar",
          "Sembunyikan pemadam",
        ],
        0,
      ],
      ["Bahan api manakah kebakaran Kelas B?", ["Petrol", "Kayu", "LPG"], 0],
      [
        "Apakah contoh kebakaran Kelas E?",
        ["Pendawaian elektrik", "Kain", "Minyak tanah"],
        0,
      ],
      [
        "Pemadam apakah pilihan serbaguna untuk A, B, C dan E?",
        ["Serbuk kering", "Air biasa", "Buih sahaja"],
        0,
      ],
      [
        "Apakah maksud A dalam PASS?",
        ["Halakan ke pangkal api", "Maklumkan jiran", "Jauhi laluan keluar"],
        0,
      ],
      [
        "Apakah maksud S pertama dalam PASS?",
        ["Tekan pemegang", "Berdiri dalam asap", "Hentikan penggera"],
        0,
      ],
      [
        "Apakah maksud S terakhir dalam PASS?",
        ["Hayun dari sisi ke sisi", "Melangkah lebih dekat", "Sembur siling"],
        0,
      ],
      [
        "Apakah yang perlu dilakukan jika anda tidak pasti selamat untuk memadam api?",
        ["Keluar segera", "Tunggu dan lihat", "Cuba semua pemadam"],
        0,
      ],
      [
        "Apakah langkah mencegah kebakaran di laluan bersama?",
        [
          "Pastikan pintu keluar dan ruai lapang",
          "Simpan bahan api di situ",
          "Halang pintu",
        ],
        0,
      ],
      [
        "Bagaimanakah silinder LPG patut disimpan?",
        [
          "Dalam keadaan tegak dan hos diperiksa",
          "Mengiring berhampiran api",
          "Di laluan keluar",
        ],
        0,
      ],
      [
        "Apakah yang sesuai dilatih dalam latihan kebakaran komuniti?",
        [
          "Penggera, pemindahan dan kiraan penghuni",
          "Memasak bersama",
          "Memindahkan perabot",
        ],
        0,
      ],
      [
        "Apakah yang patut dipersetujui komuniti sebelum kecemasan?",
        [
          "Isyarat penggera dan tempat berkumpul",
          "Tempat buang sampah",
          "Cara menghalang laluan keluar",
        ],
        0,
      ],
      [
        "Siapakah yang mungkin memerlukan bantuan pemindahan?",
        [
          "Kanak-kanak, warga emas dan mereka yang perlukan bantuan",
          "Pelawat sahaja",
          "Tiada sesiapa",
        ],
        0,
      ],
      [
        "Bilakah penghuni boleh kembali selepas kebakaran?",
        [
          "Selepas Bomba mengesahkan kawasan selamat",
          "Sebaik sahaja api padam",
          "Bila-bila masa",
        ],
        0,
      ],
      [
        "Apakah langkah awal untuk melecur ringan?",
        [
          "Sejukkan dengan air mengalir dan dapatkan rawatan",
          "Sapu minyak masak",
          "Gosok kuat",
        ],
        0,
      ],
      [
        "Apakah maksud peringkat reput bagi kebakaran?",
        [
          "Bahan api berkurangan tetapi haba dan asap masih berbahaya",
          "Kawasan sudah selamat",
          "Api tidak boleh menyala semula",
        ],
        0,
      ],
      [
        "Apakah yang patut dilaporkan selepas insiden?",
        [
          "Punca dan perubahan yang perlu kepada Tuai Rumah/Bomba",
          "Jangan maklumkan sesiapa",
          "Kerosakan barang sahaja",
        ],
        0,
      ],
    ],
  },
};

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
      loading: "Loading...",
    },
    home: {
      welcomeBack: "Welcome Back,",
      emergencyCall: "Emergency Call",
      emergencyService: "Bomba · Emergency services",
      emergencyCallLabel: "Emergency Call, Bomba, 999",
      emergencyCallHint: "Opens a confirmation before calling 999.",
      emergencyConfirmTitle: "Is this a genuine emergency?",
      emergencyConfirmMessage:
        "Only continue if you need emergency assistance. Call 999 and ask for Bomba for a fire or rescue emergency.",
      emergencyConfirmCall: "Yes — Call 999",
      emergencyOpening: "Opening phone…",
      emergencyCallError:
        "Could not open the phone app. For a genuine emergency, dial 999 manually and ask for Bomba.",
      activeRooms: "Active Rooms",
      warnings: "Warnings",
      loading: "Loading...",
      loadError: "Could not load your rooms.",
      retry: "Retry",
      systemStatus: "System Status",
      allOperational: "All Systems Operational",
      warningDetected: "Warning Detected",
      sensorsOnline: "Sensors Online",
      camerasOn: "Cameras On",
      fireEvents: "Fire Events (30d)",
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
      fireRisk: "Fire risk",
      riskNormal: "Normal",
      riskWarning: "Warning",
      riskCritical: "Critical",
      riskWaiting: "Waiting for data",
      riskUnavailable: "Update unavailable",
      riskAwaitingUpdate: "Waiting for a live risk update",
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
      pumpFailedTitle: "Water Pump Malfunction",
      pumpFailedMessage:
        "The water pump may not be operating correctly. Please contact the admin for assistance.",
      pumpSuccessActivatedTitle: "Water Pump Activated",
      pumpSuccessActivatedMessage: "The water pump activated successfully.",
      pumpSuccessDeactivatedTitle: "Water Pump Deactivated",
      pumpSuccessDeactivatedMessage: "The water pump deactivated successfully.",
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
      photoTitle: "Profile Picture",
      photoTake: "Take Photo",
      photoChoose: "Choose from Gallery",
      photoPermission:
        "Please allow access in your phone settings to change your profile picture.",
      photoFailed: "Could not update your profile picture.",
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
        security: { title: "Security", subtitle: "Manage security settings" },
      },
      prefItems: {
        notif: { title: "Notifications", subtitle: "Alert preferences" },
        settings: {
          title: "System Settings",
          subtitle: "Sensor & device health",
        },
      },
    },
    systemSettings: {
      title: "System Settings",
      overview: "Overview",
      allOk: "All systems operational",
      attention: "Attention needed - check the rooms below",
      roomsOnline: "Rooms Online",
      camerasOn: "Cameras On",
      fireEvents: "Fire Events ({{days}} days)",
      cloudOn: "Device cloud connected",
      cloudOff: "Device cloud disconnected",
      cloudOffHint:
        "Live updates and water pump control may not work until the server reconnects.",
      rooms: "Rooms",
      noRooms: "No rooms are linked to your account yet.",
      online: "Online",
      offline: "Offline",
      noReadings: "No readings yet",
      justNow: "just now",
      minutesAgo: "{{n}} min ago",
      hoursAgo: "{{n}} h ago",
      daysAgo: "{{n}} days ago",
      offlineHint:
        "A room is offline when its sensors have sent nothing for {{minutes}} minutes. Pull down to refresh.",
      temperature: "Temperature",
      humidity: "Humidity",
      smoke: "Smoke",
      gas: "Gas",
      flame: "Flame",
      flameYes: "Detected",
      flameNo: "None",
      cameraOn: "Camera on",
      cameraOff: "Camera off",
      pumpOn: "Pump running",
      pumpOff: "Pump off",
      thresholds: "Alarm Thresholds",
      anyFlame: "Any flame",
      adminOnly: "Only an administrator can change these thresholds.",
      about: "About",
      appVersion: "App version",
    },
    notificationSettings: {
      title: "Notifications",
      status: "Alert Status",
      push: "Push notifications",
      pushOn: "Allowed - alarms ring even when the app is closed",
      pushOff:
        "Blocked - you will NOT hear a fire alarm while the app is closed",
      openSettings: "Open Phone Settings",
      device: "This device",
      deviceOn: "Registered to receive fire alerts",
      deviceOff: "Not registered - fire alerts cannot reach this phone",
      deviceChecking: "Checking...",
      retry: "Retry",
      test: "Test",
      testAlarm: "Send Test Alarm",
      testHint:
        "Rings this phone with the real alarm sound. Nothing is added to your alerts.",
      testSentTitle: "Test Alarm Sent",
      testSent:
        "Your phone should ring in a few seconds. If it does not, check that notifications and sound are allowed.",
      testFailedTitle: "Test Failed",
      testNotRegistered:
        "This device is not registered yet. Allow notifications, then tap Retry.",
      alarmSound: "Alarm Sound",
      alarmSoundHint:
        "Used for the in-app alarm and when the app is closed. Tap play to preview.",
      preview: "Preview",
      stop: "Stop",
      sounds: {
        classic: { name: "Classic", desc: "The original FireBomba alarm" },
        siren: { name: "Siren", desc: "Rising and falling wail" },
        beep: {
          name: "Evacuation Beep",
          desc: "Three beeps then a pause, like a smoke detector",
        },
        bell: { name: "Fire Bell", desc: "Fast ringing bell" },
      },
      triggers: "What Triggers an Alarm",
      triggerFlame: "Flame or fire detected",
      triggerTemp: "Temperature at or above 60 °C",
      triggerSmoke: "Smoke reading at or above 300",
      triggerGas: "Gas reading at or above 500",
      alwaysOn:
        "Fire alarms cannot be turned off - they are there to keep you safe.",
    },
    personalInfo: {
      title: "Personal Information",
      details: "Your Details",
      fullName: "Full Name",
      fullNamePlaceholder: "John Doe",
      phone: "Phone Number",
      phonePlaceholder: "012-345 6789 (optional)",
      phoneHint:
        "Used for SMS codes and to sign in with your phone number. Leave blank to remove it.",
      save: "Save Changes",
      saving: "Saving...",
      saved: "Your details have been updated.",
      savedTitle: "Saved",
      errorTitle: "Error",
      loadError: "Could not load your details.",
      retry: "Retry",
      enterFullName: "Please enter your full name.",
      invalidPhone: "Please enter a valid phone number, e.g. 012-345 6789.",
      verified: "Verified",
      notVerified: "Not verified",
      verifyPhone: "Verify Phone Number",
      verifyTitle: "Verify Phone Number",
      codeSent: "We sent a 6-digit code by SMS to {{phone}}.",
      codePlaceholder: "6-digit code",
      verifyCode: "Verify",
      resend: "Resend code",
      enterFullCode: "Please enter all 6 digits.",
      phoneVerified: "Your phone number is verified.",
      unsavedPhone: "Save your new phone number before verifying it.",
      account: "Account",
      email: "Email",
      emailHint: "Your email is also your login and cannot be changed here.",
      room: "Bilik",
      memberSince: "Member Since",
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
      cameraSaveError: "Could not save camera setting",
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
      email: "Email or Phone Number",
      emailPlaceholder: "you@example.com or 012-345 6789",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      rememberMe: "Remember me",
      forgotPassword: "Forgot password?",
      signIn: "Sign In",
      noAccount: "Don't have an account?",
      signUp: "Sign Up",
      missingFieldsTitle: "Missing Fields",
      missingFieldsMessage:
        "Please enter your email or phone number, and your password.",
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
    otp: {
      title: "Enter Verification Code",
      subtitle: "We sent a 6-digit code by SMS to {{phone}}",
      subtitleEmail: "We sent a 6-digit code by email to {{email}}",
      useSms: "Send to my phone instead",
      useEmail: "Send to my email instead",
      resentMessageEmail: "A new code has been sent to your email.",
      verify: "Verify",
      resend: "Resend code",
      resendIn: "Resend code in {{seconds}}s",
      enterFullCode: "Please enter all 6 digits.",
      invalidTitle: "Verification Failed",
      expiredTitle: "Session Expired",
      errorTitle: "Error",
      connectError: "Could not connect to the server. Is your backend running?",
      resentTitle: "Code Sent",
      resentMessage: "A new code has been sent to your phone.",
    },
    forgot: {
      title: "Forgot Password",
      subtitle:
        "Enter your email or phone number and we will send you a code to reset your password.",
      identifier: "Email or Phone Number",
      identifierPlaceholder: "you@example.com or 012-345 6789",
      sendCode: "Send Code",
      codeTitle: "Enter Verification Code",
      codeSubtitleEmail:
        "If an account exists for {{identifier}}, we sent a 6-digit code to its email.",
      codeSubtitleSms:
        "If an account exists for {{identifier}}, we sent a 6-digit code by SMS.",
      verify: "Verify",
      resetTitle: "Create New Password",
      resetSubtitle: "Code verified. Choose a new password for your account.",
      expiredTitle: "Reset Expired",
      newPassword: "New Password",
      newPasswordPlaceholder: "At least 8 characters",
      confirmPassword: "Confirm New Password",
      confirmPasswordPlaceholder: "Re-enter your new password",
      resetButton: "Reset Password",
      resend: "Resend code",
      resendIn: "Resend code in {{seconds}}s",
      changeAccount: "Use a different email or phone",
      backToLogin: "Back to Sign In",
      missingIdentifier: "Please enter your email or phone number.",
      enterFullCode: "Please enter the 6-digit code.",
      passwordMin: "Password must be at least 8 characters.",
      passwordMismatch: "Passwords do not match.",
      failedTitle: "Reset Failed",
      successTitle: "Password Reset",
      successMessage:
        "Your password has been changed. Please sign in with your new password.",
      resentTitle: "Code Sent",
      resentMessage: "If the account exists, a new code is on its way.",
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
      phone: "Phone Number (optional)",
      phonePlaceholder: "012-345 6789",
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
      invalidPhone: "Please enter a valid phone number, e.g. 012-345 6789.",
      enterPassword: "Please enter a password.",
      passwordMin: "Password must be at least 6 characters.",
      passwordMismatch: "Passwords do not match.",
      mustAgreeTerms: "You must agree to the Terms of Service to sign up.",
      signupFailed: "Sign Up Failed: {{error}}",
      signupSuccess: "Success! Account created. You can now log in.",
      connectError:
        "Error: Could not connect to the server. Make sure your backend is running!",
    },
    tutorial: {
      skip: "Skip",
      back: "Back",
      next: "Next",
      done: "Done",
      stepCounter: "Step {{current}} of {{total}}",
      replay: "App Tutorial",
      replaySubtitle: "Replay the guided walkthrough",
      categories: {
        monitoring: "Monitoring",
        control: "Control",
        alerts: "Alerts",
        account: "Account",
        emergency: "Emergency",
      },
      steps: {
        welcome: {
          title: "Welcome to FireBomba",
          desc: "A quick tour of your safety tools. Replay it anytime in Profile.",
        },
        home: {
          title: "Home",
          desc: "See active rooms and current warnings at a glance.",
        },
        systemStatus: {
          title: "System status",
          desc: "Check online sensors, cameras, and recent fire events.",
        },
        recentAlerts: {
          title: "Recent alerts",
          desc: "See the latest warnings. Tap View all for the full list.",
        },
        callBomba: {
          title: "Emergency call",
          desc: "Use 999 in an emergency. Confirm to open your phone dialler.",
        },
        rooms: {
          title: "Rooms",
          desc: "Find each room and check its safety status.",
        },
        roomDetail: {
          title: "Room details",
          desc: "View the live camera, sensor readings, and history.",
        },
        waterPump: {
          title: "Water pump",
          desc: "Activate fire suppression here. Use only in an emergency.",
        },
        alerts: {
          title: "Alerts",
          desc: "Review warnings and fire events. Tap an alert to mark it read.",
        },
        profile: {
          title: "Profile",
          desc: "Manage your account, language, and preferences here.",
        },
        security: {
          title: "Security",
          desc: "Turn camera detection on or off for each room.",
        },
      },
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
      loading: "Sedang memuatkan...",
    },
    home: {
      welcomeBack: "Selamat Kembali,",
      emergencyCall: "Panggilan Kecemasan",
      emergencyService: "Bomba · Perkhidmatan kecemasan",
      emergencyCallLabel: "Panggilan Kecemasan, Bomba, 999",
      emergencyCallHint: "Membuka pengesahan sebelum menghubungi 999.",
      emergencyConfirmTitle: "Adakah ini kecemasan sebenar?",
      emergencyConfirmMessage:
        "Teruskan hanya jika anda memerlukan bantuan kecemasan. Hubungi 999 dan minta bantuan Bomba untuk kecemasan kebakaran atau penyelamatan.",
      emergencyConfirmCall: "Ya — Hubungi 999",
      emergencyOpening: "Membuka telefon…",
      emergencyCallError:
        "Tidak dapat membuka aplikasi telefon. Untuk kecemasan sebenar, dail 999 secara manual dan minta bantuan Bomba.",
      activeRooms: "Bilik Aktif",
      warnings: "Amaran",
      systemStatus: "Status Sistem",
      allOperational: "Semua Sistem Beroperasi",
      warningDetected: "Amaran Dikesan",
      sensorsOnline: "Sensor Dalam Talian",
      camerasOn: "Kamera Aktif",
      loading: "Memuatkan...",
      loadError: "Tidak dapat memuatkan bilik anda.",
      retry: "Cuba lagi",
      fireEvents: "Kebakaran (30h)",
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
      fireRisk: "Risiko kebakaran",
      riskNormal: "Normal",
      riskWarning: "Amaran",
      riskCritical: "Kritikal",
      riskWaiting: "Menunggu data",
      riskUnavailable: "Kemas kini tidak tersedia",
      riskAwaitingUpdate: "Menunggu kemas kini risiko langsung",
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
      pumpFailedTitle: "Kerosakan Pam Air",
      pumpFailedMessage:
        "Pam air mungkin tidak berfungsi dengan baik. Sila menghubungi admin untuk bantuan lebih lanjut.",
      pumpSuccessActivatedTitle: "Pam Air Diaktifkan",
      pumpSuccessActivatedMessage: "Pam air berjaya diaktifkan.",
      pumpSuccessDeactivatedTitle: "Pam air Dinyahaktifkan",
      pumpSuccessDeactivatedMessage: "Pam air berjaya dinyahaktifkan.",
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
      photoTitle: "Gambar Profil",
      photoTake: "Ambil Gambar",
      photoChoose: "Pilih dari Galeri",
      photoPermission:
        "Sila benarkan akses dalam tetapan telefon anda untuk menukar gambar profil.",
      photoFailed: "Tidak dapat mengemas kini gambar profil anda.",
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
        security: { title: "Keselamatan", subtitle: "Kata laluan & 2FA" },
      },
      prefItems: {
        notif: { title: "Notifikasi", subtitle: "Keutamaan amaran" },
        settings: {
          title: "Tetapan Sistem",
          subtitle: "Status sensor & peranti",
        },
      },
    },
    systemSettings: {
      title: "Tetapan Sistem",
      overview: "Gambaran Keseluruhan",
      allOk: "Semua sistem beroperasi",
      attention: "Perlu perhatian - semak bilik di bawah",
      roomsOnline: "Bilik Dalam Talian",
      camerasOn: "Kamera Aktif",
      fireEvents: "Kebakaran ({{days}} hari)",
      cloudOn: "Awan peranti bersambung",
      cloudOff: "Awan peranti terputus",
      cloudOffHint:
        "Kemas kini langsung dan kawalan pam air mungkin tidak berfungsi sehingga pelayan bersambung semula.",
      rooms: "Bilik",
      noRooms: "Tiada bilik dipautkan ke akaun anda lagi.",
      online: "Dalam talian",
      offline: "Luar talian",
      noReadings: "Tiada bacaan lagi",
      justNow: "baru sahaja",
      minutesAgo: "{{n}} min lalu",
      hoursAgo: "{{n}} jam lalu",
      daysAgo: "{{n}} hari lalu",
      offlineHint:
        "Bilik dianggap luar talian apabila sensornya tidak menghantar apa-apa selama {{minutes}} minit. Tarik ke bawah untuk muat semula.",
      temperature: "Suhu",
      humidity: "Kelembapan",
      smoke: "Asap",
      gas: "Gas",
      flame: "Api",
      flameYes: "Dikesan",
      flameNo: "Tiada",
      cameraOn: "Kamera hidup",
      cameraOff: "Kamera mati",
      pumpOn: "Pam berjalan",
      pumpOff: "Pam mati",
      thresholds: "Had Penggera",
      anyFlame: "Sebarang api",
      adminOnly: "Hanya pentadbir boleh menukar had ini.",
      about: "Tentang",
      appVersion: "Versi aplikasi",
    },
    notificationSettings: {
      title: "Notifikasi",
      status: "Status Amaran",
      push: "Notifikasi tolak",
      pushOn: "Dibenarkan - penggera berbunyi walaupun aplikasi ditutup",
      pushOff:
        "Disekat - anda TIDAK akan mendengar penggera kebakaran semasa aplikasi ditutup",
      openSettings: "Buka Tetapan Telefon",
      device: "Peranti ini",
      deviceOn: "Didaftarkan untuk menerima amaran kebakaran",
      deviceOff:
        "Tidak didaftarkan - amaran kebakaran tidak dapat sampai ke telefon ini",
      deviceChecking: "Menyemak...",
      retry: "Cuba Lagi",
      test: "Ujian",
      testAlarm: "Hantar Penggera Ujian",
      testHint:
        "Membunyikan telefon ini dengan bunyi penggera sebenar. Tiada apa ditambah pada amaran anda.",
      testSentTitle: "Penggera Ujian Dihantar",
      testSent:
        "Telefon anda sepatutnya berbunyi dalam beberapa saat. Jika tidak, pastikan notifikasi dan bunyi dibenarkan.",
      testFailedTitle: "Ujian Gagal",
      testNotRegistered:
        "Peranti ini belum didaftarkan. Benarkan notifikasi, kemudian tekan Cuba Lagi.",
      alarmSound: "Bunyi Penggera",
      alarmSoundHint:
        "Digunakan untuk penggera dalam aplikasi dan semasa aplikasi ditutup. Tekan main untuk dengar.",
      preview: "Dengar",
      stop: "Henti",
      sounds: {
        classic: { name: "Klasik", desc: "Penggera asal FireBomba" },
        siren: { name: "Siren", desc: "Bunyi siren naik dan turun" },
        beep: {
          name: "Bip Pemindahan",
          desc: "Tiga bip kemudian berhenti, seperti pengesan asap",
        },
        bell: { name: "Loceng Kebakaran", desc: "Loceng berdering laju" },
      },
      triggers: "Apa yang Mencetuskan Penggera",
      triggerFlame: "Api atau kebakaran dikesan",
      triggerTemp: "Suhu 60 °C atau lebih",
      triggerSmoke: "Bacaan asap 300 atau lebih",
      triggerGas: "Bacaan gas 500 atau lebih",
      alwaysOn:
        "Penggera kebakaran tidak boleh dimatikan - ia ada untuk keselamatan anda.",
    },
    personalInfo: {
      title: "Maklumat Peribadi",
      details: "Butiran Anda",
      fullName: "Nama Penuh",
      fullNamePlaceholder: "Ali Ahmad",
      phone: "Nombor Telefon",
      phonePlaceholder: "012-345 6789 (pilihan)",
      phoneHint:
        "Digunakan untuk kod SMS dan log masuk dengan nombor telefon. Biarkan kosong untuk membuangnya.",
      save: "Simpan Perubahan",
      saving: "Menyimpan...",
      saved: "Butiran anda telah dikemas kini.",
      savedTitle: "Disimpan",
      errorTitle: "Ralat",
      loadError: "Tidak dapat memuatkan butiran anda.",
      retry: "Cuba Lagi",
      enterFullName: "Sila masukkan nama penuh anda.",
      invalidPhone: "Sila masukkan nombor telefon yang sah, cth. 012-345 6789.",
      verified: "Disahkan",
      notVerified: "Belum disahkan",
      verifyPhone: "Sahkan Nombor Telefon",
      verifyTitle: "Sahkan Nombor Telefon",
      codeSent: "Kami menghantar kod 6 digit melalui SMS ke {{phone}}.",
      codePlaceholder: "Kod 6 digit",
      verifyCode: "Sahkan",
      resend: "Hantar semula kod",
      enterFullCode: "Sila masukkan kesemua 6 digit.",
      phoneVerified: "Nombor telefon anda telah disahkan.",
      unsavedPhone: "Simpan nombor telefon baharu anda sebelum mengesahkannya.",
      account: "Akaun",
      email: "E-mel",
      emailHint:
        "E-mel anda juga ialah log masuk anda dan tidak boleh ditukar di sini.",
      room: "Bilik",
      memberSince: "Ahli Sejak",
    },
    login: {
      title: "Selamat Kembali",
      subtitle: "Log masuk ke akaun anda",
      email: "E-mel atau Nombor Telefon",
      emailPlaceholder: "anda@contoh.com atau 012-345 6789",
      password: "Kata Laluan",
      passwordPlaceholder: "Masukkan kata laluan anda",
      rememberMe: "Ingat saya",
      forgotPassword: "Lupa kata laluan?",
      signIn: "Log Masuk",
      noAccount: "Tiada akaun?",
      signUp: "Daftar",
      missingFieldsTitle: "Medan Tidak Lengkap",
      missingFieldsMessage:
        "Sila masukkan e-mel atau nombor telefon anda, dan kata laluan.",
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
    otp: {
      title: "Masukkan Kod Pengesahan",
      subtitle: "Kami menghantar kod 6 digit melalui SMS ke {{phone}}",
      subtitleEmail: "Kami menghantar kod 6 digit melalui e-mel ke {{email}}",
      useSms: "Hantar ke telefon saya",
      useEmail: "Hantar ke e-mel saya",
      resentMessageEmail: "Kod baharu telah dihantar ke e-mel anda.",
      verify: "Sahkan",
      resend: "Hantar semula kod",
      resendIn: "Hantar semula dalam {{seconds}}s",
      enterFullCode: "Sila masukkan kesemua 6 digit.",
      invalidTitle: "Pengesahan Gagal",
      expiredTitle: "Sesi Tamat",
      errorTitle: "Ralat",
      connectError:
        "Tidak dapat menyambung ke pelayan. Adakah backend anda berjalan?",
      resentTitle: "Kod Dihantar",
      resentMessage: "Kod baharu telah dihantar ke telefon anda.",
    },
    forgot: {
      title: "Lupa Kata Laluan",
      subtitle:
        "Masukkan e-mel atau nombor telefon anda dan kami akan menghantar kod untuk menetapkan semula kata laluan.",
      identifier: "E-mel atau Nombor Telefon",
      identifierPlaceholder: "anda@contoh.com atau 012-345 6789",
      sendCode: "Hantar Kod",
      codeTitle: "Masukkan Kod Pengesahan",
      codeSubtitleEmail:
        "Jika akaun wujud untuk {{identifier}}, kami telah menghantar kod 6 digit ke e-melnya.",
      codeSubtitleSms:
        "Jika akaun wujud untuk {{identifier}}, kami telah menghantar kod 6 digit melalui SMS.",
      verify: "Sahkan",
      resetTitle: "Cipta Kata Laluan Baharu",
      resetSubtitle: "Kod disahkan. Pilih kata laluan baharu untuk akaun anda.",
      expiredTitle: "Tempoh Tamat",
      newPassword: "Kata Laluan Baharu",
      newPasswordPlaceholder: "Sekurang-kurangnya 8 aksara",
      confirmPassword: "Sahkan Kata Laluan Baharu",
      confirmPasswordPlaceholder: "Masukkan semula kata laluan baharu",
      resetButton: "Tetapkan Semula",
      resend: "Hantar semula kod",
      resendIn: "Hantar semula dalam {{seconds}}s",
      changeAccount: "Guna e-mel atau telefon lain",
      backToLogin: "Kembali ke Log Masuk",
      missingIdentifier: "Sila masukkan e-mel atau nombor telefon anda.",
      enterFullCode: "Sila masukkan kod 6 digit.",
      passwordMin: "Kata laluan mestilah sekurang-kurangnya 8 aksara.",
      passwordMismatch: "Kata laluan tidak sepadan.",
      failedTitle: "Gagal Menetapkan Semula",
      successTitle: "Kata Laluan Ditukar",
      successMessage:
        "Kata laluan anda telah ditukar. Sila log masuk dengan kata laluan baharu.",
      resentTitle: "Kod Dihantar",
      resentMessage: "Jika akaun wujud, kod baharu sedang dihantar.",
      errorTitle: "Ralat",
      connectError:
        "Tidak dapat menyambung ke pelayan. Adakah backend anda berjalan?",
    },
    signup: {
      title: "Cipta Akaun",
      subtitle: "Daftar FireBomba untuk memantau rumah anda",
      fullName: "Nama Penuh",
      fullNamePlaceholder: "Ali Ahmad",
      email: "Alamat E-mel",
      emailPlaceholder: "anda@contoh.com",
      phone: "Nombor Telefon (pilihan)",
      phonePlaceholder: "012-345 6789",
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
      invalidPhone: "Sila masukkan nombor telefon yang sah, cth. 012-345 6789.",
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
    tutorial: {
      skip: "Langkau",
      back: "Kembali",
      next: "Seterusnya",
      done: "Mula",
      stepCounter: "Langkah {{current}} daripada {{total}}",
      replay: "Tutorial Aplikasi",
      replaySubtitle: "Main semula panduan aplikasi",
      categories: {
        monitoring: "Pemantauan",
        control: "Kawalan",
        alerts: "Amaran",
        account: "Akaun",
        emergency: "Kecemasan",
      },
      steps: {
        welcome: {
          title: "Selamat datang",
          desc: "Kenali alat keselamatan anda. Ulang panduan ini di Profil.",
        },
        home: {
          title: "Laman Utama",
          desc: "Lihat bilik aktif dan amaran semasa sepintas lalu.",
        },
        systemStatus: {
          title: "Status sistem",
          desc: "Semak sensor dalam talian, kamera dan kejadian kebakaran terkini.",
        },
        recentAlerts: {
          title: "Amaran terkini",
          desc: "Lihat amaran terbaru. Ketik Lihat semua untuk senarai penuh.",
        },
        callBomba: {
          title: "Panggilan kecemasan",
          desc: "Gunakan 999 semasa kecemasan. Sahkan untuk membuka pendail telefon.",
        },
        rooms: {
          title: "Bilik",
          desc: "Cari bilik dan semak status keselamatannya.",
        },
        roomDetail: {
          title: "Butiran bilik",
          desc: "Lihat kamera langsung, bacaan sensor dan sejarah.",
        },
        waterPump: {
          title: "Pam air",
          desc: "Aktifkan pemadaman kebakaran di sini. Gunakan hanya semasa kecemasan.",
        },
        alerts: {
          title: "Amaran",
          desc: "Semak amaran dan kejadian kebakaran. Ketik untuk tandakan dibaca.",
        },
        profile: {
          title: "Profil",
          desc: "Urus akaun, bahasa dan pilihan anda di sini.",
        },
        security: {
          title: "Keselamatan",
          desc: "Hidupkan atau matikan pengesanan kamera bagi setiap bilik.",
        },
      },
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
  const [fireSafetyProgress, setFireSafetyProgress] = useState({
    checklist: [],
    quizPassed: false,
  });
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

  useEffect(() => {
    let active = true;
    const progressKey = user?.id ? `firebomba_safety_${user.id}` : null;
    setFireSafetyProgress({ checklist: [], quizPassed: false });
    if (!progressKey || !token)
      return () => {
        active = false;
      };

    const loadProgress = async () => {
      let local = { checklist: [], quizPassed: false, quizScore: null };
      try {
        const raw = await SecureStore.getItemAsync(progressKey);
        if (raw) {
          const saved = JSON.parse(raw);
          local = {
            checklist: Array.isArray(saved.checklist) ? saved.checklist : [],
            quizPassed: saved.quizPassed === true,
            quizScore: Number.isInteger(saved.quizScore)
              ? saved.quizScore
              : null,
          };
        }
      } catch {}
      if (!active) return;

      const remote = await apiGetFireSafetyProgress();
      if (!active) return;
      if (remote?.error) {
        setFireSafetyProgress(local);
        return;
      }

      let quizPassed = remote.quizPassed === true;
      // Migrate a locally earned badge from the previous app version to the
      // account record the first time this user opens the updated app.
      if (!quizPassed && local.quizPassed) {
        const migrated = await apiRecordFireSafetyQuizPass(
          local.quizScore || 8,
        );
        if (!active) return;
        if (!migrated?.error && migrated.quizPassed) quizPassed = true;
        else quizPassed = true; // Keep the local badge visible while offline.
      }
      const progress = {
        checklist: local.checklist,
        quizPassed,
        quizScore: remote.bestQuizScore || local.quizScore || null,
      };
      setFireSafetyProgress(progress);
      SecureStore.setItemAsync(progressKey, JSON.stringify(progress)).catch(
        () => {},
      );
    };

    loadProgress().catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, token]);

  const saveFireSafetyProgress = async (nextProgress, quizScore = null) => {
    const progress = {
      checklist: Array.isArray(nextProgress.checklist)
        ? nextProgress.checklist
        : [],
      quizPassed: nextProgress.quizPassed === true,
      quizScore: Number.isInteger(quizScore)
        ? quizScore
        : fireSafetyProgress.quizScore || null,
    };
    setFireSafetyProgress(progress);
    if (user?.id) {
      const progressKey = `firebomba_safety_${user.id}`;
      try {
        await SecureStore.setItemAsync(progressKey, JSON.stringify(progress));
      } catch {}
      if (
        progress.quizPassed &&
        Number.isInteger(quizScore) &&
        quizScore >= 8
      ) {
        const saved = await apiRecordFireSafetyQuizPass(quizScore);
        if (!saved?.error && saved.quizPassed) {
          const syncedProgress = {
            ...progress,
            quizScore: saved.bestQuizScore || quizScore,
          };
          setFireSafetyProgress(syncedProgress);
          SecureStore.setItemAsync(
            progressKey,
            JSON.stringify(syncedProgress),
          ).catch(() => {});
          return { ok: true };
        }
        return { ok: false, pendingSync: true };
      }
    }
    return { ok: true };
  };
  const [notifications, setNotifications] = useState([]);
  const [roomData, setRoomData] = useState([]);
  const [bilik, setBilik] = useState(null);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [bilikLoading, setBilikLoading] = useState(true);
  const [bilikError, setBilikError] = useState(null);
  const [bilikRequest, setBilikRequest] = useState(0);

  const alertRef = useRef(null);
  const soundRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const pushTokenRef = useRef(null);
  // null until the first registration attempt finishes.
  const [pushRegistered, setPushRegistered] = useState(null);
  const [alarmSound, setAlarmSound] = useState(DEFAULT_ALARM_SOUND);
  // null until the first /system-health answer arrives.
  const [systemHealth, setSystemHealth] = useState(null);
  const systemHealthRef = useRef(null);
  // Read by registerPush, which must send the tone picked most recently.
  const alarmSoundRef = useRef(DEFAULT_ALARM_SOUND);

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
      prevUnreadRef.current = 0;
      setUser(null);
      setToken(null);
      setNeedsUnlock(false);
      setLockedUser(null);
      setNotifications([]);
    });

    return () => setOnSessionExpired(null);
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
    }).catch(() => {});
    getAlarmSoundPreference().then((id) => {
      alarmSoundRef.current = id;
      setAlarmSound(id);
    });
  }, []);

  // (Re)load the in-app alarm whenever the chosen tone changes.
  useEffect(() => {
    let cancelled = false;
    let loaded = null;
    Audio.Sound.createAsync(getAlarmSound(alarmSound).inApp, {
      isLooping: true,
    })
      .then(({ sound }) => {
        if (cancelled) {
          sound.unloadAsync();
          return;
        }
        loaded = sound;
        soundRef.current = sound;
      })
      .catch((e) => {
        console.warn("Alarm sound failed to load:", e);
      });
    return () => {
      cancelled = true;
      if (soundRef.current === loaded) soundRef.current = null;
      loaded?.unloadAsync();
    };
  }, [alarmSound]);

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

  // Hand this device's push token to the backend, so a fire still rings the
  // phone while the app is in the background or closed. Also the Retry
  // button on the Notifications screen; resolves to whether it worked.
  const registerPush = useCallback(async () => {
    const pushToken = await registerForPushNotifications();
    if (!pushToken) {
      setPushRegistered(false);
      return false;
    }
    pushTokenRef.current = pushToken;
    const result = await apiRegisterPushToken(
      pushToken,
      Platform.OS,
      alarmSoundRef.current,
    );
    if (result?.error) console.warn("Push token not saved:", result.error);
    else console.log("Push token saved");
    setPushRegistered(!result?.error);
    return !result?.error;
  }, []);

  useEffect(() => {
    if (token) registerPush();
  }, [token]);

  // Saves the tone on this phone, switches the in-app alarm, and tells the
  // backend so closed-app pushes use it too.
  const changeAlarmSound = async (id) => {
    const chosen = getAlarmSound(id).id;
    alarmSoundRef.current = chosen;
    setAlarmSound(chosen);
    await setAlarmSoundPreference(chosen);
    if (token) await registerPush();
  };

  // The Notifications screen's "Send test alarm" - rings this device only.
  const sendTestAlarm = async () => {
    if (!pushTokenRef.current) {
      return { ok: false };
    }
    const result = await apiSendTestAlarm(pushTokenRef.current);
    return result?.error ? { ok: false, error: result.error } : { ok: true };
  };

  // Tapping a fire notification opens the app; pull the new alert straight
  // away so the in-app alarm starts without waiting for the next poll.
  useEffect(() => {
    if (!token) return;
    const subscription = addNotificationTapListener(() => fetchAlerts());
    return () => subscription.remove();
  }, [token]);

  // A failed fetch keeps the last good answer rather than blanking the tiles.
  const fetchSystemHealth = async () => {
    const result = await apiGetSystemHealth();
    if (!result?.error && result?.summary) setSystemHealth(result);
  };

  // Start polling when the user logs in
  useEffect(() => {
    if (token) {
      fetchAlerts();
      fetchSystemHealth();
      alertRef.current = setInterval(() => fetchAlerts(), 10000);
      systemHealthRef.current = setInterval(() => fetchSystemHealth(), 60000);
    } else {
      setSystemHealth(null);
    }
    return () => {
      clearInterval(alertRef.current);
      clearInterval(systemHealthRef.current);
    };
  }, [token]);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      if (!token) {
        setRoomData([]);
        setBilik(null);
        setBilikError(null);
        setBilikLoading(false);
        return;
      }

      setBilikLoading(true);
      setBilikError(null);
      setBilik(null);
      setRoomData([]);
      try {
        const fetchedBilik = await apiGetBilikData();
        if (!mounted) return;
        if (fetchedBilik?.error) throw new Error(fetchedBilik.error);
        if (fetchedBilik?.bilikId == null) {
          throw new Error("No Bilik is associated with this account.");
        }
        const rooms = await getRoomsByBilik(fetchedBilik.bilikId);
        if (!mounted) return;
        if (rooms?.error) throw new Error(rooms.error);
        if (!Array.isArray(rooms)) throw new Error("Invalid rooms response.");
        setRoomData(rooms);
        setBilik(fetchedBilik);
      } catch (error) {
        if (mounted) {
          setBilik(null);
          const message = error.message || "Could not load Bilik information.";
          setBilikError(message);
          setRoomData({ error: message });
        }
      } finally {
        if (mounted) setBilikLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [token, bilikRequest]);

  const refreshBilik = () => setBilikRequest((request) => request + 1);

  // Profile picture follows the session: loaded on login, dropped on logout.
  useEffect(() => {
    if (!token) {
      setAvatarUrl(null);
      return;
    }
    apiGetAvatar().then((result) => {
      if (!result?.error) setAvatarUrl(result?.avatarUrl ?? null);
    });
  }, [token]);

  // Returns { ok } so the caller can show its own error message.
  const updateAvatar = async (imageBase64) => {
    const result = await apiUploadAvatar(imageBase64);
    if (result?.error || !result?.avatarUrl) {
      return { ok: false, error: result?.error };
    }
    setAvatarUrl(result.avatarUrl);
    return { ok: true };
  };

  // Called after Personal Information saves a new name, so the Profile tab
  // and the unlock screen show it without signing in again.
  const updateUserName = async (fullName) => {
    setUser((prev) => (prev ? { ...prev, name: fullName } : prev));
    setLockedUser((prev) => (prev ? { ...prev, fullName } : prev));
    await updateStoredUser({ fullName });
  };

  // ---- First-launch tutorial ----------------------------------------
  // We persist a "seen" flag in SecureStore so the walkthrough only
  // auto-opens once, the first time a user reaches the app after signing in.
  const TUTORIAL_SEEN_KEY = "firebomba_tutorial_seen";

  const maybeShowTutorialOnFirstLaunch = async () => {
    try {
      const seen = await SecureStore.getItemAsync(TUTORIAL_SEEN_KEY);
      if (!seen) {
        setTutorialVisible(true);
      }
    } catch {
      // SecureStore unavailable — show it once this session anyway
      setTutorialVisible(true);
    }
  };

  const openTutorial = () => setTutorialVisible(true);

  const closeTutorial = async () => {
    setTutorialVisible(false);
    try {
      await SecureStore.setItemAsync(TUTORIAL_SEEN_KEY, "true");
    } catch {
      // ignore write failures — worst case it shows again next launch
    }
  };

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
    // Open the walkthrough on the very first login only
    maybeShowTutorialOnFirstLaunch();
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
    prevUnreadRef.current = 0;
    // Must run before logoutUser clears the access token it authenticates with.
    if (pushTokenRef.current) {
      await apiUnregisterPushToken(pushTokenRef.current);
      pushTokenRef.current = null;
    }
    setPushRegistered(null);
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
      fireSafetyContent:
        FIRE_SAFETY_CONTENT[language] || FIRE_SAFETY_CONTENT.en,
      fireSafetyProgress,
      saveFireSafetyProgress,
      t,
      login,
      logout,
      roomData,
      bilik,
      bilikLoading,
      bilikError,
      refreshBilik,
      notifications,
      unreadCount,
      markAllRead,
      markNotificationRead,
      clearNotification,
      clearAllNotifications,
      refreshAlerts: () => token && fetchAlerts(),
      // Reload the household and its rooms together, including Home's Retry.
      refreshRoomData: () => {
        if (token) refreshBilik();
      },
      tutorialVisible,
      openTutorial,
      avatarUrl,
      updateAvatar,
      updateUserName,
      pushRegistered,
      registerPush,
      alarmSound,
      changeAlarmSound,
      sendTestAlarm,
      closeTutorial,
      realtimeError: null,
      systemHealth,
      refreshSystemHealth: () => token && fetchSystemHealth(),
      // The Home / Profile tiles; null values render as "-" until loaded.
      systemStatus: {
        allOperational: systemHealth?.summary.allOperational ?? false,
        roomsOnline: systemHealth?.summary.roomsOnline ?? null,
        roomsTotal: systemHealth?.summary.roomsTotal ?? null,
        camerasOn: systemHealth?.summary.camerasOn ?? null,
        fireEvents: systemHealth?.summary.fireEvents ?? null,
      },
    };
  }, [
    language,
    fireSafetyProgress,
    notifications,
    user,
    token,
    authReady,
    roomData,
    bilik,
    needsUnlock,
    lockedUser,
    biometricSupport,
    biometricEnabled,
    pushRegistered,
    alarmSound,
    systemHealth,
    tutorialVisible,
    avatarUrl,
    bilikLoading,
    bilikError,
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
