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
      fo