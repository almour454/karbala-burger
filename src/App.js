import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  runTransaction
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  signInWithEmailAndPassword,
  signOut,
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";

/**
 * 🛠️ CONFIGURATION
 */
const localConfig = {
  apiKey: "AIzaSyBi9O20ep4sQEfAQSvQAexHzzT1wjj8cHc",
  authDomain: "karbala-burger-app.firebaseapp.com",
  projectId: "karbala-burger-app",
  storageBucket: "karbala-burger-app.firebasestorage.app",
  messagingSenderId: "112064338237",
  appId: "1:112064338237:web:93b7154a4504704d82cd54",
  measurementId: "G-XRPEGJZRHG"
};

const configFromEnv = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || ""
};

const envFirebaseReady =
  Boolean(configFromEnv.apiKey && configFromEnv.authDomain && configFromEnv.projectId && configFromEnv.appId);

const firebaseConfig =
  typeof window !== "undefined" && window.__firebase_config
    ? JSON.parse(window.__firebase_config)
    : envFirebaseReady
      ? configFromEnv
      : localConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Note: offline handling is done via Firebase error catching, not navigator.onLine

const appId =
  typeof window !== "undefined" && window.__app_id
    ? window.__app_id
    : process.env.REACT_APP_APP_ID || "barber-booking-pro-v1";

// ── FIREBASE PATH HELPERS ──────────────────────────────────────────
// Teaching note: Each helper returns a Firebase reference.
// "public" = anyone can read (services, settings, available slots)
// "private" = only the authenticated owner can read (appointments, revenue)
const getServicesCollection  = () => collection(db, 'artifacts', appId, 'public',  'data', 'services');
const getSettingsDoc         = () => doc(db,        'artifacts', appId, 'public',  'data', 'settings', 'global');
const getOwnerDoc            = () => doc(db,        'artifacts', appId, 'private', 'data', 'admin',    'owner');
const getApptCollection      = (dateStr) => collection(db, 'artifacts', appId, 'private', 'data', 'appointments', dateStr, 'items');
const getApptCounterDoc      = (dateStr) => doc(db, 'artifacts', appId, 'public',  'data', 'counters', dateStr);
const getBlockedSlotsDoc     = (dateStr) => doc(db, 'artifacts', appId, 'public',  'data', 'blocked',  dateStr);
const getDateStr             = () => new Date().toLocaleDateString('en-CA');

// ============================================================
// 🚩 BUNDLE — change one word to switch plans
//
//   "basic"    = WhatsApp only      (400,000 IQD)
//   "premium"  = Full POS Dashboard (500,000 IQD)
//
const BUNDLE = "premium";
// ============================================================

// ============================================================
// 🔒 BRAND LOCK — set to false when setting up a new client
//    true  = name/colors/logo locked (client cannot change)
//    false = everything editable (developer setup mode)
const LOCKED = false;
// ============================================================

// Shorthand used throughout the code — don't touch this line
const FEATURES = {
  dashboard:    BUNDLE === "premium",
  history:      BUNDLE === "premium",
  orderNumbers: BUNDLE === "premium",
  printSlip:    BUNDLE === "premium",
  soundAlert:   BUNDLE === "premium",
};

const PLACEHOLDER = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop";

const digitsOnly = (raw) => String(raw || "").replace(/\D/g, "");

const contactPhonesList = (s) =>
  [s?.contactPhone1, s?.contactPhone2, s?.contactPhone3]
    .map((x) => (x == null || x === "" ? "" : String(x).trim()))
    .filter((x) => digitsOnly(x).length >= 5);

const toTelHref = (raw) => {
  const d = digitsOnly(raw);
  if (!d) return "#";
  return `tel:+${d}`;
};

