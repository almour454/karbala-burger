import React, { useState, useEffect, useMemo, useRef } from "react";
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
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "karbala-burger-app.firebaseapp.com",
  projectId: "karbala-burger-app",
  storageBucket: "karbala-burger-app.appspot.com", // note: should end with .appspot.com
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
    : process.env.REACT_APP_APP_ID || "karbala-burger-pro-v1";

const getMenuCollection = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
const getOwnerDoc = () => doc(db, 'artifacts', appId, 'private', 'data', 'admin', 'owner');
const getOrdersCollection = (dateStr) => collection(db, 'artifacts', appId, 'private', 'data', 'orders', dateStr, 'items');
const getOrderCounterDoc = (dateStr) => doc(db, 'artifacts', appId, 'public', 'data', 'counters', dateStr);

// ── DEMO MODE SEED DATA ──
const DEMO_SEED_SETTINGS = {
  restaurantName: "مطعمك هنا",  restaurantNameAr: "YOUR RESTAURANT",
  primaryColor: "#ea580c", bgColor: "#fdf8f4",
  whatsapp: "9647800000000", openingHours: "من ال 9 صباحاً الى ال 11 مساءً",
  locationDesc: "مدينتك — شارعك", facebookUrl: "", instagramUrl: "", tiktokUrl: "",
  dealsSectionTitle: "عروض نارية 🔥", checkoutNote: "يرجى التأكد من الاسم ورقم الهاتف قبل إرسال الطلب.",
  cartDeliveryNote: "رسوم التوصيل حسب المنطقة.", deliveryFee: 2000, orderMode: "both",
  contactPhone1: "9647800000000", contactPhone2: "", contactPhone3: "",
  autoGreyHours: 5, printCopies: 2, dayCloseHour: 0, logoUrl: "",
};
const DEMO_SEED_CATEGORIES = ["برجر", "دجاج", "مقبلات", "مشروبات", "حلويات"];
const DEMO_SEED_ITEMS = [
  // ── BURGERS ──
  { id:'di1',  name:"برجر كلاسيك",          desc:"لحم بقري طازج 180 جرام مع خس وطماطم وجبن أمريكي وصوص المطعم",                   price:12000,            category:"برجر",    image:"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=85" },
  { id:'di2',  name:"برجر دبل سموك",         desc:"قطعتان لحم مدخن مع جبن مزدوج وبصل مكرمل وصوص BBQ الحار",                       price:18000, salePrice:15000, category:"برجر",    image:"https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500&q=85" },
  { id:'di3',  name:"برجر مشروم وجبن",       desc:"لحم بقري مع فطر مشوي وجبن سويسري ذائب وصوص الثوم الكريمي",                    price:14000,            category:"برجر",    image:"https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500&q=85" },
  // ── CHICKEN ──
  { id:'di4',  name:"دجاج مقرمش بانكو",      desc:"فيليه دجاج بعجينة بانكو ذهبية مع مايونيز حار وخس طازج",                        price:11000,            category:"دجاج",    image:"https://images.unsplash.com/photo-1562967914-608f82629710?w=500&q=85" },
  { id:'di5',  name:"شاورما دجاج",           desc:"دجاج مشوي بالتوابل السرية مع صوص ثوم وطحينة وخيار مخلل",                       price:9000,             category:"دجاج",    image:"https://images.unsplash.com/photo-1633237308525-cd587cf71926?w=500&q=85" },
  { id:'di6',  name:"أصابع دجاج مقرمشة",    desc:"ستة أصابع دجاج مقرمشة مع صوص الرانش والكاتشاب الحار",                          price:8000, salePrice:7000, category:"دجاج",    image:"https://images.unsplash.com/photo-1698803431583-35ef29694754?w=500&q=85" },
  // ── SIDES ──
  { id:'di7',  name:"بطاطا مقلية كلاسيك",    desc:"بطاطا ذهبية مقرمشة بالملح البحري مع كاتشاب بيت",                               price:4000,             category:"مقبلات",  image:"https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500&q=85" },
  { id:'di8',  name:"حلقات بصل مقرمشة",     desc:"حلقات بصل حلو بعجينة خفيفة مقرمشة مع صوص الرانش",                              price:5000, salePrice:4000, category:"مقبلات",  image:"https://images.unsplash.com/photo-1639024471283-03518883512d?w=500&q=85" },
  // ── DRINKS ──
  { id:'di9',  name:"كوكاكولا مثلجة",        desc:"مشروب غازي بارد 330 مل مع ثلج كثير",                                            price:2000,             category:"مشروبات", image:"https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=500&q=85" },
  { id:'di10', name:"عصير برتقال طازج",       desc:"برتقال طازج معصور لحظياً 100٪ طبيعي بدون سكر مضاف",                            price:3500,             category:"مشروبات", image:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&q=85" },
  { id:'di11', name:"شيك شوكولا بلجيكي",     desc:"شيك كريمي بالشوكولا البلجيكية الداكنة مع كريمة مخفوقة وتشوكليت",              price:5500,             category:"مشروبات", image:"https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&q=85" },
  // ── DESSERTS ──
  { id:'di12', name:"تشيز كيك لوتس",         desc:"تشيز كيك كريمي بارد مع صوص لوتس وبسكويت مقرمش من الأسفل",                     price:6000,             category:"حلويات",  image:"https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=500&q=85" },
  { id:'di13', name:"كوكيز وكريم أيسكريم",   desc:"بسكويت شوكولا دافئ طازج مع كرة آيسكريم فانيلا وصوص كراميل",                   price:5000, salePrice:4500, category:"حلويات",  image:"https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=500&q=85" },
];
// getDateStr: returns the "business day" date string.
// If current hour is before closeHour (e.g. 12:30am and closeHour=1),
// it means we're still in the previous business day — return yesterday.
const getDateStr = (closeHour = 0) => {
  const now = new Date();
  if (closeHour > 0 && now.getHours() < closeHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA');
  }
  return now.toLocaleDateString('en-CA');
};

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
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("الكل");

  // Particle system refs
  const heroParticleRef = useRef(null);
  const particleRafRef  = useRef(null);

  // Demo mode — ref lets Firebase callbacks check without stale closure
  const isDemoModeRef = useRef(false);
  const [isDemoMode,   setIsDemoMode]   = useState(false);
  const [demoNewItem,  setDemoNewItem]  = useState({ name:'', desc:'', price:'', salePrice:'', category:'برجر', image:'' });
  
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["برجر", "مقبلات", "مشروبات"]);
  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    restaurantNameAr: "برجر كربلاء",
    primaryColor: "#ea580c", 
    bgColor: "#ffffff",
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "كربلاء - مركز المدينة",
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    checkoutNote: "يرجى التأكد من الاسم ورقم الهاتف قبل إرسال الطلب.",
    dealsSectionTitle: "عروض نارية 🔥",
    cartDeliveryNote: "رسوم التوصيل حسب المنطقة — لا تُضاف تلقائيًا للمجموع.",
    deliveryFee: 0,
    orderMode: "both",
    contactPhone1: "",
    contactPhone2: "",
    contactPhone3: "",
    autoGreyHours: 5,
    printCopies: 2,
    dayCloseHour: 0,
    logoUrl: ""
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [dataError, setDataError] = useState(null);

  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "برجر" });
  const [saveStatus, setSaveStatus] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [orders, setOrders] = useState([]);
  const [adminTab, setAdminTab] = useState(FEATURES.dashboard ? "orders" : "menu");
  const [historyDate, setHistoryDate] = useState("");
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmedOrderNum, setConfirmedOrderNum] = useState(null);
  const [orderError, setOrderError] = useState(null);   // null | "offline" | "failed"
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [menuFilter, setMenuFilter] = useState("الكل");
  const [ordersTab, setOrdersTab] = useState("active");
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(true);
  const [showMidnightWarning, setShowMidnightWarning] = useState(false);
  const [dayConfirmed, setDayConfirmed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [searchOrderNum, setSearchOrderNum] = useState("");
  const [resetUnlocked, setResetUnlocked] = useState(false);
  const [searchResult, setSearchResult] = useState(null); // null | "found" | "notfound"
  const [historySearchNum, setHistorySearchNum] = useState("");
  const [receiptModal,     setReceiptModal]     = useState(null);

  // today's date string "YYYY-MM-DD" in local time
  // todayStr respects dayCloseHour — if it's 12:30am and closeHour is 1,
  // we're still in yesterday's business day
  const todayStr = getDateStr(settings.dayCloseHour);

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

  useEffect(() => {
    if (!user) return;
    const unsubMenu = onSnapshot(
      getMenuCollection(),
      (snap) => {
        if (isDemoModeRef.current) return;
        setDataError(null);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMenuItems(data);
      },
      (err) => {
        console.error(err);
        setDataError("تعذر تحميل المنيو. تحقق من الإنترنت أو حاول لاحقًا.");
      }
    );

    const unsubSettings = onSnapshot(
      getSettingsDoc(),
      (snap) => {
        if (isDemoModeRef.current) return;
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.categories)) setCategories(data.categories);
          setSettings(prev => ({ ...prev, ...data }));
        }
        setSettingsLoaded(true);
      },
      (err) => {
        console.error(err);
        setDataError("تعذر تحميل الإعدادات. تحقق من الإنترنت أو حاول لاحقًا.");
      }
    );

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  // Orders listener — live feed for TODAY only
  useEffect(() => {
    if (!isUnlocked) { setOrders([]); return; }
    const q = query(getOrdersCollection(getDateStr(settings.dayCloseHour)), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q,
      (snap) => {
        const now = Date.now();
        const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setOrders(prev => {
          const prevIds = new Set(prev.map(o => o.id));
          const freshNew = incoming.filter(o => {
            if (prevIds.has(o.id)) return false;
            if (o.status !== "active") return false;
            if (!o.createdAt) return false;
            return (now - new Date(o.createdAt).getTime()) < 20000;
          });
          if (freshNew.length > 0) {
            if (FEATURES.soundAlert) {
              try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                [0, 0.18].forEach(t => {
                  const osc = ctx.createOscillator();
                  const g = ctx.createGain();
                  osc.connect(g); g.connect(ctx.destination);
                  osc.frequency.value = 880;
                  g.gain.setValueAtTime(0.5, ctx.currentTime + t);
                  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
                  osc.start(ctx.currentTime + t);
                  osc.stop(ctx.currentTime + t + 0.35);
                });
              } catch {}
            }
            if (autoPrintEnabled && FEATURES.printSlip) {
              freshNew.forEach(o => {
                const copies = Number(settings.printCopies) || 1;
                for (let i = 0; i < copies; i++) {
                  try { printOrderReceipt(o); } catch {}
                }
              });
            }
          }
          return incoming;
        });
      },
      (err) => console.error("Orders listener error:", err)
    );
    return () => unsub();
  }, [isUnlocked, autoPrintEnabled, settings.printCopies, settings.dayCloseHour, todayStr]);

  // Midnight warning popup
  useEffect(() => {
    if (!isUnlocked) return;
    const check = () => {
      const now = new Date();
      const h = now.getHours();
      const closeHour = Number(settings.dayCloseHour) || 0;
      if (h === closeHour && !dayConfirmed) setShowMidnightWarning(true);
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [isUnlocked, dayConfirmed, settings.dayCloseHour]);

  // ── FOOD PARTICLE PHYSICS SYSTEM ──
  useEffect(() => {
    if (!settingsLoaded || view !== 'customer') return;
    const container = heroParticleRef.current;
    if (!container) return;

    const FOOD_HTML = {
      burger:  `<svg viewBox="0 0 32 24" width="32" height="24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="21" rx="13" ry="3" fill="#C8854A"/><ellipse cx="16" cy="17" rx="12" ry="3" fill="#5C2E0A"/><path d="M3 14 Q7 11 11 14 Q14 11 16 14 Q20 11 24 14 Q27 11 29 14" fill="none" stroke="#5B8C3A" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="16" cy="10" rx="12" ry="5.5" fill="#E8A25C"/><ellipse cx="16" cy="8.5" rx="10" ry="4" fill="#D4894A"/><circle cx="12" cy="7" r="1.3" fill="#C8854A" opacity="0.7"/><circle cx="16.5" cy="6" r="1.3" fill="#C8854A" opacity="0.7"/><circle cx="21" cy="7" r="1.3" fill="#C8854A" opacity="0.7"/></svg>`,
      fries:   `<svg viewBox="0 0 20 26" width="20" height="26" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2" width="3.5" height="13" rx="1.75" fill="#FFD54F"/><rect x="6.5" y="0" width="3.5" height="15" rx="1.75" fill="#FFE082"/><rect x="11" y="1" width="3.5" height="13.5" rx="1.75" fill="#FFCA28"/><rect x="15.5" y="3" width="3" height="11" rx="1.5" fill="#FFD54F"/><path d="M0.5 14 L2.5 24.5 L17.5 24.5 L19.5 14 Z" fill="#E53935"/><path d="M0.5 14 L19.5 14" stroke="#C62828" stroke-width="1.2"/></svg>`,
      pizza:   `<svg viewBox="0 0 26 28" width="26" height="28" xmlns="http://www.w3.org/2000/svg"><path d="M13 2 L24 25 L2 25 Z" fill="#FFA726"/><path d="M2 25 Q13 29.5 24 25 L22 25 Q13 28 4 25 Z" fill="#D4956A"/><circle cx="13" cy="16" r="2.5" fill="#E53935"/><circle cx="8.5" cy="20" r="2" fill="#E53935"/><circle cx="17.5" cy="20" r="2" fill="#E53935"/><circle cx="11" cy="11" r="1.5" fill="#E53935"/><circle cx="16" cy="10" r="1.2" fill="#66BB6A" opacity="0.9"/></svg>`,
      chicken: `<svg viewBox="0 0 22 28" width="22" height="28" xmlns="http://www.w3.org/2000/svg"><ellipse cx="11" cy="9" rx="8" ry="7" fill="#C87A3E"/><ellipse cx="11" cy="9.5" rx="6.5" ry="5.5" fill="#E09B5A"/><path d="M8.5 13 Q9.5 12 11 12.5 Q12.5 12 13.5 13" fill="none" stroke="#A05C28" stroke-width="1.2" stroke-linecap="round"/><rect x="9" y="15" width="4" height="9" rx="2" fill="#F0E0C8"/><ellipse cx="11" cy="25" rx="4" ry="2.5" fill="#F0E0C8"/></svg>`,
      sandwich:`<svg viewBox="0 0 30 20" width="30" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 8 Q15 1.5 28.5 8 L28.5 10 Q15 3.5 1.5 10 Z" fill="#E8A25C"/><path d="M1.5 10 Q15 3.5 28.5 10 L28.5 11.5 Q15 5.5 1.5 11.5 Z" fill="#FFE082" opacity="0.8"/><rect x="1.5" y="11.5" width="27" height="2" fill="#5B8C3A"/><rect x="1.5" y="13" width="27" height="1.5" fill="#E53935"/><path d="M1.5 14.5 L1.5 17.5 Q15 19 28.5 17.5 L28.5 14.5 Q15 16.5 1.5 14.5 Z" fill="#D4956A"/></svg>`,
    };

    const TYPES = ['burger','fries','pizza','chicken','sandwich','burger','pizza','fries','chicken'];
    const NUM   = 9;

    const particles = TYPES.slice(0, NUM).map((type, i) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:0;will-change:transform;';
      el.innerHTML = FOOD_HTML[type];
      container.appendChild(el);
      const W = container.offsetWidth;
      const H = container.offsetHeight;
      const startInView = i < 4;
      return {
        el,
        x:    (W / NUM) * i + (W / NUM) * 0.3,
        y:    startInView ? H * 0.15 + Math.random() * H * 0.7 : H + 20 + Math.random() * 120,
        vx:   (Math.random() - 0.5) * 0.45,
        vy:   -(0.5 + Math.random() * 0.4),
        rot:  (Math.random() - 0.5) * 30,
        rotV: (Math.random() - 0.5) * 0.15,
        sc:   0.35 + Math.random() * 0.15,
      };
    });

    const tick = () => {
      const W = container.offsetWidth;
      const H = container.offsetHeight;

      particles.forEach(p => {
        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.rotV;

        // Soft wall drift — nudge back gently instead of hard bounce
        if (p.x < 0)  { p.vx += 0.05; }
        if (p.x > W)  { p.vx -= 0.05; }

        // Reset when particle exits top
        if (p.y < -60) {
          p.x    = Math.random() * W;
          p.y    = H + 15;
          p.vx   = (Math.random() - 0.5) * 0.45;
          p.vy   = -(0.5 + Math.random() * 0.4);
          p.rot  = (Math.random() - 0.5) * 30;
          p.rotV = (Math.random() - 0.5) * 0.15;
        }

        // Fade in at bottom, fade out near top
        const prog = 1 - p.y / H;
        const op = prog < 0.08  ? prog / 0.08 * 0.5
                 : prog > 0.82  ? (1 - prog) / 0.18 * 0.5
                 : 0.5;

        p.el.style.opacity   = Math.max(0, op).toFixed(3);
        p.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.rot.toFixed(1)}deg) scale(${p.sc})`;
      });

      particleRafRef.current = requestAnimationFrame(tick);
    };

    particleRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(particleRafRef.current);
      particles.forEach(p => p.el.parentNode?.removeChild(p.el));
    };
  }, [settingsLoaded, view]);

  // Auto-grey: move active orders older than autoGreyHours to finished
  useEffect(() => {
    if (!isUnlocked) return;
    const autoGrey = async () => {
      const hours = Number(settings.autoGreyHours) || 5;
      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const toFinish = orders.filter(o =>
        o.status === "active" &&
        o.createdAt &&
        new Date(o.createdAt).getTime() < cutoff
      );
      for (const o of toFinish) {
        try {
          const orderDate = o.dateStr
            || (o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-CA') : null)
            || getDateStr(settings.dayCloseHour);
          await updateDoc(
            doc(db, 'artifacts', appId, 'private', 'data', 'orders', orderDate, 'items', o.id),
            { status: "finished", finishedAt: new Date().toISOString() }
          );
        } catch (e) { console.error(e); }
      }
    };
    autoGrey();
    const interval = setInterval(autoGrey, 5 * 60 * 1000); // check every 5 min
    return () => clearInterval(interval);
  }, [isUnlocked, orders, settings.autoGreyHours]);

  // Auto-confirm: if owner opens panel after 6am and yesterday not confirmed
  // — fetches yesterday's orders, moves active ones to finished, saves real total
  useEffect(() => {
    if (!isUnlocked) return;
    const checkAutoConfirm = async () => {
      const now = new Date();
      if (now.getHours() < 6) return;
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yStr = yesterdayDate.toLocaleDateString('en-CA');
      try {
        // Always fetch yesterday's orders to check for stuck-active ones
        const q = query(getOrdersCollection(yStr), orderBy("createdAt", "desc"));
        const ordersSnap = await getDocs(q);
        const yesterdayOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const stuckActive = yesterdayOrders.filter(o => o.status === 'active');
        // Move any still-active ones to finished
        for (const o of stuckActive) {
          await updateDoc(
            doc(db, 'artifacts', appId, 'private', 'data', 'orders', yStr, 'items', o.id),
            { status: 'finished', finishedAt: new Date().toISOString() }
          );
        }
        // Always recalculate and save confirmed doc with correct total
        const allDone = yesterdayOrders.filter(o => o.status === 'finished' || o.status === 'active');
        const total = allDone.filter(o => !o.isGift).reduce((s, o) => s + (o.grandTotal || 0), 0);
        const confirmedDoc = doc(db, 'artifacts', appId, 'private', 'data', 'orders', yStr, 'meta', 'confirmed');
        const snap = await getDoc(confirmedDoc);
        // Only skip if already confirmed AND no stuck orders
        if (snap.exists() && stuckActive.length === 0) return;
        await setDoc(confirmedDoc, {
          confirmedAt: new Date().toISOString(),
          total,
          orderCount: allDone.length,
          autoConfirmed: true
        });
      } catch (e) { console.error(e); }
    };
    checkAutoConfirm();
  }, [isUnlocked]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!ownerEmail.trim() || !ownerPassword) return;
    setAuthError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, ownerEmail.trim(), ownerPassword);
      const ownerRef = getOwnerDoc();
      const ownerSnap = await getDoc(ownerRef);
      if (!ownerSnap.exists()) {
        await setDoc(ownerRef, {
          uid: cred.user.uid,
          email: cred.user.email || ownerEmail.trim(),
          createdAt: new Date().toISOString()
        }, { merge: true });
      } else if (ownerSnap.data().uid !== cred.user.uid) {
        await signOut(auth);
        await signInAnonymously(auth);
        setAuthError("هذا الحساب ليس مالك النظام.");
        setIsUnlocked(false);
        return;
      }
      setIsUnlocked(true);
      setOwnerPassword("");
    } catch (err) {
      setAuthError("فشل تسجيل الدخول. تحقق من الإيميل وكلمة المرور.");
    }
  };

  const handleOwnerLogout = async () => {
    setIsUnlocked(false);
    setOwnerPassword("");
    try {
      await signOut(auth);
      await signInAnonymously(auth);
    } catch (e) {
      console.error(e);
    }
    navigateTo("customer");
  };

  const updateGlobalSettings = async (field, value) => {
    if (!user) return;
    if (isDemoMode) { setSettings(prev => ({ ...prev, [field]: value })); return; }
    await setDoc(getSettingsDoc(), { [field]: value }, { merge: true });
  };

  const handleAddItem = async () => {
    const src = isDemoMode ? demoNewItem : newItem;
    if (!src.name || !src.price) return;
    const id = src.id || (isDemoMode ? 'di_' : 'item_') + Date.now();
    const item = { ...src, id, price: Number(src.price)||0, salePrice: src.salePrice ? Number(src.salePrice) : null, createdAt: new Date().toISOString() };
    if (isDemoMode) {
      setMenuItems(prev => { const ex = prev.findIndex(i => i.id === id); return ex >= 0 ? prev.map(i => i.id===id ? item : i) : [...prev, item]; });
      setDemoNewItem({ name:'', desc:'', price:'', salePrice:'', category: src.category, image:'' });
      setSaveStatus("تم الحفظ ✅"); setTimeout(() => setSaveStatus(""), 2500);
      return;
    }
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), item);
      setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: newItem.category });
      setSaveStatus("تم الحفظ بنجاح! ✅");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e) { setSaveStatus("خطأ في الحفظ ❌"); }
  };

  const handleDeleteItem = async (id) => {
    if (isDemoMode) { setMenuItems(prev => prev.filter(i => i.id !== id)); return; }
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const updated = [...categories, trimmed];
    setCategories(updated);
    setNewCategoryInput("");
    if (isDemoMode) return;
    await setDoc(getSettingsDoc(), { categories: updated }, { merge: true });
  };

  const handleRemoveCategory = async (cat) => {
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    if (isDemoMode) return;
    await setDoc(getSettingsDoc(), { categories: updated }, { merge: true });
  };

  const handleToggleVisibility = async (item) => {
    const hidden = !item.hidden;
    if (isDemoMode) { setMenuItems(prev => prev.map(i => i.id===item.id ? {...i, hidden} : i)); return; }
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { hidden }, { merge: true });
  };

  // ── DEMO LOGIN ──
  const handleDemoLogin = () => {
    isDemoModeRef.current = true;
    setIsDemoMode(true);
    setSettings({ ...DEMO_SEED_SETTINGS });
    setMenuItems([...DEMO_SEED_ITEMS]);
    setCategories([...DEMO_SEED_CATEGORIES]);
    setSettingsLoaded(true);
    setIsUnlocked(true);
    setAdminTab('menu');
    navigateTo('owner');
  };

  const handleExitDemo = () => {
    isDemoModeRef.current = false;
    setIsDemoMode(false);
    setIsUnlocked(false);
    navigateTo('customer');
  };

  // ── SEED REAL FIREBASE MENU ──
  const handleSeedRealMenu = async () => {
    if (!user || isDemoMode) return;
    if (!window.confirm('سيتم إضافة ' + DEMO_SEED_ITEMS.length + ' وجبات نموذجية بصور عالية الجودة إلى منيوك.\n\nالعناصر الحالية لن تُحذف — ستُضاف الجديدة فقط.\n\nهل تريد المتابعة؟')) return;
    setSaveStatus('⏳ جارٍ تحميل القائمة...');
    try {
      for (const item of DEMO_SEED_ITEMS) {
        const id = 'seed_' + Date.now() + '_' + item.id;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {
          name: item.name, desc: item.desc, price: item.price,
          ...(item.salePrice ? { salePrice: item.salePrice } : {}),
          category: item.category, image: item.image,
          id, createdAt: new Date().toISOString(),
        });
      }
      const merged = [...new Set([...categories, ...DEMO_SEED_CATEGORIES])];
      await setDoc(getSettingsDoc(), { categories: merged }, { merge: true });
      setCategories(merged);
      setSaveStatus('✅ تم تحميل ' + DEMO_SEED_ITEMS.length + ' وجبة بنجاح!');
      setTimeout(() => setSaveStatus(''), 4000);
    } catch (e) {
      setSaveStatus('❌ خطأ في التحميل');
      console.error(e);
    }
  };

  const addToCart = (item) => setCart(p => ({ ...p, [item.id]: (p[item.id] || 0) + 1 }));
  const removeFromCart = (id) => setCart(p => {
    const n = { ...p };
    if (n[id] > 1) n[id]--; else delete n[id];
    return n;
  });

  const removeCartLine = (id) => setCart(p => {
    const n = { ...p };
    delete n[id];
    return n;
  });

  const clearCart = () => {
    setCart({});
    setIsCheckoutOpen(false);
  };

  const cartTotal = useMemo(() => Object.entries(cart).reduce((t, [id, q]) => {
    const item = menuItems.find(m => m.id === id);
    return item ? t + ((item.salePrice || item.price) * q) : t;
  }, 0), [cart, menuItems]);

  const deliveryFee = Math.max(0, Number(settings.deliveryFee) || 0);
  const orderGrandTotal = cartTotal + deliveryFee;

  const filteredItems = useMemo(() => {
    const visible = menuItems.filter(item => !item.hidden);
    if (activeCategory === "الكل") return visible;
    return visible.filter(item => item.category === activeCategory);
  }, [menuItems, activeCategory]);

  const discountItems = useMemo(() => {
    return menuItems.filter(item => !item.hidden && item.salePrice && item.salePrice < item.price);
  }, [menuItems]);

  useEffect(() => {
    if (isCheckoutOpen && Object.keys(cart).length === 0) {
      setIsCheckoutOpen(false);
    }
  }, [cart, isCheckoutOpen]);

  const updateOrderStatus = async (orderId, status, dateStr) => {
    try {
      const d = dateStr || getDateStr(settings.dayCloseHour);
      await updateDoc(doc(db, 'artifacts', appId, 'private', 'data', 'orders', d, 'items', orderId), { status });
    } catch (e) { console.error(e); }
  };

  const saveOrderToFirebase = async () => {
    const d = getDateStr(settings.dayCloseHour);
    const counterRef = getOrderCounterDoc(d);
    const ordersCol = getOrdersCollection(d);

    // Atomically increment counter — counter lives in public/ so anonymous users can read+write
    let orderNumber = 1;
    await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      orderNumber = counterSnap.exists() ? (counterSnap.data().count || 0) + 1 : 1;
      tx.set(counterRef, { count: orderNumber }, { merge: true });
    });

    await addDoc(ordersCol, {
      orderNumber,
      customerName,
      customerPhone,
      address,
      items: Object.entries(cart).map(([id, qty]) => {
        const it = menuItems.find(m => m.id === id);
        return { id, name: it?.name || id, qty, price: it?.salePrice || it?.price || 0 };
      }),
      cartTotal,
      deliveryFee,
      grandTotal: orderGrandTotal,
      status: "active",
      createdAt: new Date().toISOString(),
      dateStr: d
    });

    return orderNumber;
  };

  const loadHistoryOrders = async (dateStr) => {
    setHistoryLoading(true);
    setHistoryOrders([]);
    try {
      const q = query(getOrdersCollection(dateStr), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setHistoryOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setHistoryOrders([]);
    }
    setHistoryLoading(false);
  };

  const clearAfterOrder = (orderNum) => {
    setCart({});
    setIsCheckoutOpen(false);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
    setOrderSubmitting(false);
    if (orderNum) setConfirmedOrderNum(orderNum);
  };

  // Returns false and sets error if offline
  // navigator.onLine is unreliable on mobile/cellular — removed.
  // Firebase itself will throw if there's truly no connection.
  const checkOnline = () => true;

  const sendWhatsApp = async () => {
    if (!checkOnline()) return;
    setOrderSubmitting(true);
    setOrderError(null);
    const itemsStr = Object.entries(cart).map(([id, q]) => {
      const it = menuItems.find(m=>m.id===id);
      return `${q}x ${it?.name}`;
    }).join('\n');
    const feeLine = deliveryFee > 0
      ? `\nمجموع الأصناف: ${cartTotal.toLocaleString()} د.ع\nرسوم التوصيل: ${deliveryFee.toLocaleString()} د.ع\nالإجمالي: ${orderGrandTotal.toLocaleString()} د.ع`
      : `\nالمجموع: ${cartTotal.toLocaleString()} د.ع`;
    let orderNum = null;
    try {
      orderNum = await saveOrderToFirebase();
    } catch (e) {
      console.error(e);
      setOrderError("failed");
      setOrderSubmitting(false);
      return;
    }
    const numLine = orderNum ? `\nرقم الطلب: #${orderNum}\n` : '';
    const text = `طلب جديد 🍔${numLine}\nالاسم: ${customerName}\nالهاتف: ${customerPhone}\nالعنوان: ${address}\n\nالأصناف:\n${itemsStr}${feeLine}`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
    clearAfterOrder(orderNum);
  };

  const sendDashboardOnly = async () => {
    if (!checkOnline()) return;
    setOrderSubmitting(true);
    setOrderError(null);
    try {
      const orderNum = await saveOrderToFirebase();
      clearAfterOrder(orderNum);
    } catch (e) {
      console.error(e);
      setOrderError("failed");
      setOrderSubmitting(false);
    }
  };

  const buildReceiptHtml = (order) => {
    // Sanitize user-supplied strings before injecting into HTML
    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const time = order.createdAt
      ? new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
      : '';
    const rows = (order.items || [])
      .map(it => `<div class="row"><span>${esc(it.name)}</span><span>x${it.qty} ${((it.price||0)*it.qty).toLocaleString()}</span></div>`)
      .join('');
    const deliveryRow = order.deliveryFee > 0
      ? `<div class="row"><span>توصيل</span><span>${order.deliveryFee.toLocaleString()}</span></div>`
      : '';
    return `<html><head><meta charset="utf-8"/>
      <style>
        @page { size: 58mm auto; margin: 2mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; direction: rtl;
               font-size: 11px; width: 54mm; margin: 0; padding: 0; }
        h1 { font-size: 13px; font-weight: 900; text-align: center; margin: 0 0 1mm; }
        .num { font-size: 28px; font-weight: 900; text-align: center;
               line-height: 1; margin: 2mm 0; letter-spacing: -1px; }
        .center { text-align: center; }
        .meta { font-size: 9px; color: #444; margin: 0.5mm 0; }
        .row { display: flex; justify-content: space-between;
               padding: 1mm 0; border-bottom: 1px dotted #999; font-size: 10px; }
        .total { display: flex; justify-content: space-between;
                 font-weight: 900; font-size: 12px; margin-top: 2mm; }
        hr { border: none; border-top: 1px dashed #333; margin: 2mm 0; }
        .thanks { text-align: center; font-size: 9px; margin-top: 3mm; }
        @media print {
          body { width: 54mm; }
          html { width: 58mm; }
        }
      </style></head><body>
      <h1>${settings.restaurantName}</h1>
      <div class="meta center">${settings.restaurantNameAr}</div>
      <hr/>
      <div class="meta center">${order.dateStr || getDateStr(settings.dayCloseHour)} — ${time}</div>
      <div class="num">#${order.orderNumber || '—'}</div>
      <hr/>
      <div class="meta"><b>${esc(order.customerName)}</b> — ${esc(order.customerPhone)}</div>
      <div class="meta">📍 ${esc(order.address)}</div>
      <hr/>
      ${rows}${deliveryRow}
      <div class="total"><span>الإجمالي</span><span>${(order.grandTotal||0).toLocaleString()} د.ع</span></div>
      <hr/>
      <div class="thanks">شكراً لطلبك 🍔</div>
      <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>`;
  };

  const printOrderReceipt = (order) => {
    // On touch/mobile devices → show beautiful receipt modal instead of print dialog
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      setReceiptModal(order);
      return;
    }
    const win = window.open('', '_blank', 'width=240,height=400');
    if (!win) return;
    win.document.write(buildReceiptHtml(order));
    win.document.close();
  };

  const handleDeleteOrder = async (order, dateStr) => {
    const d = dateStr || getDateStr(settings.dayCloseHour);
    if (window.confirm(`⚠️ حذف الطلب #${order.orderNumber} للزبون ${order.customerName} نهائياً؟\n\nلا يمكن التراجع.`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'private', 'data', 'orders', d, 'items', order.id));
      } catch (e) { console.error(e); }
    }
  };

  const handleGiftOrder = async (order) => {
    const originalTotal = order.grandTotal || 0;
    if (!window.confirm(
      `🎁 تحويل الطلب #${order.orderNumber} هدية مجانية؟\n\n` +
      `الزبون: ${order.customerName}\n` +
      `المبلغ الأصلي: ${originalTotal.toLocaleString()} د.ع\n\n` +
      `سيتحول المبلغ إلى صفر ولن يُحسب في المبيعات.\n` +
      `لا يمكن التراجع — تأكد قبل الضغط.`
    )) return;
    try {
      await updateDoc(
        doc(db, 'artifacts', appId, 'private', 'data', 'orders', getDateStr(settings.dayCloseHour), 'items', order.id),
        { isGift: true, grandTotal: 0, cartTotal: 0, originalTotal, giftedAt: new Date().toISOString() }
      );
    } catch (e) { console.error(e); }
  };

  const handleConfirmDay = async () => {
    if (!window.confirm('تأكيد إنهاء اليوم؟\nسيتم نقل جميع الطلبات النشطة إلى منجزة وحفظ المبيعات.')) return;
    const d = getDateStr(settings.dayCloseHour);
    // Move all still-active orders to finished first
    const activeNow = orders.filter(o => o.status === 'active');
    for (const o of activeNow) {
      try {
        await updateDoc(
          doc(db, 'artifacts', appId, 'private', 'data', 'orders', d, 'items', o.id),
          { status: 'finished', finishedAt: new Date().toISOString() }
        );
      } catch (e) { console.error(e); }
    }
    // Save confirmed summary — exclude gift orders from total
    const allToday = orders.filter(o => o.status === 'finished' || o.status === 'active');
    const total = allToday.filter(o => !o.isGift).reduce((s, o) => s + (o.grandTotal || 0), 0);
    try {
      await setDoc(
        doc(db, 'artifacts', appId, 'private', 'data', 'orders', d, 'meta', 'confirmed'),
        { confirmedAt: new Date().toISOString(), total, orderCount: allToday.length, autoConfirmed: false }
      );
      setDayConfirmed(true);
      setShowMidnightWarning(false);
    } catch (e) { console.error(e); }
  };

  // Search today's orders by order number
  const handleSearchToday = (numStr) => {
    const num = parseInt(numStr, 10);
    if (!num) { setSearchResult(null); return; }
    const found = orders.find(o => o.orderNumber === num);
    setSearchResult(found ? { ...found, _dateStr: todayStr } : "notfound");
  };

  // Delete from history
  const handleHistoryDelete = async (order, dateStr) => {
    if (window.confirm(`⚠️ حذف الطلب #${order.orderNumber} للزبون ${order.customerName} من سجل ${dateStr}؟\n\nلا يمكن التراجع.`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'private', 'data', 'orders', dateStr, 'items', order.id));
        setHistoryOrders(prev => prev.filter(o => o.id !== order.id));
      } catch (e) { console.error(e); }
    }
  };

  // Split orders into tabs
  const activeOrders   = orders.filter(o => o.status === 'active');
  const finishedOrders = orders.filter(o => o.status === 'finished');
  const finishedTotal  = finishedOrders.filter(o => !o.isGift).reduce((s, o) => s + (o.grandTotal || 0), 0);
  const allDayTotal    = orders.filter(o => !o.isGift).reduce((s, o) => s + (o.grandTotal || 0), 0);
  const giftOrders     = finishedOrders.filter(o => o.isGift);
  const giftTotal      = giftOrders.reduce((s, o) => s + (o.originalTotal || 0), 0);

  return (
    <div className="min-h-screen transition-colors duration-500" style={{ backgroundColor: settings.bgColor, fontFamily: 'sans-serif' }}>

      {/* ── TOP TICKER ── */}
      {view === "customer" && settingsLoaded && (
        <div style={{ background: settings.primaryColor, overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', animation: 'tickerScroll 5s linear infinite', whiteSpace: 'nowrap', padding: '9px 0' }}>
            {[...Array(4)].map((_, ri) => (
              <span key={ri} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                {[
                  `🍔 ${settings.restaurantNameAr || settings.restaurantName}`,
                  `🕐 ${settings.openingHours || ''}`,
                  `📍 ${settings.locationDesc || ''}`,
                  ...discountItems.slice(0, 3).map(i => `🔥 عرض: ${i.name} — ${(i.salePrice||0).toLocaleString()} د.ع`),
                  `📱 اطلب الآن عبر الواتساب`,
                ].filter(t => t.trim().length > 3).map((text, ti) => (
                  <span key={ti} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '11px', fontWeight: '800', padding: '0 18px', letterSpacing: '0.3px' }}>{text}</span>
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px' }}>◆</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}

      {dataError && (
        <div className="px-4 pb-2 max-w-xl mx-auto" dir="rtl">
          <div className="bg-red-500/15 border border-red-500/35 text-red-900 rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold text-center">
            {dataError}
          </div>
        </div>
      )}

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-6">
            <form onSubmit={handleAuthSubmit} className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center shadow-2xl scale-in">
              <div className="text-5xl mb-6">👨‍🍳</div>
              <h2 className="text-white text-2xl font-black italic uppercase mb-6">دخول الإدارة المرئية</h2>
              <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className={`w-full bg-black border ${authError ? 'border-red-500' : 'border-white/10'} p-4 rounded-2xl text-white text-right outline-none focus:border-orange-500 text-sm font-bold mb-3`} placeholder="Owner Email" />
              <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} className={`w-full bg-black border ${authError ? 'border-red-500 animate-shake' : 'border-white/10'} p-4 rounded-2xl text-white text-right outline-none focus:border-orange-500 text-sm font-bold`} placeholder="كلمة المرور" />
              {authError && <p className="mt-3 text-red-400 text-xs font-bold">{authError}</p>}
              <button type="submit" className="w-full mt-6 py-5 text-white font-black rounded-2xl text-[12px] uppercase tracking-widest shadow-xl transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}>دخول</button>
            </form>
          </div>
        ) : (
          <div className="owner-panel max-w-4xl mx-auto p-6 pb-40 space-y-6" dir="rtl">

            {/* ── DEMO MODE PANEL ── */}
            {isDemoMode ? (
            <div className="space-y-6">

              {/* Demo banner */}
              <div className="rounded-[2rem] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                style={{ background: `linear-gradient(135deg, ${settings.primaryColor}22, ${settings.primaryColor}08)`, border: `1.5px solid ${settings.primaryColor}40` }}>
                <div>
                  <p className="font-black text-base" style={{ color: settings.primaryColor }}>🎮 وضع العرض التجريبي</p>
                  <p className="text-slate-500 text-[11px] font-bold mt-0.5">التغييرات محلية فقط — لا تُحفظ في قاعدة البيانات</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setSettings({...DEMO_SEED_SETTINGS}); setMenuItems([...DEMO_SEED_ITEMS]); setCategories([...DEMO_SEED_CATEGORIES]); }}
                    className="px-4 py-2 rounded-xl text-[11px] font-black bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-all">
                    🔄 إعادة تعيين
                  </button>
                  <button onClick={handleExitDemo}
                    className="px-4 py-2 rounded-xl text-[11px] font-black text-white active:scale-95 transition-all"
                    style={{ backgroundColor: settings.primaryColor }}>
                    ← عرض المنيو
                  </button>
                </div>
              </div>

              {/* BRANDING — the wow section */}
              <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl space-y-5">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">🎨 هوية المطعم — غيّر وشاهد النتيجة فوراً</h3>

                {/* Color + name side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-black/40 border border-white/5 p-4 rounded-xl space-y-2">
                    <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">اللون الرئيسي</p>
                    <div className="flex items-center gap-3">
                      <input type="color" className="w-12 h-12 rounded-xl border-0 cursor-pointer bg-transparent"
                        value={settings.primaryColor}
                        onChange={e => updateGlobalSettings('primaryColor', e.target.value)} />
                      <div>
                        <p className="text-white font-black text-sm">{settings.primaryColor}</p>
                        <p className="text-white/30 text-[9px] font-bold">يتغير المنيو مباشرةً</p>
                      </div>
                    </div>
                    {/* Quick color presets */}
                    <div className="flex gap-2 flex-wrap pt-1">
                      {['#ea580c','#dc2626','#16a34a','#2563eb','#7c3aed','#db2777','#0891b2','#ca8a04'].map(c => (
                        <button key={c} onClick={() => updateGlobalSettings('primaryColor', c)}
                          className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95"
                          style={{ backgroundColor: c, borderColor: settings.primaryColor === c ? 'white' : 'transparent' }} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-black/40 border border-white/5 p-4 rounded-xl space-y-3">
                    <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">اسم المطعم</p>
                    <input className="w-full bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm font-bold outline-none focus:border-orange-500"
                      placeholder="اسم المطعم EN"
                      value={settings.restaurantName}
                      onChange={e => updateGlobalSettings('restaurantName', e.target.value)} />
                    <input className="w-full bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm font-bold outline-none focus:border-orange-500"
                      placeholder="اسم المطعم بالعربي"
                      value={settings.restaurantNameAr}
                      onChange={e => updateGlobalSettings('restaurantNameAr', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                    placeholder="ساعات العمل" value={settings.openingHours}
                    onChange={e => updateGlobalSettings('openingHours', e.target.value)} />
                  <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                    placeholder="الموقع / العنوان" value={settings.locationDesc}
                    onChange={e => updateGlobalSettings('locationDesc', e.target.value)} />
                  <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm sm:col-span-2"
                    placeholder="رابط اللوغو (URL)" value={settings.logoUrl || ''}
                    onChange={e => updateGlobalSettings('logoUrl', e.target.value)} />
                </div>
              </section>

              {/* MENU MANAGEMENT */}
              <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl space-y-5">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">🍔 إدارة الوجبات</h3>

                {/* Quick add form */}
                <div className="bg-black/40 rounded-2xl p-5 border border-white/5 space-y-3">
                  <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">إضافة وجبة جديدة</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="col-span-2 bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm font-bold outline-none focus:border-orange-500"
                      placeholder="اسم الوجبة *" value={demoNewItem.name}
                      onChange={e => setDemoNewItem(p=>({...p, name:e.target.value}))} />
                    <input className="bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm outline-none focus:border-orange-500"
                      placeholder="السعر د.ع *" type="number" value={demoNewItem.price}
                      onChange={e => setDemoNewItem(p=>({...p, price:e.target.value}))} />
                    <input className="bg-black/50 border border-white/10 p-3 rounded-xl text-orange-400 text-sm outline-none focus:border-orange-500"
                      placeholder="سعر الخصم" type="number" value={demoNewItem.salePrice}
                      onChange={e => setDemoNewItem(p=>({...p, salePrice:e.target.value}))} />
                    <select className="col-span-2 bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm outline-none"
                      value={demoNewItem.category}
                      onChange={e => setDemoNewItem(p=>({...p, category:e.target.value}))}>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="col-span-2 bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm outline-none focus:border-orange-500"
                      placeholder="رابط صورة الوجبة (URL)" value={demoNewItem.image}
                      onChange={e => setDemoNewItem(p=>({...p, image:e.target.value}))} />
                  </div>
                  <button onClick={handleAddItem}
                    className="w-full py-4 rounded-2xl text-white font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                    style={{ backgroundColor: settings.primaryColor }}>
                    إضافة للمنيو +
                  </button>
                  {saveStatus && <p className="text-center text-xs font-bold text-green-400">{saveStatus}</p>}
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {menuItems.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 bg-black/40 rounded-2xl p-3 border border-white/5 ${item.hidden ? 'opacity-40' : ''}`}>
                      {item.image && <img src={item.image} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0" onError={e=>e.target.style.display='none'} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-sm truncate">{item.name}</p>
                        <p className="text-white/40 text-[10px] font-bold">{(item.salePrice || item.price || 0).toLocaleString()} د.ع — {item.category}</p>
                      </div>
                      <button onClick={() => handleToggleVisibility(item)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black shrink-0 transition-all ${item.hidden ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                        {item.hidden ? '🙈 مخفي' : '👁 ظاهر'}
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)}
                        className="w-8 h-8 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-black transition-all flex items-center justify-center shrink-0">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </section>

            </div>
            ) : (
            <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex bg-black/80 backdrop-blur-md p-1 rounded-2xl gap-1 flex-wrap">
                {FEATURES.dashboard && (
                <button onClick={() => setAdminTab("orders")}
                  className={`relative px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center gap-2 ${adminTab === 'orders' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                  style={adminTab === 'orders' ? { backgroundColor: settings.primaryColor } : {}}>
                  اليوم
                  {orders.filter(o => o.status === 'pending').length > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse shrink-0">
                      {orders.filter(o => o.status === 'pending').length}
                    </span>
                  )}
                </button>
                )}
                {FEATURES.history && (
                <button onClick={() => { setAdminTab("history"); setHistoryDate(""); setHistoryOrders([]); }}
                  className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${adminTab === 'history' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                  السجل 📅
                </button>
                )}
                <button onClick={() => setAdminTab("menu")}
                  className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${adminTab === 'menu' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                  الإدارة
                </button>
              </div>
              <button type="button" onClick={handleOwnerLogout}
                className="bg-black text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-white hover:text-black border border-white/20 transition-colors shrink-0">
                خروج
              </button>
              <button type="button" onClick={() => navigateTo('customer')}
                className="text-white/50 hover:text-white px-4 py-2 rounded-xl text-[11px] font-black border border-white/10 hover:border-white/25 transition-colors shrink-0">
                ← المنيو
              </button>
            </div>

            {/* ── ORDERS TAB ── */}
            {FEATURES.dashboard && adminTab === "orders" && (
              <>
              <div className="space-y-4">

                {/* 🔍 SEARCH BY ORDER NUMBER */}
                <div className="bg-slate-900 rounded-[2rem] p-5 border border-white/5">
                  <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-3">بحث برقم الطلب 🔍</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="أدخل رقم الطلب..."
                      value={searchOrderNum}
                      onChange={e => {
                        setSearchOrderNum(e.target.value);
                        setSearchResult(null);
                      }}
                      className="flex-1 bg-black/50 border border-white/10 p-4 rounded-xl text-white text-sm font-bold outline-none focus:border-orange-500 text-right"
                      dir="rtl"
                    />
                    <button
                      onClick={() => handleSearchToday(searchOrderNum)}
                      className="px-5 py-4 rounded-xl text-white font-black text-xs uppercase tracking-wide transition-all active:scale-95"
                      style={{ backgroundColor: settings.primaryColor }}>
                      بحث
                    </button>
                    {(searchOrderNum || searchResult) && (
                      <button onClick={() => { setSearchOrderNum(""); setSearchResult(null); }}
                        className="px-4 rounded-xl bg-white/5 text-white/40 hover:text-white font-black text-sm transition-all">
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Search result */}
                  {searchResult === "notfound" && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
                      <p className="text-red-400 font-black text-sm">لم يُعثر على طلب بهذا الرقم في اليوم الحالي</p>
                      <p className="text-white/30 text-[10px] font-bold mt-1">جرّب البحث في سجل الأيام السابقة</p>
                    </div>
                  )}

                  {searchResult && searchResult !== "notfound" && (
                    <div className="mt-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: settings.primaryColor }}>
                              طلب #{searchResult.orderNumber}
                            </span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${searchResult.status === 'active' ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'}`}>
                              {searchResult.status === 'active' ? 'نشط 🔔' : 'منجز ✓'}
                            </span>
                          </div>
                          <p className="text-white font-black">{searchResult.customerName}</p>
                          <p className="text-white/50 text-[11px] font-bold" dir="ltr">{searchResult.customerPhone}</p>
                          <p className="text-white/40 text-[10px] font-bold mt-1">📍 {searchResult.address}</p>
                        </div>
                        <p className="font-black text-xl shrink-0" style={{ color: settings.primaryColor }}>
                          {(searchResult.grandTotal || 0).toLocaleString()} <span className="text-[10px]">د.ع</span>
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-xl p-3 mb-3 space-y-1">
                        {(searchResult.items || []).map((it, i) => (
                          <div key={i} className="flex justify-between text-[11px]">
                            <span className="text-white/70 font-bold">{it.name}</span>
                            <span className="text-white/40 font-black">×{it.qty}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleDeleteOrder(searchResult, searchResult._dateStr).then(() => { setSearchOrderNum(""); setSearchResult(null); })}
                        className="w-full py-3 rounded-2xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-black text-sm transition-all active:scale-95">
                        🗑️ حذف هذا الطلب
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                    <p className="font-black text-lg leading-tight text-white">{orders.length}</p>
                    <p className="text-white/30 text-[9px] font-bold mt-1">إجمالي الطلبات</p>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                    <p className="font-black text-lg leading-tight text-yellow-400">{activeOrders.length}</p>
                    <p className="text-white/30 text-[9px] font-bold mt-1">نشطة الآن</p>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                    <p className="font-black text-base leading-tight text-green-400">{allDayTotal.toLocaleString()} <span className="text-[9px]">د.ع</span></p>
                    <p className="text-white/30 text-[9px] font-bold mt-1">مبيعات اليوم</p>
                  </div>
                </div>
                {giftOrders.length > 0 && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <span className="text-purple-300 text-[11px] font-black flex items-center gap-2">🎁 هدايا اليوم: {giftOrders.length} طلب</span>
                    <span className="text-purple-400 font-black text-[11px]">{giftTotal.toLocaleString()} د.ع</span>
                  </div>
                )}

                {/* Active / Finished sub-tabs */}
                <div className="flex gap-2">
                  <button onClick={() => setOrdersTab("active")}
                    className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${ordersTab === 'active' ? 'text-white shadow-lg' : 'bg-slate-800 text-slate-400'}`}
                    style={ordersTab === 'active' ? { backgroundColor: settings.primaryColor } : {}}>
                    طلبات نشطة
                    {activeOrders.length > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                        {activeOrders.length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setOrdersTab("finished")}
                    className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wide transition-all ${ordersTab === 'finished' ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400'}`}>
                    منجزة ✓ ({finishedOrders.length})
                  </button>
                </div>

                {/* Confirm Day button */}
                <button onClick={handleConfirmDay}
                  className="w-full py-3 rounded-2xl text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all bg-green-600/80 hover:bg-green-600">
                  تأكيد اليوم وحساب المبيعات ✅
                </button>

                {/* Report button — lights up when finished orders exist */}
                <div className="flex gap-2">
                  <button onClick={() => setShowReport(r => !r)}
                    disabled={!finishedOrders.length}
                    className={`flex-1 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 border ${finishedOrders.length ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30' : 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'}`}>
                    📊 {showReport ? 'إخفاء التقرير' : 'تقرير اليوم'}
                  </button>
                  {finishedOrders.length > 0 && (
                    <button onClick={() => {
                      const fmt = h => { const hh = (+h%12)||12; return `${hh}:00 ${+h<12?'ص':'م'}`; };
                      const iC = {}; finishedOrders.forEach(o=>(o.items||[]).forEach(it=>{iC[it.name]=(iC[it.name]||0)+(it.qty||1);}));
                      const top = Object.entries(iC).sort((a,b)=>b[1]-a[1]).slice(0,5);
                      const hC = {}; finishedOrders.forEach(o=>{if(!o.createdAt)return;const h=new Date(o.createdAt).getHours();hC[h]=(hC[h]||0)+1;});
                      const peak = Object.entries(hC).sort((a,b)=>b[1]-a[1])[0];
                      const avg = Math.round(finishedTotal/finishedOrders.length);
                      const now = new Date().toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'});
                      const win = window.open('','_blank','width=240,height=500');
                      win.document.write(`<html><head><meta charset="utf-8"/><style>@page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{font-family:"Courier New",monospace;direction:rtl;font-size:10px;width:54mm;margin:0;padding:0}h2{font-size:12px;font-weight:900;text-align:center;margin:0 0 1mm}.sub{text-align:center;font-size:8px;color:#444;margin-bottom:1mm}hr{border:none;border-top:1px dashed #333;margin:2mm 0}.row{display:flex;justify-content:space-between;padding:1mm 0;font-size:9px}.big{font-size:18px;font-weight:900;text-align:center;margin:2mm 0}.label{font-size:8px;color:#555;text-align:center}.sign{border-bottom:1px solid #333;margin-top:1mm;height:6mm}@media print{body{width:54mm}html{width:58mm}}</style></head><body>
                        <h2>تقرير المبيعات اليومي</h2><div class="sub">${settings.restaurantName} — ${todayStr} — ${now}</div><hr/>
                        <div class="big">${finishedTotal.toLocaleString()} د.ع</div><div class="label">إجمالي المبيعات</div>
                        <div class="row" style="margin-top:8px"><span>عدد الطلبات:</span><span>${finishedOrders.length}</span></div>
                        <div class="row"><span>متوسط الطلب:</span><span>${avg.toLocaleString()} د.ع</span></div>
                        ${giftOrders.length > 0 ? `<div class="row" style="color:#7c3aed;margin-top:4px"><span>🎁 هدايا مجانية:</span><span>${giftOrders.length} طلب — ${giftTotal.toLocaleString()} د.ع</span></div>` : ''}<hr/>
                        <div style="font-weight:900;margin-bottom:4px">الأصناف الأكثر مبيعاً:</div>
                        ${top.map(([n,q],i)=>`<div class="row"><span>${i+1}. ${n}</span><span>(${q})</span></div>`).join('')}<hr/>
                        ${peak?`<div class="row"><span>ساعة الذروة:</span><span>${fmt(peak[0])} (${peak[1]} طلب)</span></div><hr/>`:''}
                        <div style="font-weight:900;margin-bottom:6px">المبلغ المتوقع في الصندوق:</div>
                        <div class="big">${finishedTotal.toLocaleString()} د.ع</div><hr/>
                        <div class="row"><span>المبلغ الفعلي المعدود:</span></div><div class="sign"></div>
                        <div style="height:16px"></div><div class="row"><span>توقيع المدير:</span></div><div class="sign"></div>
                        <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
                      win.document.close();
                    }}
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/50 hover:text-amber-400 hover:border-amber-500/30 font-black text-[11px] transition-all active:scale-95">
                      🖨️
                    </button>
                  )}
                </div>

                {/* Inline report card */}
                {showReport && finishedOrders.length > 0 && (() => {
                  const iC = {}; finishedOrders.forEach(o=>(o.items||[]).forEach(it=>{iC[it.name]=(iC[it.name]||0)+(it.qty||1);}));
                  const top = Object.entries(iC).sort((a,b)=>b[1]-a[1]).slice(0,5);
                  const hC = {}; finishedOrders.forEach(o=>{if(!o.createdAt)return;const h=new Date(o.createdAt).getHours();hC[h]=(hC[h]||0)+1;});
                  const peak = Object.entries(hC).sort((a,b)=>b[1]-a[1])[0];
                  const avg = Math.round(finishedTotal/finishedOrders.length);
                  return (
                    <div className="bg-slate-900 rounded-[2rem] border border-amber-500/30 p-6 space-y-4">
                      <div className="text-center border-b border-white/10 pb-4">
                        <p className="text-amber-400 font-black text-[11px] uppercase tracking-widest mb-1">تقرير اليوم</p>
                        <p className="text-white font-black text-2xl">{finishedTotal.toLocaleString()} <span className="text-sm">د.ع</span></p>
                        <p className="text-white/30 text-[10px] font-bold mt-1">{todayStr}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "عدد الطلبات", value: finishedOrders.length },
                          { label: "متوسط الطلب", value: avg.toLocaleString() + " د.ع" },
                          { label: "بالصندوق", value: finishedTotal.toLocaleString() + " د.ع" },
                        ].map(s => (
                          <div key={s.label} className="bg-black/30 rounded-2xl p-3 text-center">
                            <p className="text-white 