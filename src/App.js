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
    : process.env.REACT_APP_APP_ID || "karbala-burger-pro-v1";

const getMenuCollection = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
const getOwnerDoc = () => doc(db, 'artifacts', appId, 'private', 'data', 'admin', 'owner');
const getOrdersCollection = (dateStr) => collection(db, 'artifacts', appId, 'private', 'data', 'orders', dateStr, 'items');
// Counter lives in public so anonymous customers can read+write it during the transaction
const getOrderCounterDoc = (dateStr) => doc(db, 'artifacts', appId, 'public', 'data', 'counters', dateStr);
const getDateStr = () => new Date().toLocaleDateString('en-CA');

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

  useEffect(() => {
    if (!user) return;
    const unsubMenu = onSnapshot(
      getMenuCollection(),
      (snap) => {
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
    const q = query(getOrdersCollection(getDateStr()), orderBy("createdAt", "desc"));
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
  }, [isUnlocked, autoPrintEnabled, settings.printCopies]);

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
          const orderDate = o.dateStr || getDateStr();
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
    await setDoc(getSettingsDoc(), { [field]: value }, { merge: true });
  };

  const handleAddItem = async () => {
    if (!user || !newItem.name || !newItem.price) return;
    const id = newItem.id || "item_" + Date.now();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {
        ...newItem,
        id,
        price: Number(newItem.price) || 0,
        salePrice: newItem.salePrice ? Number(newItem.salePrice) : null,
        createdAt: new Date().toISOString()
      });
      setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: newItem.category });
      setSaveStatus("تم الحفظ بنجاح! ✅");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e) {
      setSaveStatus("خطأ في الحفظ ❌");
    }
  };

  const handleDeleteItem = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const updated = [...categories, trimmed];
    setCategories(updated);
    setNewCategoryInput("");
    await setDoc(getSettingsDoc(), { categories: updated }, { merge: true });
  };

  const handleRemoveCategory = async (cat) => {
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    await setDoc(getSettingsDoc(), { categories: updated }, { merge: true });
  };

  const handleToggleVisibility = async (item) => {
    const hidden = !item.hidden;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { hidden }, { merge: true });
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
      const d = dateStr || getDateStr();
      await updateDoc(doc(db, 'artifacts', appId, 'private', 'data', 'orders', d, 'items', orderId), { status });
    } catch (e) { console.error(e); }
  };

  const saveOrderToFirebase = async () => {
    const d = getDateStr();
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
      <div class="meta center">${order.dateStr || getDateStr()} — ${time}</div>
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
    const win = window.open('', '_blank', 'width=240,height=400');
    if (!win) return;
    win.document.write(buildReceiptHtml(order));
    win.document.close();
  };

  const handleDeleteOrder = async (order, dateStr) => {
    const d = dateStr || getDateStr();
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
        doc(db, 'artifacts', appId, 'private', 'data', 'orders', getDateStr(), 'items', order.id),
        { isGift: true, grandTotal: 0, cartTotal: 0, originalTotal, giftedAt: new Date().toISOString() }
      );
    } catch (e) { console.error(e); }
  };

  const handleConfirmDay = async () => {
    if (!window.confirm('تأكيد إنهاء اليوم؟\nسيتم نقل جميع الطلبات النشطة إلى منجزة وحفظ المبيعات.')) return;
    const d = getDateStr();
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
  const giftOrders     = finishedOrders.filter(o => o.isGift);
  const giftTotal      = giftOrders.reduce((s, o) => s + (o.originalTotal || 0), 0);

  return (
    <div className="min-h-screen transition-colors duration-500" style={{ backgroundColor: settings.bgColor, fontFamily: 'sans-serif' }}>
      
      {/* NAVIGATION - Now Static (Not Sticky) */}
      <div className="flex justify-center p-4">
        <div className="flex bg-black/90 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-2xl">
          <button onClick={() => navigateTo("customer")} className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white shadow-lg' : 'text-slate-500'}`} style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}>المنيو</button>
          <button onClick={() => navigateTo("owner")} className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black shadow-lg' : 'text-slate-500'}`}>الإدارة</button>
        </div>
      </div>

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

            {/* TOP BAR — tabs + logout */}
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
                    <p className="font-black text-base leading-tight text-green-400">{finishedTotal.toLocaleString()} <span className="text-[9px]">د.ع</span></p>
                    <p className="text-white/30 text-[9px] font-bold mt-1">مبيعات منجزة</p>
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
                            <p className="text-white font-black text-sm leading-tight">{s.value}</p>
                            <p className="text-white/30 text-[9px] font-bold mt-1">{s.label}</p>
                          </div>
                        ))}
                      </div>
                      {peak && (
                        <div className="bg-black/30 rounded-2xl px-4 py-3 flex justify-between items-center">
                          <span className="text-white/50 text-[11px] font-bold">⏰ ساعة الذروة</span>
                          <span className="text-amber-400 font-black text-[11px]">
                            {(+peak[0]%12||12)}:00 {+peak[0]<12?'ص':'م'}
                            <span className="text-white/30 mr-1"> ({peak[1]} طلب)</span>
                          </span>
                        </div>
                      )}
                      <div className="bg-black/30 rounded-2xl p-4">
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-3">الأصناف الأكثر مبيعاً</p>
                        <div className="space-y-2">
                          {top.map(([name, qty], i) => (
                            <div key={name} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-amber-500/70 w-4">{i+1}.</span>
                                <span className="text-white text-[11px] font-bold">{name}</span>
                              </div>
                              <span className="text-white/50 text-[11px] font-black">{qty} حبة</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4">
                        <p className="text-amber-300/80 text-[10px] font-black uppercase tracking-widest mb-2">المبلغ الفعلي المعدود</p>
                        <div className="border-b-2 border-dashed border-amber-500/30 h-8" />
                        <p className="text-white/20 text-[9px] font-bold mt-2">اكتب الرقم عند الطباعة</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Print toggle */}
                <div className="flex items-center justify-between bg-slate-900 rounded-2xl px-4 py-3 border border-white/5">
                  <span className="text-white/50 text-[11px] font-bold">الطباعة التلقائية</span>
                  <button onClick={() => setAutoPrintEnabled(p => !p)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${autoPrintEnabled ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-slate-700/40 border-white/10 text-slate-400'}`}>
                    🖨️ {autoPrintEnabled ? 'تلقائي' : 'يدوي'}
                  </button>
                </div>

                {/* ACTIVE ORDERS LIST */}
                {ordersTab === 'active' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">طلبات نشطة — {todayStr}</h3>
                      <span className="text-white/30 text-[10px] font-black">{activeOrders.length} طلب</span>
                    </div>
                    {activeOrders.length === 0 && (
                      <div className="bg-slate-900 rounded-[2rem] p-14 text-center border border-white/5">
                        <div className="text-5xl mb-4">📭</div>
                        <p className="text-white/40 font-black text-sm">لا توجد طلبات نشطة</p>
                        <p className="text-white/20 text-[10px] font-bold mt-1">ستظهر هنا فور وصول أي طلب تلقائياً</p>
                      </div>
                    )}
                    {activeOrders.map(order => {
                      const time = order.createdAt
                        ? new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                        : '';
                      const elapsedMin = order.createdAt
                        ? Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
                        : 0;
                      const autoGreyMin = (Number(settings.autoGreyHours) || 5) * 60;
                      const pct = Math.min(100, Math.round((elapsedMin / autoGreyMin) * 100));
                      const timerColor = pct < 50 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
                      return (
                        <div key={order.id} className="bg-slate-900 rounded-[2rem] p-6 border border-yellow-500/40 shadow-yellow-500/10 shadow-2xl">
                          <div className="flex justify-between items-start gap-3 mb-4">
                            <div className="flex items-start gap-3">
                              {FEATURES.orderNumbers && (
                                <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white" style={{ backgroundColor: settings.primaryColor }}>
                                  #{order.orderNumber || '?'}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="bg-yellow-500 text-white text-[9px] font-black px-3 py-1 rounded-full">نشط 🔔</span>
                                  <span className="text-white/30 text-[10px] font-bold">{time}</span>
                                </div>
                                <p className="text-white font-black text-base leading-tight">{order.customerName}</p>
                                <p className="text-white/50 text-[11px] font-bold mt-0.5 tabular-nums" dir="ltr">{order.customerPhone}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-2">
                              {order.isGift ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="bg-purple-500/20 text-purple-300 text-[9px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">🎁 هدية مجانية</span>
                                  <p className="text-xl font-black leading-none line-through text-white/20">
                                    {(order.originalTotal || 0).toLocaleString()} <span className="text-[10px]">د.ع</span>
                                  </p>
                                  <p className="text-lg font-black leading-none text-purple-400">0 د.ع</p>
                                </div>
                              ) : (
                                <p className="text-2xl font-black leading-none" style={{ color: settings.primaryColor }}>
                                  {(order.grandTotal || 0).toLocaleString()} <span className="text-[10px]">د.ع</span>
                                </p>
                              )}
                              {FEATURES.printSlip && (
                                <button onClick={() => printOrderReceipt(order)}
                                  className="text-[10px] font-black text-white/40 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all">
                                  🖨️ طباعة
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="bg-black/30 rounded-2xl p-4 mb-3 space-y-1.5">
                            {(order.items || []).map((it, i) => (
                              <div key={i} className="flex justify-between items-center">
                                <span className="text-white text-sm font-bold">{it.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-white/40 font-black text-[11px]">×{it.qty}</span>
                                  <span className="text-white/60 font-black text-[11px]">{((it.price || 0) * it.qty).toLocaleString()} د.ع</span>
                                </div>
                              </div>
                            ))}
                            {order.deliveryFee > 0 && (
                              <div className="flex justify-between items-center border-t border-white/10 pt-2 mt-1">
                                <span className="text-white/40 text-[11px] font-bold">رسوم التوصيل</span>
                                <span className="text-white/40 text-[11px] font-black">{order.deliveryFee.toLocaleString()} د.ع</span>
                              </div>
                            )}
                          </div>
                          <div className="bg-black/20 rounded-xl px-4 py-2.5 mb-3 flex items-start gap-2">
                            <span>📍</span>
                            <p className="text-white/60 text-[11px] font-bold leading-snug">{order.address}</p>
                          </div>
                          {/* Elapsed timer bar */}
                          <div className="mb-4 px-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: timerColor }}>
                                ⏱ {elapsedMin < 60 ? `${elapsedMin} دقيقة` : `${Math.floor(elapsedMin/60)}س ${elapsedMin%60}د`}
                              </span>
                              <span className="text-white/20 text-[9px] font-bold">ينتقل تلقائياً بعد {autoGreyMin} دقيقة</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: timerColor }} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a href={`https://wa.me/${digitsOnly(order.customerPhone)}?text=${encodeURIComponent(`مرحباً ${order.customerName}، طلبك قيد التوصيل 🛵`)}`}
                              target="_blank" rel="noreferrer"
                              className="px-4 py-3 rounded-2xl bg-[#25D366]/20 text-[#25D366] font-black text-[11px] flex items-center justify-center hover:bg-[#25D366]/30 transition-all shrink-0">
                              💬
                            </a>
                            <button onClick={() => handleGiftOrder(order)}
                              title="تحويل إلى هدية مجانية"
                              className="px-3 py-3 rounded-2xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 font-black text-[11px] transition-all shrink-0 flex items-center gap-1">
                              <span className="text-[12px]">🎁</span>
                            </button>
                            <button onClick={() => handleDeleteOrder(order, todayStr)}
                              className="flex-1 py-3 rounded-2xl bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white font-black text-[12px] transition-all">
                              🗑️ حذف الطلب
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* FINISHED ORDERS LIST */}
                {ordersTab === 'finished' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-green-400 text-[10px] font-black uppercase tracking-[0.2em]">طلبات منجزة — {todayStr}</h3>
                      <span className="text-white/30 text-[10px] font-black">{finishedOrders.length} طلب</span>
                    </div>
                    {finishedOrders.length === 0 && (
                      <div className="bg-slate-900 rounded-[2rem] p-14 text-center border border-white/5">
                        <div className="text-5xl mb-4">✅</div>
                        <p className="text-white/40 font-black text-sm">لا توجد طلبات منجزة بعد</p>
                        <p className="text-white/20 text-[10px] font-bold mt-1">ستنتقل الطلبات هنا تلقائياً بعد {settings.autoGreyHours || 5} ساعات</p>
                      </div>
                    )}
                    {finishedOrders.map(order => {
                      const time = order.createdAt
                        ? new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                        : '';
                      return (
                        <div key={order.id} className={`bg-slate-900 rounded-[2rem] p-5 border ${order.isGift ? 'border-purple-500/30' : 'border-green-500/20'} opacity-80`}>
                          <div className="flex justify-between items-start gap-3 mb-3">
                            <div className="flex items-start gap-3">
                              {FEATURES.orderNumbers && (
                                <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white ${order.isGift ? 'bg-purple-600' : 'bg-green-600'}`}>
                                  #{order.orderNumber || '?'}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  {order.isGift
                                    ? <span className="bg-purple-600 text-white text-[9px] font-black px-3 py-1 rounded-full">🎁 هدية</span>
                                    : <span className="bg-green-600 text-white text-[9px] font-black px-3 py-1 rounded-full">منجز ✓</span>
                                  }
                                  <span className="text-white/30 text-[10px] font-bold">{time}</span>
                                </div>
                                <p className="text-white font-black text-sm leading-tight">{order.customerName}</p>
                                <p className="text-white/40 text-[10px] font-bold mt-0.5" dir="ltr">{order.customerPhone}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              {order.isGift ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <p className="text-white/20 font-black text-sm line-through">{(order.originalTotal || 0).toLocaleString()} د.ع</p>
                                  <p className="text-purple-400 font-black text-base">0 د.ع</p>
                                </div>
                              ) : (
                                <p className="text-green-400 font-black text-lg shrink-0">
                                  {(order.grandTotal || 0).toLocaleString()} <span className="text-[10px]">د.ع</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-xl p-3 mb-3 space-y-1">
                            {(order.items || []).map((it, i) => (
                              <div key={i} className="flex justify-between text-[11px]">
                                <span className="text-white/60 font-bold">{it.name}</span>
                                <span className="text-white/30 font-black">×{it.qty}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            {FEATURES.printSlip && (
                              <button onClick={() => printOrderReceipt(order)}
                                className="px-4 py-2.5 rounded-xl bg-white/5 text-white/40 hover:text-white font-black text-[10px] transition-all">
                                🖨️
                              </button>
                            )}
                            <button onClick={() => handleDeleteOrder(order, todayStr)}
                              className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white font-black text-[11px] transition-all">
                              🗑️ حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── TINY RESET — barely visible, locked by default ── */}
              <div className="flex items-center justify-end gap-2 pt-1 opacity-30 hover:opacity-80 transition-opacity">
                <span className="text-[9px] text-white/30 font-bold">إعادة العداد من #1</span>
                {!resetUnlocked ? (
                  <button onClick={() => setResetUnlocked(true)}
                    className="text-[9px] font-black text-white/20 hover:text-white/50 bg-white/5 px-2 py-1 rounded-lg transition-all">
                    🔒 فتح
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={async () => {
                        if (!window.confirm('تأكيد إعادة عداد الطلبات من #1؟\nهذا للاختبار فقط — لا يحذف الطلبات.')) return;
                        try { await deleteDoc(getOrderCounterDoc(todayStr)); } catch(e) { console.error(e); }
                        setResetUnlocked(false);
                      }}
                      className="text-[9px] font-black text-red-400/70 hover:text-red-400 bg-red-500/10 px-2 py-1 rounded-lg transition-all">
                      إعادة
                    </button>
                    <button onClick={() => setResetUnlocked(false)}
                      className="text-[9px] font-black text-white/20 hover:text-white/40 bg-white/5 px-2 py-1 rounded-lg transition-all">
                      🔒
                    </button>
                  </div>
                )}
              </div>
            </>
            )}

            {/* ── HISTORY TAB ── */}
            {FEATURES.history && adminTab === "history" && (
              <div className="space-y-4">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">سجل الطلبات السابقة 📅</h3>

                {/* Date picker */}
                <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5">
                  <p className="text-white/50 text-[11px] font-bold mb-3">اختر يوماً لعرض طلباته</p>
                  {/* Quick day buttons — last 7 days */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const str = d.toLocaleDateString('en-CA');
                      const label = i === 0 ? 'اليوم' : i === 1 ? 'أمس' : d.toLocaleDateString('ar-IQ', { weekday: 'short' });
                      const active = historyDate === str;
                      return (
                        <button key={str} onClick={() => { setHistoryDate(str); setHistorySearchNum(""); loadHistoryOrders(str); }}
                          className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black transition-all border ${active ? 'text-white border-transparent' : 'bg-black/30 text-white/40 border-white/10 hover:border-white/20'}`}
                          style={active ? { backgroundColor: settings.primaryColor } : {}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Calendar for older dates */}
                  <div className="flex gap-2">
                    <input
                      type="date"
                      max={todayStr}
                      value={historyDate}
                      onChange={e => {
                        setHistoryDate(e.target.value);
                        setHistorySearchNum("");
                        if (e.target.value) loadHistoryOrders(e.target.value);
                      }}
                      className="flex-1 bg-black/50 border border-white/10 p-3 rounded-xl text-white/50 text-sm font-bold outline-none focus:border-orange-500"
                    />
                    {historyDate && (
                      <button onClick={() => { setHistoryDate(""); setHistoryOrders([]); setHistorySearchNum(""); }}
                        className="px-4 rounded-xl bg-white/5 text-white/40 hover:text-white font-black text-sm transition-all">
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {historyLoading && (
                  <div className="text-center py-10">
                    <div className="text-3xl animate-pulse">⏳</div>
                    <p className="text-white/30 text-xs font-bold mt-2">جارٍ التحميل...</p>
                  </div>
                )}

                {!historyLoading && historyDate && historyOrders.length === 0 && (
                  <div className="bg-slate-900 rounded-[2rem] p-12 text-center border border-white/5">
                    <div className="text-4xl mb-3">🗓️</div>
                    <p className="text-white/40 font-black text-sm">لا توجد طلبات في هذا اليوم</p>
                  </div>
                )}

                {!historyLoading && historyOrders.length > 0 && (
                  <>
                    {/* History summary */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "عدد الطلبات", value: historyOrders.length },
                        { label: "منجزة", value: historyOrders.filter(o => o.status === 'finished' || o.status === 'done').length },
                        { label: "إجمالي المبيعات", value: historyOrders.filter(o => (o.status === 'finished' || o.status === 'done') && !o.isGift).reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString() + " د.ع" },
                      ].map(s => (
                        <div key={s.label} className="bg-slate-900 rounded-2xl p-4 border border-white/5 text-center">
                          <p className="text-white font-black text-lg leading-tight">{s.value}</p>
                          <p className="text-white/30 text-[9px] font-bold mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* History print report button */}
                    <button onClick={() => {
                      const hFin = historyOrders.filter(o => o.status === 'finished' || o.status === 'done');
                      const hGifts = hFin.filter(o => o.isGift);
                      const hGiftTotal = hGifts.reduce((s, o) => s + (o.originalTotal || 0), 0);
                      const hPaid = hFin.filter(o => !o.isGift);
                      const hTotal = hPaid.reduce((s, o) => s + (o.grandTotal || 0), 0);
                      const hIC = {};
                      hFin.forEach(o => (o.items||[]).forEach(it => { hIC[it.name] = (hIC[it.name]||0)+(it.qty||1); }));
                      const hTop = Object.entries(hIC).sort((a,b)=>b[1]-a[1]).slice(0,5);
                      const hHC = {};
                      hFin.forEach(o => { if(!o.createdAt) return; const h = new Date(o.createdAt).getHours(); hHC[h]=(hHC[h]||0)+1; });
                      const hPeak = Object.entries(hHC).sort((a,b)=>b[1]-a[1])[0];
                      const hAvg = hPaid.length ? Math.round(hTotal/hPaid.length) : 0;
                      const win = window.open('','_blank','width=240,height=500');
                      win.document.write(`<html><head><meta charset="utf-8"/><style>@page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{font-family:"Courier New",monospace;direction:rtl;font-size:10px;width:54mm;margin:0;padding:0}h2{font-size:12px;font-weight:900;text-align:center;margin:0 0 1mm}.sub{text-align:center;font-size:8px;color:#444;margin-bottom:1mm}hr{border:none;border-top:1px dashed #333;margin:2mm 0}.row{display:flex;justify-content:space-between;padding:1mm 0;font-size:9px}.big{font-size:18px;font-weight:900;text-align:center;margin:2mm 0}.label{font-size:8px;color:#555;text-align:center}.sign{border-bottom:1px solid #333;margin-top:1mm;height:6mm}@media print{body{width:54mm}html{width:58mm}}</style></head><body>
                        <h2>تقرير المبيعات</h2><div class="sub">${settings.restaurantName} — ${historyDate}</div><hr/>
                        <div class="big">${hTotal.toLocaleString()} د.ع</div><div class="label">إجمالي المبيعات</div>
                        <div class="row" style="margin-top:8px"><span>عدد الطلبات:</span><span>${hFin.length}</span></div>
                        <div class="row"><span>متوسط الطلب:</span><span>${hAvg.toLocaleString()} د.ع</span></div>
                        ${hGifts.length > 0 ? `<div class="row" style="color:#7c3aed"><span>🎁 هدايا مجانية:</span><span>${hGifts.length} طلب — ${hGiftTotal.toLocaleString()} د.ع</span></div>` : ''}<hr/>
                        <div style="font-weight:900;margin-bottom:4px">الأصناف الأكثر مبيعاً:</div>
                        ${hTop.map(([n,q],i)=>`<div class="row"><span>${i+1}. ${n}</span><span>(${q})</span></div>`).join('')}<hr/>
                        ${hPeak?`<div class="row"><span>ساعة الذروة:</span><span>${((+hPeak[0]%12)||12)}:00 ${+hPeak[0]<12?'ص':'م'} (${hPeak[1]} طلب)</span></div><hr/>`:''}
                        <div style="font-weight:900;margin-bottom:6px">المبلغ المتوقع في الصندوق:</div>
                        <div class="big">${hTotal.toLocaleString()} د.ع</div><hr/>
                        <div class="row"><span>المبلغ الفعلي:</span></div><div class="sign"></div>
                        <div style="height:16px"></div><div class="row"><span>توقيع المدير:</span></div><div class="sign"></div>
                        <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
                      win.document.close();
                    }}
                      className="w-full py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black text-[11px] uppercase tracking-wide hover:bg-amber-500/25 active:scale-95 transition-all flex items-center justify-center gap-2">
                      🖨️ طباعة تقرير {historyDate}
                    </button>

                    {/* Search by order number inside history */}
                    <div className="bg-slate-900 rounded-2xl p-4 border border-white/5">
                      <p className="text-white/40 text-[10px] font-bold mb-2">بحث برقم الطلب في هذا اليوم 🔍</p>
                      <input
                        type="number"
                        placeholder="رقم الطلب..."
                        value={historySearchNum}
                        onChange={e => setHistorySearchNum(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 p-3 rounded-xl text-white text-sm font-bold outline-none focus:border-orange-500 text-right"
                        dir="rtl"
                      />
                    </div>

                    {/* History order cards — editable */}
                    {historyOrders
                      .filter(o => !historySearchNum || String(o.orderNumber).includes(historySearchNum))
                      .map(order => {
                        const isFinished = order.status === 'finished' || order.status === 'done';
                        const time = order.createdAt
                          ? new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                          : '';
                        return (
                          <div key={order.id}
                            className={`bg-slate-900 rounded-[2rem] p-5 border transition-all ${isFinished ? 'border-green-500/20 opacity-80' : 'border-yellow-500/20'}`}>
                            <div className="flex justify-between items-start gap-3 mb-3">
                              <div className="flex items-start gap-3">
                                {FEATURES.orderNumbers && (
                                  <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-black text-base text-white ${isFinished ? 'bg-green-600' : 'bg-yellow-500'}`}>
                                    #{order.orderNumber || '?'}
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full text-white ${isFinished ? 'bg-green-600' : 'bg-yellow-500'}`}>
                                      {isFinished ? 'منجز ✓' : 'نشط'}
                                    </span>
                                    <span className="text-white/30 text-[10px] font-bold">{time}</span>
                                  </div>
                                  <p className="text-white font-black">{order.customerName}</p>
                                  <p className="text-white/40 text-[11px] font-bold" dir="ltr">{order.customerPhone}</p>
                                  <p className="text-white/30 text-[10px] font-bold mt-1">📍 {order.address}</p>
                                </div>
                              </div>
                              <p className="text-lg font-black shrink-0" style={{ color: settings.primaryColor }}>
                                {(order.grandTotal || 0).toLocaleString()} <span className="text-[10px]">د.ع</span>
                              </p>
                            </div>
                            <div className="bg-black/30 rounded-xl p-3 space-y-1 mb-3">
                              {(order.items || []).map((it, i) => (
                                <div key={i} className="flex justify-between text-[11px]">
                                  <span className="text-white/70 font-bold">{it.name}</span>
                                  <div className="flex gap-3">
                                    <span className="text-white/40 font-black">×{it.qty}</span>
                                    <span className="text-white/30 font-black">{((it.price || 0) * it.qty).toLocaleString()} د.ع</span>
                                  </div>
                                </div>
                              ))}
                              {order.deliveryFee > 0 && (
                                <div className="flex justify-between text-[11px] border-t border-white/10 pt-1 mt-1">
                                  <span className="text-white/40 font-bold">توصيل</span>
                                  <span className="text-white/30 font-black">{order.deliveryFee.toLocaleString()} د.ع</span>
                                </div>
                              )}
                            </div>
                            {/* Action row */}
                            <div className="flex gap-2">
                              {FEATURES.printSlip && (
                                <button onClick={() => printOrderReceipt({ ...order, dateStr: historyDate })}
                                  className="px-4 py-2.5 rounded-xl bg-white/5 text-white/40 hover:text-white font-black text-[10px] transition-all shrink-0">
                                  🖨️
                                </button>
                              )}
                              <a href={`https://wa.me/${digitsOnly(order.customerPhone)}`}
                                target="_blank" rel="noreferrer"
                                className="px-4 py-2.5 rounded-xl bg-[#25D366]/10 text-[#25D366] font-black text-[11px] flex items-center justify-center hover:bg-[#25D366]/20 transition-all shrink-0">
                                💬
                              </a>
                              <button onClick={() => handleHistoryDelete(order, historyDate)}
                                className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white font-black text-[11px] transition-all">
                                🗑️ حذف من السجل
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </>
                )}
              </div>
            )}

            {/* ── MENU MANAGEMENT TAB ── */}
            {adminTab === "menu" && (
            <div className="space-y-8">

            {/* POS SETTINGS */}
            {FEATURES.dashboard && (
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">إعدادات نظام الطلبات 🖨️</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                  <p className="text-white text-[10px] font-bold mb-3">نسخ الطباعة عند كل طلب</p>
                  <div className="flex gap-2">
                    {[1, 2].map(n => (
                      <button key={n} onClick={() => updateGlobalSettings("printCopies", n)}
                        className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${Number(settings.printCopies||2) === n ? 'text-white' : 'bg-black/40 text-white/40'}`}
                        style={Number(settings.printCopies||2) === n ? { backgroundColor: settings.primaryColor } : {}}>
                        {n === 1 ? 'نسخة واحدة' : 'نسختان'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                  <p className="text-white text-[10px] font-bold mb-3">الإنهاء التلقائي للطلب (ساعات)</p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 5].map(n => (
                      <button key={n} onClick={() => updateGlobalSettings("autoGreyHours", n)}
                        className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${Number(settings.autoGreyHours||5) === n ? 'text-white' : 'bg-black/40 text-white/40'}`}
                        style={Number(settings.autoGreyHours||5) === n ? { backgroundColor: settings.primaryColor } : {}}>
                        {n}س
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                  <p className="text-white text-[10px] font-bold mb-3">وقت تنبيه إنهاء اليوم</p>
                  <div className="flex gap-2 flex-wrap">
                    {[0, 1, 2].map(h => (
                      <button key={h} onClick={() => updateGlobalSettings("dayCloseHour", h)}
                        className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${Number(settings.dayCloseHour||0) === h ? 'text-white' : 'bg-black/40 text-white/40'}`}
                        style={Number(settings.dayCloseHour||0) === h ? { backgroundColor: settings.primaryColor } : {}}>
                        {h === 0 ? '12 م' : `${h} ص`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            )}
            
            {/* BRANDING */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">تعديل هوية المطعم</h3>
                {LOCKED && (
                  <span className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[9px] font-black text-white/40 uppercase tracking-wide">
                    🔒 الهوية محمية
                  </span>
                )}
              </div>

              {/* LOGO SECTION — always visible, locked when LOCKED=true */}
              <div className={`mb-6 p-5 rounded-2xl border ${LOCKED ? 'border-white/5 opacity-50 pointer-events-none select-none' : 'border-orange-500/20 bg-orange-500/5'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest">لوغو المطعم</span>
                  {LOCKED && <span className="text-[9px] text-white/30 font-bold">🔒 للتعديل تواصل مع المطور</span>}
                </div>
                <div className="flex items-center gap-4">
                  {/* Logo preview */}
                  <div className="shrink-0 w-20 h-20 flex items-center justify-center"
                    style={{ filter: `drop-shadow(0 8px 16px ${settings.primaryColor}40)` }}>
                    {settings.logoUrl
                      ? <img src={settings.logoUrl} alt="logo" className="w-full h-full object-contain" onError={e => e.target.style.display='none'} />
                      : <span className="text-4xl">🍔</span>
                    }
                  </div>
                  <div className="flex-1">
                    <input
                      className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white text-xs font-bold outline-none focus:border-orange-500"
                      placeholder="ألصق رابط اللوغو (URL صورة)"
                      value={settings.logoUrl || ""}
                      onChange={e => updateGlobalSettings("logoUrl", e.target.value)}
                      disabled={LOCKED}
                    />
                    <p className="text-white/20 text-[9px] font-bold mt-1.5">ارفع الصورة على imgur.com أو imgbb.com ثم ألصق الرابط هنا</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* LOCKED: Restaurant name EN */}
                <div className={`relative ${LOCKED ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                  <input className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                    placeholder="اسم المطعم EN"
                    value={settings.restaurantName}
                    onChange={e => updateGlobalSettings("restaurantName", e.target.value)}
                    disabled={LOCKED} />
                  {LOCKED && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">🔒</span>}
                </div>

                {/* LOCKED: Restaurant name AR */}
                <div className={`relative ${LOCKED ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                  <input className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                    placeholder="اسم المطعم AR"
                    value={settings.restaurantNameAr}
                    onChange={e => updateGlobalSettings("restaurantNameAr", e.target.value)}
                    disabled={LOCKED} />
                  {LOCKED && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">🔒</span>}
                </div>

                {/* FREE: WhatsApp */}
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                  placeholder="واتساب (964...)" value={settings.whatsapp}
                  onChange={e => updateGlobalSettings("whatsapp", e.target.value)} />

                {/* FREE: Opening hours */}
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                  placeholder="أوقات العمل" value={settings.openingHours}
                  onChange={e => updateGlobalSettings("openingHours", e.target.value)} />

                {/* FREE: Location */}
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2"
                  placeholder="وصف الموقع / العنوان" value={settings.locationDesc}
                  onChange={e => updateGlobalSettings("locationDesc", e.target.value)} />

                {/* FREE: Social */}
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                  placeholder="Facebook URL" value={settings.facebookUrl || ""}
                  onChange={e => updateGlobalSettings("facebookUrl", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                  placeholder="Instagram URL" value={settings.instagramUrl || ""}
                  onChange={e => updateGlobalSettings("instagramUrl", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2"
                  placeholder="TikTok URL" value={settings.tiktokUrl || ""}
                  onChange={e => updateGlobalSettings("tiktokUrl", e.target.value)} />

                {/* FREE: Phone numbers */}
                <div className="md:col-span-2 rounded-[1.5rem] border-2 border-orange-500/50 bg-gradient-to-br from-orange-500/15 to-transparent p-5 space-y-3">
                  <p className="text-white font-black text-sm flex items-center gap-2" dir="rtl">
                    <span aria-hidden="true">📞</span>
                    ثلاثة أرقام اتصال (اختياري) — تظهر للزبائن تحت أيقونات السوشال
                  </p>
                  <p className="text-[10px] text-white/50 font-bold" dir="rtl">اكتب على الأقل 5 أرقام لكل خط (مثال: 9647801234567)</p>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="space-y-1">
                      <label className="text-[10px] font-black text-orange-300/90 uppercase tracking-wide" dir="rtl">رقم الهاتف {n}</label>
                      <input
                        className="w-full bg-black/50 border border-white/15 p-4 rounded-xl text-white text-sm"
                        placeholder={n === 1 ? "964..." : "اتركه فارغًا إن لم يُستخدم"}
                        inputMode="tel"
                        autoComplete="tel"
                        value={String(settings[`contactPhone${n}`] ?? "")}
                        onChange={(e) => updateGlobalSettings(`contactPhone${n}`, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                {/* FREE: Notes */}
                <textarea className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2 h-24 resize-none"
                  placeholder="رسالة تظهر عند متابعة الطلب" value={settings.checkoutNote || ""}
                  onChange={e => updateGlobalSettings("checkoutNote", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2"
                  placeholder="عنوان قسم الخصومات (مثال: عروض نارية 🔥)" value={settings.dealsSectionTitle || ""}
                  onChange={e => updateGlobalSettings("dealsSectionTitle", e.target.value)} />
                <textarea className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2 h-20 resize-none"
                  placeholder="ملاحظة بجانب السعر (توصيل، مناطق، إلخ)" value={settings.cartDeliveryNote || ""}
                  onChange={e => updateGlobalSettings("cartDeliveryNote", e.target.value)} />

                {/* FREE: Delivery fee */}
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl md:col-span-2">
                  <p className="text-white text-[10px] font-bold mb-2">رسوم التوصيل (د.ع)</p>
                  <input className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-white text-sm"
                    type="number" min="0" step="1"
                    placeholder="0 = بدون رسوم — تُضاف تلقائيًا للإجمالي"
                    value={Number(settings.deliveryFee) || 0}
                    onChange={e => updateGlobalSettings("deliveryFee", Math.max(0, Number(e.target.value) || 0))} />
                </div>

                {/* LOCKED: Primary color */}
                <div className={`flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5 relative ${LOCKED ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                  <span className="text-white text-[10px] font-bold">اللون الأساسي</span>
                  <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer"
                    value={settings.primaryColor}
                    onChange={e => updateGlobalSettings("primaryColor", e.target.value)}
                    disabled={LOCKED} />
                  {LOCKED && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">🔒</span>}
                </div>

                {/* LOCKED: Background color */}
                <div className={`flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5 relative ${LOCKED ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                  <span className="text-white text-[10px] font-bold">لون الخلفية</span>
                  <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer"
                    value={settings.bgColor}
                    onChange={e => updateGlobalSettings("bgColor", e.target.value)}
                    disabled={LOCKED} />
                  {LOCKED && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">🔒</span>}
                </div>

                {/* LOCKED notice */}
                {LOCKED && (
                  <div className="md:col-span-2 bg-white/3 border border-white/5 rounded-2xl p-4 text-center">
                    <p className="text-white/20 text-[10px] font-bold">🔒 الاسم واللوغو والألوان محمية — للتعديل تواصل مع المطور</p>
                  </div>
                )}

              </div>
            </section>

            {/* CATEGORY MANAGEMENT */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">إدارة الأقسام</h3>
              <div className="flex gap-2 mb-4">
                <input
                  className="flex-1 bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm"
                  placeholder="اسم القسم الجديد"
                  value={newCategoryInput}
                  onChange={e => setNewCategoryInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
                <button onClick={handleAddCategory} className="px-6 py-4 rounded-xl text-white font-black text-xs uppercase" style={{ backgroundColor: settings.primaryColor }}>إضافة +</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center gap-2 bg-black/40 border border-white/10 px-4 py-2 rounded-xl">
                    <span className="text-white text-xs font-bold">{cat}</span>
                    <button onClick={() => handleRemoveCategory(cat)} className="text-red-400 hover:text-red-300 font-black text-sm leading-none">×</button>
                  </div>
                ))}
              </div>
            </section>

            {/* ADD ITEM WITH PREVIEW */}
            <section id="item-form" className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">إضافة وجبة مصورة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                    <input className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-white font-bold" placeholder="اسم الوجبة" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                    <textarea className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-white text-xs h-20" placeholder="وصف المكونات" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                    <div className="grid grid-cols-2 gap-2">
                        <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="السعر" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                        <input className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-orange-400 text-sm" placeholder="سعر الخصم" type="number" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                    </div>
                    <select className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                
                <div className="flex flex-col gap-4">
                    <div className="relative group w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center">
                        {newItem.image ? (
                            <img src={newItem.image} alt={newItem.name || "preview"} className="w-full h-full object-cover" onError={(e) => e.target.src = PLACEHOLDER} />
                        ) : (
                            <div className="text-white/20 text-[10px] font-black uppercase text-center p-4">معاينة الصورة ستظهر هنا<br/>Image Preview</div>
                        )}
                        <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded-md text-[8px] text-white font-black uppercase">Preview</div>
                    </div>
                    <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-xs" placeholder="ألصق رابط الصورة هنا (URL)" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                </div>

                <button onClick={handleAddItem} className="md:col-span-2 py-5 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all mt-4" style={{ backgroundColor: settings.primaryColor }}>حفظ الوجبة في المنيو</button>
                {saveStatus && <p className="md:col-span-2 text-center text-xs font-bold text-white mt-2">{saveStatus}</p>}
              </div>
            </section>

            {/* VISUAL LIST */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">قائمة الوجبات الحالية</h3>
                <span className="bg-white/10 px-3 py-1 rounded-full text-white text-[10px] font-black">{menuItems.length} صنف</span>
              </div>

              {/* Category filter pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                {["الكل", ...categories].map(cat => (
                  <button key={cat} onClick={() => setMenuFilter(cat)}
                    className={`px-4 py-1.5 rounded-xl text-[11px] font-black transition-all border ${menuFilter === cat ? 'text-white border-transparent' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'}`}
                    style={menuFilter === cat ? { backgroundColor: settings.primaryColor } : {}}>
                    {cat}
                    <span className="ml-1 opacity-60 text-[9px]">
                      {cat === "الكل" ? menuItems.length : menuItems.filter(i => i.category === cat).length}
                    </span>
                  </button>
                ))}
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {menuItems.filter(item => menuFilter === "الكل" || item.category === menuFilter).map(item => (
                    <div key={item.id} className={`bg-black/40 p-3 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all ${item.hidden ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 shadow-inner relative">
                            <img 
                                src={item.image || PLACEHOLDER} 
                                alt={item.name || "menu item"}
                                className="w-full h-full object-cover" 
                                onError={(e) => e.target.src = PLACEHOLDER}
                            />
                            {item.hidden && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs">🙈</div>}
                        </div>
                        <div>
                          <p className="text-white font-bold text-sm mb-0.5">{item.name}</p>
                          <div className="flex items-center gap-2">
                             <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-white/5 text-white/40">{item.category}</span>
                             <span className="text-[10px] font-black text-orange-500">{(item.price || 0).toLocaleString()} د.ع</span>
                             {item.hidden && <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400">مخفي</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button onClick={() => handleToggleVisibility(item)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${item.hidden ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-white' : 'bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white'}`}>{item.hidden ? '🙈 مخفي' : '👁 ظاهر'}</button>
                        <button onClick={() => { setNewItem({...item}); document.getElementById('item-form').scrollIntoView({ behavior: 'smooth' }); }} className="text-white/40 hover:text-white p-3 text-[10px] font-black uppercase">تعديل</button>
                        <button onClick={() => { if(window.confirm(`هل تريد حذف "${item.name}" من المنيو؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) handleDeleteItem(item.id); }} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase">حذف</button>
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
        <div className="pb-40">
          {/* Loading skeleton — shown until Firebase settings arrive */}
          {!settingsLoaded && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <div className="w-16 h-16 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">جارٍ التحميل...</p>
            </div>
          )}
          {/* CUSTOMER CONTENT — only renders after settings load */}
          {settingsLoaded && (
          <div>
          {/* CUSTOMER HEADER */}
          <header className="pt-10 pb-8 px-6 text-center animate-fade-in">

             {/* ── LOGO ── */}
             {settings.logoUrl ? (
               <div className="flex justify-center mb-6">
                 <div className="relative">
                   <div className="w-32 h-32 overflow-hidden"
                     style={{ filter: `drop-shadow(0 20px 40px ${settings.primaryColor}50)` }}>
                     <img src={settings.logoUrl} alt={settings.restaurantName}
                       className="w-full h-full object-contain"
                       onError={e => e.target.style.display='none'} />
                   </div>
                 </div>
               </div>
             ) : (
               <div className="flex justify-center mb-6">
                 <div className="relative w-28 h-28 rounded-[2rem] flex items-center justify-center"
                   style={{
                     background: `linear-gradient(135deg, ${settings.primaryColor} 0%, #7c2d12 100%)`,
                     boxShadow: `0 20px 60px ${settings.primaryColor}50`
                   }}>
                   <span className="text-5xl select-none">🍔</span>
                 </div>
               </div>
             )}

             <h1 className="text-6xl font-black italic uppercase tracking-tighter leading-tight text-slate-950">{settings.restaurantName}</h1>
             <h2 className="text-4xl font-black text-slate-800/40 mt-1">{settings.restaurantNameAr}</h2>
             <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 bg-black text-white px-6 py-2.5 rounded-full shadow-2xl">
                   <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                   <span className="text-[11px] font-black uppercase tracking-widest">{settings.openingHours}</span>
                </div>
                <div className="text-[12px] font-black text-slate-900/40 uppercase tracking-tighter" dir="rtl">📍 {settings.locationDesc}</div>
                {(() => {
                  const phones = contactPhonesList(settings);
                  const hasSocial = settings.facebookUrl || settings.instagramUrl || settings.tiktokUrl;
                  if (!hasSocial && phones.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 max-w-sm mx-auto px-2">
                      {settings.facebookUrl && (
                        <a href={settings.facebookUrl} target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#1877F2] hover:border-[#1877F2]/30 hover:shadow-md transition-all flex items-center justify-center shrink-0">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                            <path d="M13.5 8.5V6.8c0-.8.5-1.1 1.2-1.1H16V3h-2.1C11.6 3 10.5 4.4 10.5 6.2v2.3H9v2.8h1.5V21h3V11.3h2.1l.3-2.8h-2.4z" />
                          </svg>
                        </a>
                      )}
                      {settings.instagramUrl && (
                        <a href={settings.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#E1306C] hover:border-[#E1306C]/30 hover:shadow-md transition-all flex items-center justify-center shrink-0">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none" strokeWidth="2">
                            <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                          </svg>
                        </a>
                      )}
                      {settings.tiktokUrl && (
                        <a href={settings.tiktokUrl} target="_blank" rel="noreferrer" aria-label="TikTok" title="TikTok" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#00F2EA] hover:border-[#00F2EA]/30 hover:shadow-md transition-all flex items-center justify-center shrink-0">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                            <path d="M14.8 3h2.6c.2 1.5 1.3 2.8 2.6 3.3v2.7c-1.3 0-2.6-.4-3.7-1.1v6.3c0 3-2.4 5.4-5.4 5.4a5.4 5.4 0 1 1 0-10.8c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 1.9 2.7V3z" />
                          </svg>
                        </a>
                      )}
                      {phones.map((num, idx) => (
                        <a
                          key={`contact-phone-${idx}`}
                          href={toTelHref(num)}
                          dir="ltr"
                          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-white border border-black/10 text-slate-700 hover:border-slate-300 hover:shadow-md transition-all shrink-0"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-[11px] font-black tabular-nums tracking-tight text-slate-800">{digitsOnly(num) || num}</span>
                        </a>
                      ))}
                    </div>
                  );
                })()}
             </div>
          </header>

          {/* DEALS */}
          {discountItems.length > 0 && (
            <section className="py-6 overflow-hidden deals-strip relative">
                <div className="deals-strip-bg pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(90deg, transparent, ${settings.primaryColor}33, transparent)` }} />
                <div className="px-6 flex items-center justify-center mb-6 relative z-10" dir="rtl">
                   <h2 className="deals-title-glow text-[22px] font-black uppercase italic inline-block" style={{ color: settings.primaryColor }}>{settings.dealsSectionTitle || "عروض نارية 🔥"}</h2>
                </div>
                <div className="flex gap-4 px-6 overflow-x-auto no-scrollbar pb-8 snap-x relative z-10">
                  {discountItems.map((item, di) => (
                    <div
                      key={item.id}
                      className="deal-card-hot snap-center shrink-0 w-[68vw] max-w-[260px] md:w-64 rounded-[1.8rem] p-4 text-white relative overflow-hidden shadow-xl border border-white/30"
                      style={{
                        background: `linear-gradient(160deg, ${settings.primaryColor} 0%, #7c2d12 130%)`,
                        animationDelay: `${di * 0.15}s`
                      }}
                    >
                      <div className="deal-shimmer" aria-hidden="true" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_45%)]" />
                      <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/10 blur-2xl deal-glow-orb" />
                      <div className="absolute top-2 left-2 w-14 h-14 rounded-full border border-white/15" />
                      <div className="relative z-10">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="deal-badge-pulse bg-white/20 backdrop-blur-md text-[8px] font-black px-2.5 py-1 rounded-full">HOT DEAL</span>
                          <span className="bg-black/30 text-[9px] font-black px-2 py-1 rounded-full">
                            -{Math.round(((Number(item.price || 0) - Number(item.salePrice || 0)) / Number(item.price || 1)) * 100)}%
                          </span>
                        </div>
                        <h3 className="text-lg font-black uppercase leading-tight mb-5 tracking-tight text-right">{item.name}</h3>
                        <div className="flex justify-between items-end gap-2 mb-3">
                          {cart[item.id] ? (
                            <div className="flex items-center bg-white rounded-xl p-1 shadow-lg shrink-0">
                              <button type="button" onClick={() => removeFromCart(item.id)} className="w-8 h-8 font-black text-slate-900 hover:bg-slate-100 rounded-lg leading-none">－</button>
                              <span className="w-7 text-center font-black text-xs text-slate-900">{cart[item.id]}</span>
                              <button type="button" onClick={() => addToCart(item)} className="w-8 h-8 font-black text-slate-900 hover:bg-slate-100 rounded-lg leading-none">＋</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => addToCart(item)} className="shrink-0 px-4 py-2.5 bg-white text-black rounded-xl font-black text-[10px] uppercase shadow-lg hover:scale-105 active:scale-95 transition-transform deal-add-btn">إضافة +</button>
                          )}
                           <div className="text-right min-w-0">
                             <p className="text-lg sm:text-xl font-black mb-1 text-amber-200 leading-tight">
                               <span className="old-price-fancy old-price-hot">{Number(item.price || 0).toLocaleString()}</span>
                               <span className="mr-1 text-amber-100">د.ع</span>
                             </p>
                             <p className="text-[36px] font-black tracking-tight leading-none">{Number(item.salePrice || 0).toLocaleString()} <span className="text-sm">د.ع</span></p>
                          </div>
                        </div>
                      </div>
                      <img src={item.image} alt="" className="absolute -top-10 -left-10 w-40 h-40 object-cover opacity-[0.18] -rotate-12 rounded-[2.4rem] saturate-75 contrast-110 deal-bg-img" onError={(e) => e.target.src = PLACEHOLDER} />
                    </div>
                  ))}
                </div>
            </section>
          )}

          {/* CATEGORIES - Not Sticky anymore */}
          <div className="py-4 bg-transparent">
            <div className="max-w-6xl mx-auto flex gap-2 px-6 overflow-x-auto no-scrollbar justify-start md:justify-center" dir="rtl">
              <button onClick={() => setActiveCategory("الكل")} className={`shrink-0 px-8 py-3.5 rounded-2xl text-[12px] font-black transition-all ${activeCategory === "الكل" ? 'bg-black text-white shadow-xl' : 'bg-white text-slate-400 border border-black/5'}`}>الكل</button>
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-8 py-3.5 rounded-2xl text-[12px] font-black transition-all ${activeCategory === cat ? 'text-white shadow-xl' : 'bg-white text-slate-400 border border-black/5'}`} style={activeCategory === cat ? { backgroundColor: settings.primaryColor } : {}}>{cat}</button>
              ))}
            </div>
          </div>

          {/* MENU */}
          <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" dir="rtl">
            {filteredItems.map(item => (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-4 flex flex-col border border-black/5 shadow-lg hover:shadow-2xl transition-all group">
                  <div className="w-full aspect-square rounded-[2rem] overflow-hidden bg-slate-50 mb-5 relative">
                    <img src={item.image || PLACEHOLDER} alt={item.name || "menu item"} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" onError={(e) => e.target.src = PLACEHOLDER} />
                  </div>
                  <div className="flex-1 flex flex-col justify-between px-2">
                    <div className="mb-4">
                      <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{item.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold leading-tight">{item.desc || "طعم لا ينسى"}</p>
                    </div>
                    <div className="flex justify-between items-end gap-2">
                      {item.salePrice != null && Number(item.salePrice) < Number(item.price) ? (
                        <div className="flex flex-col items-start gap-0.5 min-w-0">
                          <p className="text-[11px] font-black text-slate-400 leading-tight">
                            <span className="line-through decoration-2 decoration-red-500 decoration-skip-ink-none">{Number(item.price || 0).toLocaleString()}</span>
                            <span className="text-[9px] mr-0.5"> د.ع</span>
                          </p>
                          <p className="font-black text-lg tracking-tighter leading-tight" style={{ color: settings.primaryColor }}>
                            {Number(item.salePrice).toLocaleString()} <span className="text-[10px]">د.ع</span>
                          </p>
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 mt-0.5">عرض 🔥</span>
                        </div>
                      ) : (
                        <p className="font-black text-lg tracking-tighter self-end" style={{ color: settings.primaryColor }}>{Number(item.price || 0).toLocaleString()} <span className="text-[10px]">د.ع</span></p>
                      )}
                      {cart[item.id] ? (
                        <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
                          <button type="button" onClick={() => removeFromCart(item.id)} className="w-8 h-8 font-black hover:bg-white rounded-lg leading-none">－</button>
                          <span className="w-6 text-center font-black text-xs">{cart[item.id]}</span>
                          <button type="button" onClick={() => addToCart(item)} className="w-8 h-8 font-black hover:bg-white rounded-lg leading-none">＋</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => addToCart(item)} className="px-5 py-2.5 bg-black text-white rounded-xl font-black text-[10px] uppercase shrink-0">إضافة +</button>
                      )}
                    </div>
                  </div>
                </div>
            ))}
          </main>

          {/* FOOTER CART */}
          {cartTotal > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
                className="cart-bar-glow w-full rounded-[1.75rem] shadow-2xl border overflow-hidden text-left transition-transform active:scale-[0.98]"
                style={{
                  borderColor: `${settings.bgColor}55`,
                  background: `linear-gradient(125deg, ${settings.primaryColor} 0%, #1c1917 52%, ${settings.primaryColor}cc 100%)`,
                  boxShadow: `0 12px 40px ${settings.primaryColor}55, 0 0 0 1px ${settings.bgColor}22 inset`
                }}
              >
                <div className="relative px-4 py-3 flex items-center justify-between gap-2">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.12] pointer-events-none" />
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1/2 opacity-[0.22] pointer-events-none"
                    style={{ background: `linear-gradient(to top, ${settings.bgColor}, transparent)` }}
                  />
                  <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1" dir="ltr">
                    <div className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-black text-lg text-white shadow-lg ring-2 ring-white/35 bg-black/40" style={{ boxShadow: `0 4px 22px ${settings.primaryColor}99` }}>{Object.values(cart).reduce((a,b)=>a+b,0)}</div>
                    <div className="text-left min-w-0">
                      <p className="text-lg font-black leading-tight text-white drop-shadow-md">{orderGrandTotal.toLocaleString()} <span className="text-[10px] font-bold opacity-90">د.ع</span></p>
                      {deliveryFee > 0 && (
                        <p className="text-[8px] font-bold text-white/80">شامل توصيل {deliveryFee.toLocaleString()} د.ع</p>
                      )}
                      {settings.cartDeliveryNote && (
                        <p className="text-[9px] font-bold text-white/85 leading-snug line-clamp-2 drop-shadow-sm mt-0.5">{settings.cartDeliveryNote}</p>
                      )}
                    </div>
                  </div>
                  <div className="relative z-10 shrink-0 pr-1 text-white font-black text-[10px] uppercase italic tracking-widest drop-shadow-md">تأكيد ➔</div>
                </div>
              </button>
            </div>
          )}

          {/* CHECKOUT MODAL */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up" dir="rtl">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-black italic">طلبك 📝</h2>
                  <button onClick={() => setIsCheckoutOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full font-black text-2xl flex items-center justify-center">×</button>
                </div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase">السلة</span>
                    <button type="button" onClick={clearCart} className="text-[10px] font-black text-red-600 hover:text-red-700">مسح السلة</button>
                  </div>
                  <div className="space-y-4 mb-4">
                    {Object.entries(cart).map(([id, q]) => {
                      const item = menuItems.find(m => m.id === id);
                      if (!item) return null;
                      const line = (item.salePrice || item.price) * q;
                      return (
                        <div key={id} className="bg-white rounded-2xl p-3 border border-slate-100">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="text-sm font-black text-slate-900 leading-tight flex-1">{item.name}</span>
                            <button type="button" onClick={() => removeCartLine(id)} className="text-[10px] font-black text-red-500 shrink-0 px-2 py-1 rounded-lg hover:bg-red-50">حذف</button>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center bg-slate-100 rounded-xl p-1">
                              <button type="button" onClick={() => removeFromCart(id)} className="w-9 h-9 font-black text-slate-900 hover:bg-white rounded-lg leading-none">－</button>
                              <span className="w-8 text-center font-black text-sm">{q}</span>
                              <button type="button" onClick={() => addToCart(item)} className="w-9 h-9 font-black text-slate-900 hover:bg-white rounded-lg leading-none">＋</button>
                            </div>
                            <span className="text-xs font-black text-slate-600">{line.toLocaleString()} د.ع</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-200 pt-4 space-y-2">
                    <div className="flex justify-between text-xs font-black text-slate-600">
                      <span>مجموع الأصناف</span>
                      <span>{cartTotal.toLocaleString()} د.ع</span>
                    </div>
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-xs font-black text-slate-600">
                        <span>رسوم التوصيل</span>
                        <span>{deliveryFee.toLocaleString()} د.ع</span>
                      </div>
                    )}
                    <div className="flex justify-between items-end pt-2 border-t border-slate-200">
                      <span className="text-sm font-black text-slate-800">الإجمالي</span>
                      <span className="text-3xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{orderGrandTotal.toLocaleString()} <span className="text-xs">د.ع</span></span>
                    </div>
                    {settings.cartDeliveryNote && (
                      <p className="text-[11px] font-bold text-slate-500 leading-snug text-right pt-1">{settings.cartDeliveryNote}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500" placeholder="الاسم الكامل" />
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500" placeholder="رقم الهاتف" />
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm h-24 border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500 resize-none" placeholder="العنوان بالتفصيل" />
                </div>
                {settings.checkoutNote && (
                  <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-right">
                    <p className="text-xs font-black text-amber-900">{settings.checkoutNote}</p>
                  </div>
                )}
                {/* inline error banner */}
                {orderError && (
                  <div className={`mb-4 rounded-2xl p-4 text-right border ${orderError === 'offline' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="font-black text-sm mb-0.5">
                      {orderError === 'offline' ? '📵 لا يوجد اتصال بالإنترنت' : '❌ فشل إرسال الطلب'}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      {orderError === 'offline'
                        ? 'تحقق من اتصالك ثم اضغط مجدداً — لن يُرسل الطلب تلقائياً'
                        : 'حدث خطأ غير متوقع، تحقق من الإنترنت وحاول مرة أخرى'}
                    </p>
                  </div>
                )}
                {/* Checkout buttons — adapt to orderMode + FEATURES */}
                {(() => {
                  // Basic bundle always forces WhatsApp-only
                  const mode = FEATURES.dashboard ? (settings.orderMode || "both") : "whatsapp";
                  const disabled = !address || !customerName || !customerPhone || orderSubmitting || !user;
                  const loadingLabel = <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block"></span>جارٍ الإرسال...</span>;
                  if (mode === "whatsapp") return (
                    <button disabled={disabled} onClick={() => { setOrderError(null); sendWhatsApp(); }}
                      className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 disabled:grayscale transition-all">
                      {orderSubmitting ? loadingLabel : 'إرسال الطلب عبر واتساب 💬'}
                    </button>
                  );
                  if (mode === "dashboard") return (
                    <button disabled={disabled} onClick={() => { setOrderError(null); sendDashboardOnly(); }}
                      className="w-full py-6 text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 disabled:grayscale transition-all active:scale-95"
                      style={{ backgroundColor: settings.primaryColor }}>
                      {orderSubmitting ? loadingLabel : 'تأكيد الطلب ✅'}
                    </button>
                  );
                  return (
                    <div className="space-y-3">
                      <button disabled={disabled} onClick={() => { setOrderError(null); sendWhatsApp(); }}
                        className="w-full py-5 bg-[#25D366] text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 disabled:grayscale transition-all">
                        {orderSubmitting ? loadingLabel : 'إرسال عبر واتساب 💬'}
                      </button>
                      <button disabled={disabled} onClick={() => { setOrderError(null); sendDashboardOnly(); }}
                        className="w-full py-5 text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 disabled:grayscale transition-all active:scale-95"
                        style={{ backgroundColor: settings.primaryColor }}>
                        {orderSubmitting ? loadingLabel : 'تأكيد الطلب مباشرة ✅'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ORDER CONFIRMED POPUP */}
          {FEATURES.orderNumbers && confirmedOrderNum && (
            <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
              <div className="bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl animate-slide-up" dir="rtl">
                <div className="text-6xl mb-4">✅</div>
                <p className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">تم استلام طلبك</p>
                <p className="text-8xl font-black tracking-tighter leading-none mb-1" style={{ color: settings.primaryColor }}>#{confirmedOrderNum}</p>
                <p className="text-slate-400 text-xs font-bold mt-1 mb-8">احتفظ برقم طلبك</p>
                <button onClick={() => setConfirmedOrderNum(null)}
                  className="w-full py-4 text-white font-black rounded-2xl text-sm active:scale-95 transition-all"
                  style={{ backgroundColor: settings.primaryColor }}>
                  حسناً 👍
                </button>
              </div>
            </div>
          )}

          {/* MIDNIGHT WARNING POPUP */}
          {showMidnightWarning && (
            <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
              <div className="bg-slate-900 border border-orange-500/40 rounded-[3rem] p-10 text-center max-w-sm w-full shadow-2xl animate-slide-up" dir="rtl">
                <div className="text-6xl mb-4">🔔</div>
                <p className="text-orange-400 text-[11px] font-black uppercase tracking-widest mb-3">تنبيه نهاية اليوم</p>
                <p className="text-white font-black text-xl mb-2">لا تنس تأكيد اليوم</p>
                <p className="text-white/40 text-sm font-bold mb-8">اضغط تأكيد اليوم لحفظ المبيعات في السجل</p>
                <div className="space-y-3">
                  <button onClick={() => { handleConfirmDay(); setShowMidnightWarning(false); }}
                    className="w-full py-4 text-white font-black rounded-2xl text-sm active:scale-95 transition-all bg-green-600">
                    تأكيد اليوم الآن ✅
                  </button>
                  <button onClick={() => setShowMidnightWarning(false)}
                    className="w-full py-4 bg-white/5 text-white/50 font-black rounded-2xl text-sm active:scale-95 transition-all">
                    لا يزال هناك طلبات — سأؤكد لاحقاً
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          )} {/* end settingsLoaded */}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* ── OWNER PANEL LIGHT THEME ── */
        .owner-panel { background: #f8fafc; border-radius: 0; min-height: 100vh; padding-bottom: 10rem; }
        .owner-panel section,
        .owner-panel .order-card { background: #ffffff !important; border-color: #e2e8f0 !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
        .owner-panel [class*="bg-slate-900"] { background: #ffffff !important; }
        .owner-panel [class*="bg-black/40"],
        .owner-panel [class*="bg-black/30"],
        .owner-panel [class*="bg-black/20"],
        .owner-panel [class*="bg-black/50"] { background: #f1f5f9 !important; }
        .owner-panel input, .owner-panel textarea, .owner-panel select { background: #f8fafc !important; border-color: #cbd5e1 !important; color: #0f172a !important; }
        .owner-panel input::placeholder, .owner-panel textarea::placeholder { color: #94a3b8 !important; }
        .owner-panel [class*="text-white"]:not([class*="bg-"]):not(button):not(a):not(span[class*="bg-"]) { color: #1e293b !important; }
        .owner-panel [class*="text-white/30"] { color: #94a3b8 !important; }
        .owner-panel [class*="text-white/40"] { color: #64748b !important; }
        .owner-panel [class*="text-white/50"] { color: #475569 !important; }
        .owner-panel [class*="text-white/60"] { color: #334155 !important; }
        .owner-panel [class*="border-white/5"],
        .owner-panel [class*="border-white/10"],
        .owner-panel [class*="border-white/15"],
        .owner-panel [class*="border-white/20"] { border-color: #e2e8f0 !important; }
        .owner-panel [class*="bg-white/5"] { background: #f1f5f9 !important; }
        .owner-panel [class*="bg-white/10"] { background: #e2e8f0 !important; }
        .owner-panel [class*="bg-black/80"],
        .owner-panel [class*="bg-black/90"] { background: #1e293b !important; }
        .owner-panel h3[class*="text-orange"] { color: #ea580c !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        .old-price-fancy {
          text-decoration: line-through;
          text-decoration-thickness: 2px;
          text-decoration-color: rgba(255, 255, 255, 0.95);
          text-decoration-skip-ink: none;
        }
        .old-price-hot {
          text-decoration-color: rgba(239, 68, 68, 0.95);
        }
        .old-price-fancy.old-price-hot {
          text-decoration-thickness: 3px;
        }
        @keyframes dealsTitleGlow {
          0%, 100% { filter: drop-shadow(0 0 0 transparent); transform: scale(1); }
          50% { filter: drop-shadow(0 0 14px rgba(234, 88, 12, 0.55)); transform: scale(1.02); }
        }
        .deals-title-glow { animation: dealsTitleGlow 2.8s ease-in-out infinite; }
        @keyframes dealsFireWiggle {
          0%, 100% { transform: rotate(-4deg) scale(1); }
          50% { transform: rotate(4deg) scale(1.08); }
        }
        .deals-fire { animation: dealsFireWiggle 1.2s ease-in-out infinite; }
        @keyframes dealShimmerMove {
          0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
        }
        .deal-shimmer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 5;
        }
        .deal-shimmer::after {
          content: '';
          position: absolute;
          top: -50%;
          left: 0;
          width: 45%;
          height: 200%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.22), transparent);
          animation: dealShimmerMove 3.2s ease-in-out infinite;
        }
        @keyframes dealCardFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes dealBorderPulse {
          0%, 100% { border-color: rgba(255,255,255,0.28); box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
          50% { border-color: rgba(255,255,255,0.55); box-shadow: 0 18px 50px rgba(255, 120, 60, 0.22); }
        }
        .deal-card-hot {
          animation: dealCardFloat 3.5s ease-in-out infinite, dealBorderPulse 3s ease-in-out infinite;
        }
        @keyframes dealOrbPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.08); }
        }
        .deal-glow-orb { animation: dealOrbPulse 4s ease-in-out infinite; }
        @keyframes dealBadgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
        }
        .deal-badge-pulse { animation: dealBadgePulse 2s ease-in-out infinite; }
        @keyframes dealBgDrift {
          0%, 100% { transform: rotate(-12deg) translate(0, 0); }
          50% { transform: rotate(-10deg) translate(4px, -3px); }
        }
        .deal-bg-img { animation: dealBgDrift 8s ease-in-out infinite; }
      `}} />
    </div>
  );
}