export default function App() {
  // ── NAVIGATION ──────────────────────────────────────────────────
  // Teaching: "view" controls which screen shows — customer booking or owner dashboard
  const [view, setView] = useState("customer");
  const [user, setUser] = useState(null);

  // ── SERVICES (replaces menu items) ──────────────────────────────
  // Teaching: Instead of food items, we have barbershop services.
  // Each service has: name, price, duration (minutes), description, image
  const [services, setServices] = useState([]);

  // ── SETTINGS ────────────────────────────────────────────────────
  // Teaching: Same structure as restaurant but barbershop fields.
  // workingHours = array of {day, open, close, closed} for each day of week
  // slotDuration = gap between appointments in minutes
  // bookingDaysAhead = how many days in advance customers can book
  const [settings, setSettings] = useState({
    shopName:        "MY BARBER SHOP",
    shopNameAr:      "صالون الحلاقة",
    primaryColor:    "#1e293b",
    bgColor:         "#ffffff",
    whatsapp:        "964780000000",
    workingHoursStr: "9:00 AM - 10:00 PM",
    locationDesc:    "كربلاء",
    facebookUrl:     "",
    instagramUrl:    "",
    tiktokUrl:       "",
    contactPhone1:   "",
    contactPhone2:   "",
    slotDuration:    30,       // minutes between slots
    bookingDaysAhead:14,       // how many days ahead customers can book
    offDays:         ["Friday"],// days shop is closed
    bookingNote:     "يرجى الحضور قبل موعدك بـ 5 دقائق.",
    logoUrl:         "",
    dayCloseHour:    23,
    printCopies:     1,
    autoGreyHours:   3,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── CUSTOMER BOOKING FLOW ────────────────────────────────────────
  // Teaching: Step by step — pick service → pick date → pick slot → enter info → confirm
  const [bookingStep, setBookingStep] = useState(1); // 1=service, 2=datetime, 3=info, 4=confirm
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bookedSlots, setBookedSlots] = useState([]); // slots taken on selected date
  const [blockedSlots, setBlockedSlots] = useState([]); // slots blocked by owner
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [confirmedApptNum, setConfirmedApptNum] = useState(null);

  // ── OWNER DASHBOARD ──────────────────────────────────────────────
  // Teaching: Same auth structure as restaurant — reused completely
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [dataError, setDataError] = useState(null);
  const [adminTab, setAdminTab] = useState(FEATURES.dashboard ? "appointments" : "settings");
  const [appointments, setAppointments] = useState([]);
  const [historyDate, setHistoryDate] = useState("");
  const [historyAppts, setHistoryAppts] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmedApptDay, setConfirmedApptDay] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [apptTab, setApptTab] = useState("upcoming"); // "upcoming" | "done"
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(true);
  const [showMidnightWarning, setShowMidnightWarning] = useState(false);
  const [resetUnlocked, setResetUnlocked] = useState(false);
  const [historySearchNum, setHistorySearchNum] = useState("");

  // ── OWNER SERVICES MANAGEMENT ────────────────────────────────────
  const [newService, setNewService] = useState({ name: "", price: "", duration: "30", desc: "", image: "" });
  const [saveStatus, setSaveStatus] = useState("");

  // today's date string "YYYY-MM-DD"
  const todayStr = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "admin") setView("owner");
      else setView("customer");
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateTo = (newView) => {
    window.location.hash = newView === "owner" ? "admin" : "";
    setView(newView);
    window.scrollTo(0, 0); 
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
      try {
        if (auth.currentUser) return;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) {
        setUser({ uid: 'guest-' + Math.random().toString(36).substr(2, 9) });
      }
    };
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const syncOwnerAccess = async () => {
      if (!user || user.isAnonymous) {
        setIsUnlocked(false);
        return;
      }
      try {
        const ownerSnap = await getDoc(getOwnerDoc());
        setIsUnlocked(ownerSnap.exists() && ownerSnap.data().uid === user.uid);
      } catch {
        setIsUnlocked(false);
      }
    };
    syncOwnerAccess();
  }, [user]);

  // ── LOAD SERVICES + SETTINGS FROM FIREBASE ──────────────────────
  // Teaching: Same pattern as restaurant — onSnapshot = live listener.
  // When owner changes a service price, every customer's screen updates instantly.
  useEffect(() => {
    if (!user) return;
    const unsubServices = onSnapshot(getServicesCollection(),
      (snap) => { setServices(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error(err); setDataError("تعذر تحميل الخدمات."); }
    );
    const unsubSettings = onSnapshot(getSettingsDoc(),
      (snap) => {
        if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
        setSettingsLoaded(true);
      },
      (err) => { console.error(err); setDataError("تعذر تحميل الإعدادات."); }
    );
    return () => { unsubServices(); unsubSettings(); };
  }, [user]);

  // ── APPOINTMENTS LISTENER (owner only, today) ────────────────────
  // Teaching: Same as restaurant orders listener — only fires when owner is logged in.
  // Plays a sound when a new appointment arrives.
  useEffect(() => {
    if (!isUnlocked) { setAppointments([]); return; }
    const q = query(getApptCollection(getDateStr()), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q,
      (snap) => {
        const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAppointments(prev => {
          const prevIds = new Set(prev.map(a => a.id));
          const isNew = incoming.some(a => !prevIds.has(a.id) && a.status === 'upcoming');
          if (isNew && prev.length > 0 && FEATURES.soundAlert) {
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              [0, 0.2].forEach(t => {
                const osc = ctx.createOscillator(); const g = ctx.createGain();
                osc.connect(g); g.connect(ctx.destination);
                osc.frequency.value = 660;
                g.gain.setValueAtTime(0.4, ctx.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.4);
                osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.4);
              });
            } catch {}
          }
          return incoming;
        });
      },
      (err) => console.error("Appt listener error:", err)
    );
    return () => unsub();
  }, [isUnlocked]);

  // ── LOAD BOOKED SLOTS WHEN DATE IS SELECTED ───────────────────────
  // Teaching: When customer picks a date, we fetch that day's appointments
  // from Firebase to know which slots are already taken.
  // We also fetch blocked slots (slots owner manually blocked).
  useEffect(() => {
    if (!selectedDate || !user) return;
    const fetchSlots = async () => {
      try {
        const q = query(getApptCollection(selectedDate), orderBy("createdAt", "asc"));
        const snap = await getDocs(q);
        const taken = snap.docs
          .map(d => d.data())
          .filter(a => a.status !== 'cancelled')
          .map(a => a.timeSlot);
        setBookedSlots(taken);
      } catch (e) { console.error(e); }
      try {
        const blockSnap = await getDoc(getBlockedSlotsDoc(selectedDate));
        setBlockedSlots(blockSnap.exists() ? (blockSnap.data().slots || []) : []);
      } catch (e) { console.error(e); }
    };
    fetchSlots();
  }, [selectedDate, user]);

  // ── SLOT GENERATOR ────────────────────────────────────────────────
  // Teaching: This is the brain of the booking system.
  // Given working hours and slot duration, generate all possible time slots.
  // Then filter out: past slots (if today), booked slots, blocked slots.
  const generateSlots = (dateStr) => {
    if (!dateStr) return [];
    const duration = Number(settings.slotDuration) || 30;
    // Parse working hours from "9:00 AM - 10:00 PM"
    const hoursStr = settings.workingHoursStr || "9:00 AM - 10:00 PM";
    const parts = hoursStr.split(' - ');
    const parseTime = (str) => {
      const [time, period] = str.trim().split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + (m || 0);
    };
    const startMin = parseTime(parts[0]);
    const endMin   = parseTime(parts[1] || "22:00");
    const slots = [];
    const now = new Date();
    const isToday = dateStr === todayStr;
    const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : 0;
    for (let m = startMin; m + duration <= endMin; m += duration) {
      if (isToday && m <= nowMin) continue; // skip past slots
      const h = Math.floor(m / 60);
      const min = m % 60;
      const label = `${h % 12 || 12}:${min.toString().padStart(2,'0')} ${h < 12 ? 'ص' : 'م'}`;
      const val = `${h.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
      if (!bookedSlots.includes(val) && !blockedSlots.includes(val)) {
        slots.push({ label, val });
      }
    }
    return slots;
  };

  // ── AVAILABLE DATES ────────────────────────────────────────────────
  // Teaching: Generate next N days, skip off days (e.g. Friday)
  const availableDates = useMemo(() => {
    const days = [];
    const daysAhead = Number(settings.bookingDaysAhead) || 14;
    const offDays = settings.offDays || [];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dayName = dayNames[d.getDay()];
      if (!offDays.includes(dayName)) {
        days.push({
          str: d.toLocaleDateString('en-CA'),
          label: i === 0 ? 'اليوم' : i === 1 ? 'غداً' :
            d.toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' })
        });
      }
    }
    return days;
  }, [settings.bookingDaysAhead, settings.offDays, todayStr]);

  // ── BOOK APPOINTMENT ──────────────────────────────────────────────
  // Teaching: Save appointment to Firebase. Uses a transaction to get
  // a unique sequential number for the day — same pattern as restaurant orders.
  const bookAppointment = async () => {
    if (!selectedService || !selectedDate || !selectedSlot || !customerName || !customerPhone) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const counterRef = getApptCounterDoc(selectedDate);
      let apptNumber = 1;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        apptNumber = snap.exists() ? (snap.data().count || 0) + 1 : 1;
        tx.set(counterRef, { count: apptNumber }, { merge: true });
      });
      await addDoc(getApptCollection(selectedDate), {
        apptNumber,
        customerName,
        customerPhone,
        serviceId:   selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        duration:    selectedService.duration,
        timeSlot:    selectedSlot,
        dateStr:     selectedDate,
        status:      'upcoming',
        createdAt:   new Date().toISOString(),
      });
      setConfirmedApptNum(apptNumber);
      setBookingStep(1);
      setSelectedService(null);
      setSelectedDate('');
      setSelectedSlot('');
      setCustomerName('');
      setCustomerPhone('');
    } catch (e) {
      console.error(e);
      setBookingError('فشل الحجز. تحقق من الاتصال وأعد المحاولة.');
    }
    setBookingSubmitting(false);
  };

  // ── OWNER: UPDATE APPOINTMENT STATUS ─────────────────────────────
  const updateApptStatus = async (appt, status) => {
    try {
      await updateDoc(
        doc(db, 'artifacts', appId, 'private', 'data', 'appointments', appt.dateStr, 'items', appt.id),
        { status }
      );
    } catch (e) { console.error(e); }
  };

  // ── OWNER: DELETE APPOINTMENT ─────────────────────────────────────
  const deleteAppt = async (appt) => {
    if (!window.confirm(`حذف موعد #${appt.apptNumber} للزبون ${appt.customerName}؟`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'private', 'data', 'appointments', appt.dateStr, 'items', appt.id));
    } catch (e) { console.error(e); }
  };

  // ── OWNER: BLOCK / UNBLOCK A TIME SLOT ───────────────────────────
  // Teaching: Owner can tap a slot on the calendar to block it (lunch, break, etc.)
  // Stored as an array of "HH:MM" strings in a doc per date.
  const toggleBlockSlot = async (dateStr, slotVal) => {
    const ref = getBlockedSlotsDoc(dateStr);
    try {
      const snap = await getDoc(ref);
      const current = snap.exists() ? (snap.data().slots || []) : [];
      const updated = current.includes(slotVal)
        ? current.filter(s => s !== slotVal)
        : [...current, slotVal];
      await setDoc(ref, { slots: updated }, { merge: true });
      setBlockedSlots(updated);
    } catch (e) { console.error(e); }
  };

  // ── OWNER: LOAD HISTORY ───────────────────────────────────────────
  const loadHistoryAppts = async (dateStr) => {
    setHistoryLoading(true); setHistoryAppts([]);
    try {
      const q = query(getApptCollection(dateStr), orderBy("timeSlot", "asc"));
      const snap = await getDocs(q);
      setHistoryAppts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setHistoryLoading(false);
  };

  // ── OWNER: HANDLE AUTH ────────────────────────────────────────────
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!ownerEmail.trim() || !ownerPassword) return;
    setAuthError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, ownerEmail.trim(), ownerPassword);
      const ownerRef = getOwnerDoc();
      const ownerSnap = await getDoc(ownerRef);
      if (!ownerSnap.exists()) {
        await setDoc(ownerRef, { uid: cred.user.uid, email: cred.user.email || ownerEmail.trim(), createdAt: new Date().toISOString() }, { merge: true });
      } else if (ownerSnap.data().uid !== cred.user.uid) {
        await signOut(auth); await signInAnonymously(auth);
        setAuthError('هذا الحساب ليس مالك النظام.'); setIsUnlocked(false); return;
      }
      setIsUnlocked(true); setOwnerPassword('');
    } catch { setAuthError('فشل تسجيل الدخول. تحقق من الإيميل وكلمة المرور.'); }
  };

  const handleOwnerLogout = async () => {
    setIsUnlocked(false); setOwnerPassword('');
    try { await signOut(auth); await signInAnonymously(auth); } catch (e) { console.error(e); }
    navigateTo('customer');
  };

  // ── OWNER: MANAGE SERVICES ────────────────────────────────────────
  const updateGlobalSettings = async (field, value) => {
    if (!user) return;
    await setDoc(getSettingsDoc(), { [field]: value }, { merge: true });
  };

  const handleAddService = async () => {
    if (!newService.name || !newService.price) return;
    const id = newService.id || 'svc_' + Date.now();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'services', id), {
        ...newService, id,
        price: Number(newService.price) || 0,
        duration: Number(newService.duration) || 30,
        createdAt: new Date().toISOString()
      });
      setNewService({ name: '', price: '', duration: '30', desc: '', image: '' });
      setSaveStatus('تم الحفظ ✅'); setTimeout(() => setSaveStatus(''), 2500);
    } catch { setSaveStatus('خطأ ❌'); }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm('حذف هذه الخدمة؟')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'services', id));
  };

  // ── PRINT APPOINTMENT RECEIPT ─────────────────────────────────────
  const printApptReceipt = (appt) => {
    const win = window.open('', '_blank', 'width=240,height=400');
    if (!win) return;
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    win.document.write(`<html><head><meta charset="utf-8"/>
      <style>
        @page{size:58mm auto;margin:2mm}
        body{font-family:'Courier New',monospace;direction:rtl;font-size:11px;width:54mm;margin:0;padding:0}
        h1{font-size:13px;font-weight:900;text-align:center;margin:0 0 1mm}
        .num{font-size:30px;font-weight:900;text-align:center;margin:2mm 0}
        .row{display:flex;justify-content:space-between;padding:1mm 0;border-bottom:1px dotted #999;font-size:10px}
        .meta{font-size:9px;color:#444;text-align:center;margin:1mm 0}
        hr{border:none;border-top:1px dashed #333;margin:2mm 0}
        @media print{body{width:54mm}html{width:58mm}}
      </style></head><body>
      <h1>${esc(settings.shopName)}</h1>
      <div class="meta">${esc(settings.shopNameAr)}</div>
      <hr/>
      <div class="num">#${appt.apptNumber || '—'}</div>
      <hr/>
      <div class="row"><span>الاسم</span><span>${esc(appt.customerName)}</span></div>
      <div class="row"><span>الخدمة</span><span>${esc(appt.serviceName)}</span></div>
      <div class="row"><span>التاريخ</span><span>${appt.dateStr}</span></div>
      <div class="row"><span>الوقت</span><span dir="ltr">${appt.timeSlot}</span></div>
      <div class="row"><span>السعر</span><span>${(appt.servicePrice||0).toLocaleString()} د.ع</span></div>
      <hr/>
      <div class="meta">أهلاً بك 💈</div>
      <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>`);
    win.document.close();
  };

  // ── SPLIT APPOINTMENTS ────────────────────────────────────────────
  const upcomingAppts = appointments.filter(a => a.status === 'upcoming');
  const doneAppts     = appointments.filter(a => a.status === 'done' || a.status === 'noshow');
  const todayRevenue  = doneAppts.filter(a => a.status === 'done').reduce((s,a) => s + (a.servicePrice||0), 0);

  // ── TIME FORMAT HELPER ────────────────────────────────────────────
  const fmtSlot = (val) => {
    if (!val) return '';
    const [h, m] = val.split(':').map(Number);
    return `${h%12||12}:${m.toString().padStart(2,'0')} ${h<12?'ص':'م'}`;
  };

  return (
    <div className="min-h-screen transition-colors duration-500" style={{ backgroundColor: settings.bgColor, fontFamily: 'sans-serif' }}>

      {/* ── NAVIGATION ── */}
      <div className="flex justify-center p-4">
        <div className="flex bg-black/90 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-2xl">
          <button onClick={() => navigateTo("customer")}
            className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view==='customer'?'text-white shadow-lg':'text-slate-500'}`}
            style={view==='customer'?{backgroundColor:settings.primaryColor}:{}}>حجز موعد</button>
          <button onClick={() => navigateTo("owner")}
            className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view==='owner'?'bg-white text-black shadow-lg':'text-slate-500'}`}>
            الإدارة
          </button>
        </div>
      </div>

      {dataError && (
        <div className="px-4 pb-2 max-w-xl mx-auto" dir="rtl">
          <div className="bg-red-500/15 border border-red-500/35 text-red-900 rounded-2xl px-4 py-3 text-xs font-bold text-center">{dataError}</div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          OWNER PANEL
      ══════════════════════════════════════════════════════════════ */}
      {view === "owner" ? (
        !isUnlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-6">
            <form onSubmit={handleAuthSubmit} className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center shadow-2xl">
              <div className="text-5xl mb-6">💈</div>
              <h2 className="text-white text-2xl font-black italic uppercase mb-6">دخول الإدارة</h2>
              <input type="email" value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)}
                className={`w-full bg-black border ${authError?'border-red-500':'border-white/10'} p-4 rounded-2xl text-white text-right outline-none focus:border-blue-500 text-sm font-bold mb-3`}
                placeholder="Owner Email" />
              <input type="password" value={ownerPassword} onChange={e=>setOwnerPassword(e.target.value)}
                className={`w-full bg-black border ${authError?'border-red-500 animate-shake':'border-white/10'} p-4 rounded-2xl text-white text-right outline-none focus:border-blue-500 text-sm font-bold`}
                placeholder="كلمة المرور" />
              {authError && <p className="mt-3 text-red-400 text-xs font-bold">{authError}</p>}
              <button type="submit" className="w-full mt-6 py-5 text-white font-black rounded-2xl text-[12px] uppercase tracking-widest shadow-xl transition-transform active:scale-95" style={{backgroundColor:settings.primaryColor}}>دخول</button>
            </form>
          </div>
        ) : (
          <div className="owner-panel max-w-4xl mx-auto p-6 pb-40 space-y-6" dir="rtl">

            {/* Tab bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex bg-black/80 backdrop-blur-md p-1 rounded-2xl gap-1 flex-wrap">
                {FEATURES.dashboard && (
                  <button onClick={()=>setAdminTab("appointments")}
                    className={`relative px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center gap-2 ${adminTab==='appointments'?'text-white shadow-lg':'text-slate-400 hover:text-white'}`}
                    style={adminTab==='appointments'?{backgroundColor:settings.primaryColor}:{}}>
                    المواعيد
                    {upcomingAppts.length > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse shrink-0">{upcomingAppts.length}</span>
                    )}
                  </button>
                )}
                {FEATURES.history && (
                  <button onClick={()=>{setAdminTab("history");setHistoryDate("");setHistoryAppts([]);}}
                    className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${adminTab==='history'?'bg-white text-black shadow-lg':'text-slate-400 hover:text-white'}`}>
                    السجل 📅
                  </button>
                )}
                <button onClick={()=>setAdminTab("settings")}
                  className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${adminTab==='settings'?'bg-white text-black shadow-lg':'text-slate-400 hover:text-white'}`}>
                  الإعدادات
                </button>
              </div>
              <button onClick={handleOwnerLogout}
                className="bg-black text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-white hover:text-black border border-white/20 transition-colors shrink-0">
                خروج
              </button>
            </div>

            {/* ── APPOINTMENTS TAB ── */}
            {FEATURES.dashboard && adminTab === "appointments" && (
              <div className="space-y-4">

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "مواعيد اليوم",  value: appointments.length,     color: "text-white" },
                    { label: "قادمة",          value: upcomingAppts.length,    color: "text-yellow-400" },
                    { label: "إيرادات اليوم",  value: todayRevenue.toLocaleString() + " د.ع", color: "text-green-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                      <p className={`font-black text-base leading-tight ${s.color}`}>{s.value}</p>
                      <p className="text-white/30 text-[9px] font-bold mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-2">
                  <button onClick={()=>setApptTab("upcoming")}
                    className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${apptTab==='upcoming'?'text-white shadow-lg':'bg-slate-800 text-slate-400'}`}
                    style={apptTab==='upcoming'?{backgroundColor:settings.primaryColor}:{}}>
                    قادمة
                    {upcomingAppts.length > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse">{upcomingAppts.length}</span>
                    )}
                  </button>
                  <button onClick={()=>setApptTab("done")}
                    className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wide transition-all ${apptTab==='done'?'bg-green-600 text-white shadow-lg':'bg-slate-800 text-slate-400'}`}>
                    منجزة ✓ ({doneAppts.length})
                  </button>
                </div>

                {/* Report + Print */}
                <div className="flex gap-2">
                  <button onClick={()=>setShowReport(r=>!r)}
                    disabled={!doneAppts.length}
                    className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 border ${doneAppts.length?'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30':'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'}`}>
                    📊 {showReport ? 'إخفاء التقرير' : 'تقرير اليوم'}
                  </button>
                  {doneAppts.length > 0 && (
                    <button onClick={()=>{
                      const win=window.open('','_blank','width=240,height=500');
                      win.document.write(`<html><head><meta charset="utf-8"/><style>@page{size:58mm auto;margin:2mm}body{font-family:'Courier New',monospace;direction:rtl;font-size:10px;width:54mm;margin:0}h2{font-size:12px;font-weight:900;text-align:center;margin:0 0 1mm}hr{border:none;border-top:1px dashed #333;margin:2mm 0}.row{display:flex;justify-content:space-between;padding:1mm 0;font-size:9px}.big{font-size:18px;font-weight:900;text-align:center;margin:2mm 0}.sign{border-bottom:1px solid #333;height:6mm;margin-top:1mm}@media print{body{width:54mm}}</style></head><body>
                      <h2>${settings.shopName}</h2><div style="text-align:center;font-size:8px">${todayStr}</div><hr/>
                      <div class="big">${todayRevenue.toLocaleString()} د.ع</div><div style="text-align:center;font-size:8px;color:#555">إجمالي الإيرادات</div>
                      <div class="row" style="margin-top:2mm"><span>عدد المواعيد:</span><span>${doneAppts.length}</span></div>
                      <div class="row"><span>متوسط الموعد:</span><span>${doneAppts.length?Math.round(todayRevenue/doneAppts.length).toLocaleString():0} د.ع</span></div><hr/>
                      ${doneAppts.map(a=>`<div class="row"><span>#${a.apptNumber} ${a.customerName}</span><span>${fmtSlot(a.timeSlot)}</span></div>`).join('')}<hr/>
                      <div>المبلغ الفعلي المعدود:</div><div class="sign"></div>
                      <div style="height:4mm"></div><div>توقيع المدير:</div><div class="sign"></div>
                      <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
                      win.document.close();
                    }}
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/50 hover:text-amber-400 hover:border-amber-500/30 font-black text-[11px] transition-all active:scale-95">
                      🖨️
                    </button>
                  )}
                </div>

                {/* Inline report card */}
                {showReport && doneAppts.length > 0 && (
                  <div className="bg-slate-900 rounded-[2rem] border border-amber-500/30 p-6 space-y-4">
                    <div className="text-center border-b border-white/10 pb-4">
                      <p className="text-amber-400 font-black text-[11px] uppercase tracking-widest mb-1">تقرير اليوم</p>
                      <p className="text-white font-black text-2xl">{todayRevenue.toLocaleString()} <span className="text-sm">د.ع</span></p>
                      <p className="text-white/30 text-[10px] font-bold mt-1">{todayStr}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {label:"مواعيد منجزة", value:doneAppts.length},
                        {label:"متوسط الموعد", value:(doneAppts.length?Math.round(todayRevenue/doneAppts.length):0).toLocaleString()+" د.ع"},
                        {label:"بالصندوق", value:todayRevenue.toLocaleString()+" د.ع"},
                      ].map(s=>(
                        <div key={s.label} className="bg-black/30 rounded-2xl p-3 text-center">
                          <p className="text-white font-black text-sm leading-tight">{s.value}</p>
                          <p className="text-white/30 text-[9px] font-bold mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* Top services */}
                    <div className="bg-black/30 rounded-2xl p-4">
                      <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-3">الخدمات الأكثر طلباً</p>
                      {Object.entries(doneAppts.reduce((acc,a)=>{acc[a.serviceName]=(acc[a.serviceName]||0)+1;return acc;},{}))
                        .sort((a,b)=>b[1]-a[1]).slice(0,4)
                        .map(([name,count])=>(
                          <div key={name} className="flex justify-between items-center mb-1.5">
                            <span className="text-white text-[11px] font-bold">{name}</span>
                            <span className="text-white/50 text-[11px] font-black">{count} مرة</span>
                          </div>
                        ))}
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
                      <p className="text-amber-300/80 text-[10px] font-black uppercase tracking-widest mb-2">المبلغ الفعلي المعدود</p>
                      <div className="border-b-2 border-dashed border-amber-500/30 h-8" />
                    </div>
                  </div>
                )}

                {/* Appointment cards */}
                {apptTab === "upcoming" && (
                  <div className="space-y-4">
                    {upcomingAppts.length === 0 && (
                      <div className="bg-slate-900 rounded-[2rem] p-14 text-center border border-white/5">
                        <div className="text-5xl mb-4">📭</div>
                        <p className="text-white/40 font-black text-sm">لا توجد مواعيد قادمة اليوم</p>
                      </div>
                    )}
                    {upcomingAppts.map(appt => (
                      <div key={appt.id} className="bg-slate-900 rounded-[2rem] p-6 border border-yellow-500/40 shadow-yellow-500/10 shadow-xl">
                        <div className="flex justify-between items-start gap-3 mb-4">
                          <div className="flex items-start gap-3">
                            {FEATURES.orderNumbers && (
                              <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white" style={{backgroundColor:settings.primaryColor}}>
                                #{appt.apptNumber||'?'}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-yellow-500 text-white text-[9px] font-black px-3 py-1 rounded-full">قادم 🔔</span>
                                <span className="text-white/50 font-black text-sm" dir="ltr">{fmtSlot(appt.timeSlot)}</span>
                              </div>
                              <p className="text-white font-black text-base">{appt.customerName}</p>
                              <p className="text-white/50 text-[11px] font-bold" dir="ltr">{appt.customerPhone}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-2">
                            <p className="text-xl font-black" style={{color:settings.primaryColor}}>{(appt.servicePrice||0).toLocaleString()} <span className="text-[10px]">د.ع</span></p>
                            {FEATURES.printSlip && (
                              <button onClick={()=>printApptReceipt(appt)}
                                className="text-[10px] font-black text-white/40 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all">
                                🖨️ طباعة
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="bg-black/30 rounded-2xl px-4 py-3 mb-4 flex justify-between items-center">
                          <span className="text-white/60 text-[11px] font-bold">✂️ {appt.serviceName}</span>
                          <span className="text-white/40 text-[10px] font-bold">{appt.duration} دقيقة</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>updateApptStatus(appt,'done')}
                            className="flex-1 py-3 rounded-2xl text-white font-black text-[11px] uppercase tracking-wide active:scale-95 transition-all"
                            style={{backgroundColor:settings.primaryColor}}>
                            ✅ منجز
                          </button>
                          <button onClick={()=>updateApptStatus(appt,'noshow')}
                            className="px-4 py-3 rounded-2xl bg-slate-700/50 text-white/40 hover:text-white font-black text-[11px] transition-all">
                            غياب
                          </button>
                          <a href={`https://wa.me/${digitsOnly(appt.customerPhone)}?text=${encodeURIComponent(`مرحباً ${appt.customerName}، موعدك عندنا اليوم ${fmtSlot(appt.timeSlot)} 💈`)}`}
                            target="_blank" rel="noreferrer"
                            className="px-4 py-3 rounded-2xl bg-[#25D366]/20 text-[#25D366] font-black text-[11px] flex items-center justify-center hover:bg-[#25D366]/30 transition-all shrink-0">
                            💬
                          </a>
                          <button onClick={()=>deleteAppt(appt)}
                            className="px-4 py-3 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white font-black text-[10px] transition-all">
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {apptTab === "done" && (
                  <div className="space-y-3">
                    {doneAppts.length === 0 && (
                      <div className="bg-slate-900 rounded-[2rem] p-12 text-center border border-white/5">
                        <p className="text-white/40 font-black text-sm">لا توجد مواعيد منجزة بعد</p>
                      </div>
                    )}
                    {doneAppts.map(appt => (
                      <div key={appt.id} className="bg-slate-900 rounded-2xl p-4 border border-white/5 opacity-70 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {FEATURES.orderNumbers && (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base text-white bg-green-600 shrink-0">#{appt.apptNumber}</div>
                          )}
                          <div>
                            <p className="text-white font-black text-sm">{appt.customerName}</p>
                            <p className="text-white/40 text-[10px] font-bold">{appt.serviceName} — {fmtSlot(appt.timeSlot)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-green-400 font-black text-sm">{(appt.servicePrice||0).toLocaleString()} د.ع</p>
                          <span className="bg-green-600/30 text-green-400 text-[9px] font-black px-2 py-0.5 rounded-full">{appt.status==='noshow'?'غياب':'منجز'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tiny reset */}
                <div className="flex items-center justify-end gap-2 pt-1 opacity-30 hover:opacity-80 transition-opacity">
                  <span className="text-[9px] text-white/30 font-bold">إعادة العداد من #1</span>
                  {!resetUnlocked ? (
                    <button onClick={()=>setResetUnlocked(true)} className="text-[9px] font-black text-white/20 hover:text-white/50 bg-white/5 px-2 py-1 rounded-lg transition-all">🔒 فتح</button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={async()=>{
                        if(!window.confirm('إعادة عداد المواعيد من #1؟')) return;
                        try{await deleteDoc(getApptCounterDoc(todayStr));}catch(e){console.error(e);}
                        setResetUnlocked(false);
                      }} className="text-[9px] font-black text-red-400/70 hover:text-red-400 bg-red-500/10 px-2 py-1 rounded-lg transition-all">إعادة</button>
                      <button onClick={()=>setResetUnlocked(false)} className="text-[9px] font-black text-white/20 hover:text-white/40 bg-white/5 px-2 py-1 rounded-lg transition-all">🔒</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {FEATURES.history && adminTab === "history" && (
              <div className="space-y-4">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">سجل المواعيد السابقة 📅</h3>
                <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5">
                  <p className="text-white/50 text-[11px] font-bold mb-3">اختر يوماً</p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                    {Array.from({length:7},(_,i)=>{
                      const d=new Date(); d.setDate(d.getDate()-i);
                      const str=d.toLocaleDateString('en-CA');
                      const label=i===0?'اليوم':i===1?'أمس':d.toLocaleDateString('ar-IQ',{weekday:'short'});
                      const active=historyDate===str;
                      return(
                        <button key={str} onClick={()=>{setHistoryDate(str);loadHistoryAppts(str);}}
                          className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black transition-all border ${active?'text-white border-transparent':'bg-black/30 text-white/40 border-white/10 hover:border-white/20'}`}
                          style={active?{backgroundColor:settings.primaryColor}:{}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input type="date" max={todayStr} value={historyDate}
                      onChange={e=>{setHistoryDate(e.target.value);if(e.target.value)loadHistoryAppts(e.target.value);}}
                      className="flex-1 bg-black/50 border border-white/10 p-3 rounded-xl text-white/50 text-sm font-bold outline-none focus:border-orange-500" />
                    {historyDate&&<button onClick={()=>{setHistoryDate("");setHistoryAppts([]);}} className="px-4 rounded-xl bg-white/5 text-white/40 hover:text-white font-black text-sm transition-all">✕</button>}
                  </div>
                </div>
                {historyLoading && <div className="text-center py-8"><div className="text-3xl animate-pulse">⏳</div></div>}
                {!historyLoading && historyDate && historyAppts.length === 0 && (
                  <div className="bg-slate-900 rounded-[2rem] p-12 text-center border border-white/5">
                    <div className="text-4xl mb-3">🗓️</div>
                    <p className="text-white/40 font-black text-sm">لا توجد مواعيد في هذا اليوم</p>
                  </div>
                )}
                {!historyLoading && historyAppts.length > 0 && (
                  <>
                    {/* History summary */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {label:"المواعيد",value:historyAppts.length},
                        {label:"منجزة",value:historyAppts.filter(a=>a.status==='done').length},
                        {label:"الإيرادات",value:historyAppts.filter(a=>a.status==='done').reduce((s,a)=>s+(a.servicePrice||0),0).toLocaleString()+" د.ع"},
                      ].map(s=>(
                        <div key={s.label} className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                          <p className="text-white font-black text-lg">{s.value}</p>
                          <p className="text-white/30 text-[9px] font-bold mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {historyAppts.map(appt=>(
                      <div key={appt.id} className="bg-slate-900 rounded-2xl p-4 border border-white/5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0" style={{backgroundColor: appt.status==='done'?'#16a34a':appt.status==='noshow'?'#dc2626':'#64748b'}}>
                            #{appt.apptNumber||'?'}
                          </div>
                          <div>
                            <p className="text-white font-black text-sm">{appt.customerName}</p>
                            <p className="text-white/40 text-[10px] font-bold">{appt.serviceName} — {fmtSlot(appt.timeSlot)}</p>
                          </div>
                        </div>
                        <p className="text-white/60 font-black text-sm shrink-0">{(appt.servicePrice||0).toLocaleString()} د.ع</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── SETTINGS TAB ── */}
            {adminTab === "settings" && (
              <div className="space-y-8">

                {/* Shop branding */}
                <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
                  <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">هوية الصالون</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم الصالون EN" value={settings.shopName||""} onChange={e=>updateGlobalSettings("shopName",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم الصالون AR" value={settings.shopNameAr||""} onChange={e=>updateGlobalSettings("shopNameAr",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="واتساب (964...)" value={settings.whatsapp||""} onChange={e=>updateGlobalSettings("whatsapp",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="ساعات العمل (مثال: 9:00 AM - 10:00 PM)" value={settings.workingHoursStr||""} onChange={e=>updateGlobalSettings("workingHoursStr",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2" placeholder="الموقع / العنوان" value={settings.locationDesc||""} onChange={e=>updateGlobalSettings("locationDesc",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="Facebook URL" value={settings.facebookUrl||""} onChange={e=>updateGlobalSettings("facebookUrl",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="Instagram URL" value={settings.instagramUrl||""} onChange={e=>updateGlobalSettings("instagramUrl",e.target.value)} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2" placeholder="رابط الشعار (صورة)" value={settings.logoUrl||""} onChange={e=>updateGlobalSettings("logoUrl",e.target.value)} />
                    <div className="bg-black/40 border border-white/5 p-4 rounded-xl md:col-span-2">
                      <p className="text-white text-[10px] font-bold mb-3">أيام الإجازة (اضغط للتبديل)</p>
                      <div className="flex flex-wrap gap-2">
                        {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day=>{
                          const arDay={Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'}[day];
                          const isOff=(settings.offDays||[]).includes(day);
                          return(
                            <button key={day} type="button"
                              onClick={()=>{const curr=settings.offDays||[];updateGlobalSettings("offDays",isOff?curr.filter(d=>d!==day):[...curr,day]);}}
                              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${isOff?'bg-red-500/30 text-red-400 border border-red-500/40':'bg-black/30 text-white/40 border border-white/10 hover:border-white/20'}`}>
                              {arDay}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                      <p className="text-white text-[10px] font-bold mb-2">مدة كل موعد (دقيقة)</p>
                      <div className="flex gap-2 flex-wrap">
                        {[15,20,30,45,60].map(n=>(
                          <button key={n} type="button" onClick={()=>updateGlobalSettings("slotDuration",n)}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${Number(settings.slotDuration)===n?'text-white':'bg-black/40 text-white/40'}`}
                            style={Number(settings.slotDuration)===n?{backgroundColor:settings.primaryColor}:{}}>
                            {n} د
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                      <p className="text-white text-[10px] font-bold mb-2">حجز مسبق (أيام)</p>
                      <div className="flex gap-2 flex-wrap">
                        {[7,14,21,30].map(n=>(
                          <button key={n} type="button" onClick={()=>updateGlobalSettings("bookingDaysAhead",n)}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${Number(settings.bookingDaysAhead)===n?'text-white':'bg-black/40 text-white/40'}`}
                            style={Number(settings.bookingDaysAhead)===n?{backgroundColor:settings.primaryColor}:{}}>
                            {n} يوم
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-white text-[10px] font-bold">اللون الأساسي</span>
                      <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer" value={settings.primaryColor||"#1e293b"} onChange={e=>updateGlobalSettings("primaryColor",e.target.value)} />
                    </div>
                    <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                      <span className="text-white text-[10px] font-bold">لون الخلفية</span>
                      <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer" value={settings.bgColor||"#ffffff"} onChange={e=>updateGlobalSettings("bgColor",e.target.value)} />
                    </div>
                    <textarea className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2 h-20 resize-none" placeholder="ملاحظة تظهر للزبون قبل الحجز" value={settings.bookingNote||""} onChange={e=>updateGlobalSettings("bookingNote",e.target.value)} />
                  </div>
                </section>

                {/* Services management */}
                <section id="service-form" className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
                  <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">إدارة الخدمات ✂️</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white font-bold" placeholder="اسم الخدمة (مثال: قص شعر)" value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="السعر (د.ع)" type="number" value={newService.price} onChange={e=>setNewService({...newService,price:e.target.value})} />
                    <div className="space-y-1">
                      <p className="text-white/50 text-[10px] font-bold">المدة (دقيقة)</p>
                      <div className="flex gap-2">
                        {[15,20,30,45,60].map(n=>(
                          <button key={n} type="button" onClick={()=>setNewService({...newService,duration:String(n)})}
                            className={`flex-1 py-3 rounded-xl text-[11px] font-black transition-all ${newService.duration===String(n)?'text-white':'bg-black/40 text-white/40'}`}
                            style={newService.duration===String(n)?{backgroundColor:settings.primaryColor}:{}}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="وصف الخدمة (اختياري)" value={newService.desc} onChange={e=>setNewService({...newService,desc:e.target.value})} />
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-xs md:col-span-2" placeholder="رابط صورة الخدمة (URL)" value={newService.image} onChange={e=>setNewService({...newService,image:e.target.value})} />
                    <button onClick={handleAddService} className="md:col-span-2 py-5 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all" style={{backgroundColor:settings.primaryColor}}>
                      {newService.id ? 'تحديث الخدمة 💾' : 'إضافة خدمة +'}
                    </button>
                    {saveStatus && <p className="md:col-span-2 text-center text-xs font-bold text-white">{saveStatus}</p>}
                  </div>

                  {/* Services list */}
                  <div className="space-y-3">
                    {services.map(svc=>(
                      <div key={svc.id} className="bg-black/40 p-3 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/20 transition-all">
                        <div className="flex items-center gap-4">
                          {svc.image && <img src={svc.image} alt={svc.name} className="w-12 h-12 rounded-xl object-cover" onError={e=>e.target.style.display='none'} />}
                          <div>
                            <p className="text-white font-bold text-sm">{svc.name}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-orange-500">{(svc.price||0).toLocaleString()} د.ع</span>
                              <span className="text-[9px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded-md">{svc.duration} د</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>setNewService({...svc})} className="text-white/40 hover:text-white p-2 text-[10px] font-black">تعديل</button>
                          <button onClick={()=>handleDeleteService(svc.id)} className="bg-red-500/10 text-red-500 px-3 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all text-[10px] font-black">حذف</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            )}
          </div>
        )
      ) : (

      /* ══════════════════════════════════════════════════════════════
          CUSTOMER BOOKING PAGE
      ══════════════════════════════════════════════════════════════ */
        <div className="pb-20">

          {/* HEADER */}
          <header className={`pt-10 pb-8 px-6 text-center transition-opacity duration-300 ${settingsLoaded?'opacity-100':'opacity-0'}`}>
            {settings.logoUrl && (
              <img src={settings.logoUrl} alt="logo" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover shadow-xl border-4" style={{borderColor:settings.primaryColor}} />
            )}
            <h1 className="text-5xl font-black italic uppercase tracking-tighter leading-tight text-slate-950">{settings.shopName}</h1>
            <h2 className="text-3xl font-black text-slate-800/40 mt-1">{settings.shopNameAr}</h2>
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3 bg-black text-white px-6 py-2.5 rounded-full shadow-xl">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                <span className="text-[11px] font-black uppercase tracking-widest">{settings.workingHoursStr}</span>
              </div>
              <div className="text-[12px] font-black text-slate-900/40 uppercase tracking-tighter" dir="rtl">📍 {settings.locationDesc}</div>
              {/* Social + phone pills */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 max-w-sm mx-auto px-2">
                {settings.facebookUrl && (
                  <a href={settings.facebookUrl} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#1877F2] hover:border-[#1877F2]/30 hover:shadow-md transition-all flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M13.5 8.5V6.8c0-.8.5-1.1 1.2-1.1H16V3h-2.1C11.6 3 10.5 4.4 10.5 6.2v2.3H9v2.8h1.5V21h3V11.3h2.1l.3-2.8h-2.4z"/></svg>
                  </a>
                )}
                {settings.instagramUrl && (
                  <a href={settings.instagramUrl} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#E1306C] hover:border-[#E1306C]/30 hover:shadow-md transition-all flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none" strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
                  </a>
                )}
                {[settings.contactPhone1,settings.contactPhone2].filter(p=>digitsOnly(p).length>=5).map((num,i)=>(
                  <a key={i} href={`tel:+${digitsOnly(num)}`} dir="ltr" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-white border border-black/10 text-slate-700 hover:border-slate-300 hover:shadow-md transition-all shrink-0">
                    <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    <span className="text-[11px] font-black tabular-nums">{digitsOnly(num)}</span>
                  </a>
                ))}
              </div>
            </div>
          </header>

          {/* BOOKING WIZARD */}
          <div className="max-w-lg mx-auto px-4 space-y-4" dir="rtl">

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[{n:1,label:'الخدمة'},{n:2,label:'الموعد'},{n:3,label:'بياناتك'}].map(({n,label})=>(
                <React.Fragment key={n}>
                  <div className={`flex flex-col items-center gap-1`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm transition-all ${bookingStep>=n?'text-white shadow-lg':'bg-slate-100 text-slate-400'}`}
                      style={bookingStep>=n?{backgroundColor:settings.primaryColor}:{}}>
                      {bookingStep>n?'✓':n}
                    </div>
                    <span className={`text-[9px] font-black ${bookingStep>=n?'text-slate-700':'text-slate-300'}`}>{label}</span>
                  </div>
                  {n<3 && <div className={`flex-1 h-0.5 mb-5 rounded-full transition-all ${bookingStep>n?'':'bg-slate-200'}`} style={bookingStep>n?{backgroundColor:settings.primaryColor}:{}} />}
                </React.Fragment>
              ))}
            </div>

            {/* STEP 1 — Pick service */}
            {bookingStep === 1 && (
              <div className="space-y-3">
                <h2 className="text-xl font-black text-slate-900 mb-4">اختر الخدمة ✂️</h2>
                {services.length === 0 && (
                  <div className="text-center py-12 text-slate-400 font-bold">لا توجد خدمات بعد</div>
                )}
                {services.map(svc=>(
                  <button key={svc.id} type="button" onClick={()=>{setSelectedService(svc);setBookingStep(2);}}
                    className={`w-full rounded-[2rem] p-5 border-2 transition-all text-right flex items-center gap-4 hover:shadow-lg active:scale-[0.98] ${selectedService?.id===svc.id?'border-transparent shadow-lg':'bg-white border-slate-100 hover:border-slate-200'}`}
                    style={selectedService?.id===svc.id?{backgroundColor:settings.primaryColor,borderColor:settings.primaryColor}:{}}>
                    {svc.image && <img src={svc.image} alt={svc.name} className="w-16 h-16 rounded-2xl object-cover shrink-0" onError={e=>e.target.style.display='none'} />}
                    {!svc.image && (
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 bg-slate-100">✂️</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-black text-lg leading-tight ${selectedService?.id===svc.id?'text-white':'text-slate-900'}`}>{svc.name}</p>
                      {svc.desc && <p className={`text-[11px] font-bold mt-0.5 ${selectedService?.id===svc.id?'text-white/70':'text-slate-400'}`}>{svc.desc}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-black text-xl ${selectedService?.id===svc.id?'text-white':'text-slate-900'}`} style={selectedService?.id!==svc.id?{color:settings.primaryColor}:{}}>{(svc.price||0).toLocaleString()}</p>
                      <p className={`text-[10px] font-bold ${selectedService?.id===svc.id?'text-white/70':'text-slate-400'}`}>د.ع · {svc.duration} د</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* STEP 2 — Pick date & slot */}
            {bookingStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={()=>setBookingStep(1)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all">←</button>
                  <h2 className="text-xl font-black text-slate-900">اختر الموعد 📅</h2>
                </div>
                {/* Selected service summary */}
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{backgroundColor:settings.primaryColor+'22'}}>✂️</div>
                  <div>
                    <p className="font-black text-sm text-slate-900">{selectedService?.name}</p>
                    <p className="text-[11px] font-bold text-slate-400">{(selectedService?.price||0).toLocaleString()} د.ع · {selectedService?.duration} دقيقة</p>
                  </div>
                </div>
                {/* Date pills */}
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">اختر اليوم</p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {availableDates.map(({str,label})=>{
                      const active=selectedDate===str;
                      return(
                        <button key={str} type="button" onClick={()=>{setSelectedDate(str);setSelectedSlot('');}}
                          className={`shrink-0 px-5 py-3 rounded-2xl font-black text-[11px] transition-all border ${active?'text-white border-transparent shadow-lg':'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          style={active?{backgroundColor:settings.primaryColor}:{}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Time slots */}
                {selectedDate && (()=>{
                  const slots=generateSlots(selectedDate);
                  return(
                    <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">اختر الوقت</p>
                      {slots.length===0&&<p className="text-slate-400 text-sm font-bold text-center py-6">لا توجد مواعيد متاحة في هذا اليوم</p>}
                      <div className="grid grid-cols-3 gap-2">
                        {slots.map(({label,val})=>{
                          const active=selectedSlot===val;
                          return(
                            <button key={val} type="button" onClick={()=>setSelectedSlot(val)}
                              className={`py-3 rounded-2xl font-black text-[11px] transition-all border ${active?'text-white border-transparent shadow-lg':'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                              style={active?{backgroundColor:settings.primaryColor}:{}}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {selectedDate && selectedSlot && (
                  <button onClick={()=>setBookingStep(3)}
                    className="w-full py-5 text-white font-black rounded-2xl text-sm shadow-xl active:scale-95 transition-all mt-2"
                    style={{backgroundColor:settings.primaryColor}}>
                    التالي ←
                  </button>
                )}
              </div>
            )}

            {/* STEP 3 — Customer info */}
            {bookingStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={()=>setBookingStep(2)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all">←</button>
                  <h2 className="text-xl font-black text-slate-900">بياناتك 👤</h2>
                </div>
                {/* Summary card */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100">
                  <div className="flex justify-between text-sm"><span className="font-bold text-slate-500">الخدمة</span><span className="font-black text-slate-900">{selectedService?.name}</span></div>
                  <div className="flex justify-between text-sm"><span className="font-bold text-slate-500">التاريخ</span><span className="font-black text-slate-900">{selectedDate}</span></div>
                  <div className="flex justify-between text-sm"><span className="font-bold text-slate-500">الوقت</span><span className="font-black text-slate-900">{fmtSlot(selectedSlot)}</span></div>
                  <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-1">
                    <span className="font-bold text-slate-500">السعر</span>
                    <span className="font-black text-lg" style={{color:settings.primaryColor}}>{(selectedService?.price||0).toLocaleString()} د.ع</span>
                  </div>
                </div>
                <input type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)}
                  className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-blue-400"
                  placeholder="الاسم الكامل" />
                <input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
                  className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-blue-400"
                  placeholder="رقم الهاتف" />
                {settings.bookingNote && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-right">
                    <p className="text-xs font-black text-amber-900">{settings.bookingNote}</p>
                  </div>
                )}
                {bookingError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-right">
                    <p className="text-sm font-black text-red-700">❌ {bookingError}</p>
                  </div>
                )}
                <button
                  disabled={!customerName||!customerPhone||bookingSubmitting}
                  onClick={bookAppointment}
                  className="w-full py-6 text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 disabled:grayscale transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{backgroundColor:settings.primaryColor}}>
                  {bookingSubmitting
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block"></span>جارٍ الحجز...</>
                    : 'تأكيد الحجز 💈'}
                </button>
              </div>
            )}
          </div>

          {/* CONFIRMATION POPUP */}
          {confirmedApptNum && (
            <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
              <div className="bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl animate-slide-up" dir="rtl">
                <div className="text-6xl mb-4">💈</div>
                <p className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">تم تأكيد موعدك</p>
                <p className="text-8xl font-black tracking-tighter leading-none mb-1" style={{color:settings.primaryColor}}>#{confirmedApptNum}</p>
                <p className="text-slate-400 text-xs font-bold mt-1 mb-8">احتفظ برقم موعدك</p>
                <button onClick={()=>setConfirmedApptNum(null)}
                  className="w-full py-4 text-white font-black rounded-2xl text-sm active:scale-95 transition-all"
                  style={{backgroundColor:settings.primaryColor}}>
                  حسناً 👍
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        .owner-panel { background: #f8fafc; min-height: 100vh; padding-bottom: 10rem; }
        .owner-panel [class*="bg-slate-900"] { background: #ffffff !important; }
        .owner-panel [class*="bg-black/40"], .owner-panel [class*="bg-black/30"], .owner-panel [class*="bg-black/50"] { background: #f1f5f9 !important; }
        .owner-panel input, .owner-panel textarea, .owner-panel select { background: #f8fafc !important; border-color: #cbd5e1 !important; color: #0f172a !important; }
        .owner-panel input::placeholder, .owner-panel textarea::placeholder { color: #94a3b8 !important; }
        .owner-panel [class*="text-white"]:not([class*="bg-"]):not(button):not(a):not(span[class*="bg-"]) { color: #1e293b !important; }
        .owner-panel [class*="text-white/30"] { color: #94a3b8 !important; }
        .owner-panel [class*="text-white/40"] { color: #64748b !important; }
        .owner-panel [class*="text-white/50"] { color: #475569 !important; }
        .owner-panel [class*="border-white/5"], .owner-panel [class*="border-white/10"] { border-color: #e2e8f0 !important; }
        .owner-panel [class*="bg-black/80"], .owner-panel [class*="bg-black/90"] { background: #1e293b !important; }
        .owner-panel h3[class*="text-orange"] { color: #ea580c !important; }
      `}} />
    </div>
  );
}