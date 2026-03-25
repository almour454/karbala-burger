import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc
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

const appId =
  typeof window !== "undefined" && window.__app_id
    ? window.__app_id
    : process.env.REACT_APP_APP_ID || "karbala-burger-pro-v1";

const getMenuCollection = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
const getOwnerDoc = () => doc(db, 'artifacts', appId, 'private', 'data', 'admin', 'owner');

const PLACEHOLDER = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop";

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
    cartDeliveryNote: "رسوم التوصيل حسب المنطقة — لا تُضاف تلقائيًا للمجموع."
  });

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
      },
      (err) => {
        console.error(err);
        setDataError("تعذر تحميل الإعدادات. تحقق من الإنترنت أو حاول لاحقًا.");
      }
    );

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

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

  const cartTotal = useMemo(() => Object.entries(cart).reduce((t, [id, q]) => {
    const item = menuItems.find(m => m.id === id);
    return item ? t + ((item.salePrice || item.price) * q) : t;
  }, 0), [cart, menuItems]);

  const filteredItems = useMemo(() => {
    const visible = menuItems.filter(item => !item.hidden);
    if (activeCategory === "الكل") return visible;
    return visible.filter(item => item.category === activeCategory);
  }, [menuItems, activeCategory]);

  const discountItems = useMemo(() => {
    return menuItems.filter(item => !item.hidden && item.salePrice && item.salePrice < item.price);
  }, [menuItems]);

  const sendWhatsApp = () => {
    const itemsStr = Object.entries(cart).map(([id, q]) => {
      const it = menuItems.find(m=>m.id===id);
      return `${q}x ${it?.name}`;
    }).join('\n');
    const text = `طلب جديد: ${settings.restaurantNameAr}\n\nالاسم: ${customerName}\nالهاتف: ${customerPhone}\nالعنوان: ${address}\n\nالأصناف:\n${itemsStr}\n\nالمجموع: ${cartTotal.toLocaleString()} د.ع`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
    // Fix: clear cart and close modal after sending
    setCart({});
    setIsCheckoutOpen(false);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
  };

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
          <div className="max-w-4xl mx-auto p-6 pb-40 space-y-8" dir="rtl">
            <div className="flex justify-end">
              <button type="button" onClick={handleOwnerLogout} className="bg-black text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-white hover:text-black border border-white/20 transition-colors">تسجيل خروج</button>
            </div>
            
            {/* BRANDING */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">تعديل هوية المطعم</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم المطعم EN" value={settings.restaurantName} onChange={e => updateGlobalSettings("restaurantName", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم المطعم AR" value={settings.restaurantNameAr} onChange={e => updateGlobalSettings("restaurantNameAr", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="واتساب (964...)" value={settings.whatsapp} onChange={e => updateGlobalSettings("whatsapp", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="أوقات العمل" value={settings.openingHours} onChange={e => updateGlobalSettings("openingHours", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2" placeholder="وصف الموقع / العنوان" value={settings.locationDesc} onChange={e => updateGlobalSettings("locationDesc", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="Facebook URL" value={settings.facebookUrl || ""} onChange={e => updateGlobalSettings("facebookUrl", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="Instagram URL" value={settings.instagramUrl || ""} onChange={e => updateGlobalSettings("instagramUrl", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2" placeholder="TikTok URL" value={settings.tiktokUrl || ""} onChange={e => updateGlobalSettings("tiktokUrl", e.target.value)} />
                <textarea className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2 h-24 resize-none" placeholder="رسالة تظهر عند متابعة الطلب" value={settings.checkoutNote || ""} onChange={e => updateGlobalSettings("checkoutNote", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2" placeholder="عنوان قسم الخصومات (مثال: عروض نارية 🔥)" value={settings.dealsSectionTitle || ""} onChange={e => updateGlobalSettings("dealsSectionTitle", e.target.value)} />
                <textarea className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm md:col-span-2 h-20 resize-none" placeholder="ملاحظة بجانب السعر (توصيل، مناطق، إلخ)" value={settings.cartDeliveryNote || ""} onChange={e => updateGlobalSettings("cartDeliveryNote", e.target.value)} />
                <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                  <span className="text-white text-[10px] font-bold">اللون الأساسي</span>
                  <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer" value={settings.primaryColor} onChange={e => updateGlobalSettings("primaryColor", e.target.value)} />
                </div>
                <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                  <span className="text-white text-[10px] font-bold">لون الخلفية</span>
                  <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer" value={settings.bgColor} onChange={e => updateGlobalSettings("bgColor", e.target.value)} />
                </div>
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
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">قائمة الوجبات الحالية</h3>
                <span className="bg-white/10 px-3 py-1 rounded-full text-white text-[10px] font-black">{menuItems.length} صنف</span>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {menuItems.map(item => (
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
                        <button onClick={() => { if(window.confirm(`حذف ${item.name}؟`)) handleDeleteItem(item.id); }} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase">حذف</button>
                      </div>
                    </div>
                ))}
              </div>
            </section>

          </div>
        )
      ) : (
        <div className="pb-40">
          {/* CUSTOMER HEADER */}
          <header className="pt-10 pb-8 px-6 text-center animate-fade-in">
             <h1 className="text-6xl font-black italic uppercase tracking-tighter leading-tight text-slate-950">{settings.restaurantName}</h1>
             <h2 className="text-4xl font-black text-slate-800/40 mt-1">{settings.restaurantNameAr}</h2>
             <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 bg-black text-white px-6 py-2.5 rounded-full shadow-2xl">
                   <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                   <span className="text-[11px] font-black uppercase tracking-widest">{settings.openingHours}</span>
                </div>
                <div className="text-[12px] font-black text-slate-900/40 uppercase tracking-tighter" dir="rtl">📍 {settings.locationDesc}</div>
                <div className="flex items-center gap-2">
                  {settings.facebookUrl && (
                    <a href={settings.facebookUrl} target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#1877F2] hover:border-[#1877F2]/30 hover:shadow-md transition-all flex items-center justify-center">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M13.5 8.5V6.8c0-.8.5-1.1 1.2-1.1H16V3h-2.1C11.6 3 10.5 4.4 10.5 6.2v2.3H9v2.8h1.5V21h3V11.3h2.1l.3-2.8h-2.4z" />
                      </svg>
                    </a>
                  )}
                  {settings.instagramUrl && (
                    <a href={settings.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#E1306C] hover:border-[#E1306C]/30 hover:shadow-md transition-all flex items-center justify-center">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none" strokeWidth="2">
                        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                        <circle cx="12" cy="12" r="4" />
                        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                      </svg>
                    </a>
                  )}
                  {settings.tiktokUrl && (
                    <a href={settings.tiktokUrl} target="_blank" rel="noreferrer" aria-label="TikTok" title="TikTok" className="w-10 h-10 rounded-full bg-white border border-black/10 text-slate-700 hover:text-[#00F2EA] hover:border-[#00F2EA]/30 hover:shadow-md transition-all flex items-center justify-center">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M14.8 3h2.6c.2 1.5 1.3 2.8 2.6 3.3v2.7c-1.3 0-2.6-.4-3.7-1.1v6.3c0 3-2.4 5.4-5.4 5.4a5.4 5.4 0 1 1 0-10.8c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 1.9 2.7V3z" />
                      </svg>
                    </a>
                  )}
                </div>
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
                      <p className="text-lg font-black leading-tight text-white drop-shadow-md">{cartTotal.toLocaleString()} <span className="text-[10px] font-bold opacity-90">د.ع</span></p>
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
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 mb-8 space-y-3">
                    {Object.entries(cart).map(([id, q]) => {
                      const item = menuItems.find(m => m.id === id);
                      return item && (
                        <div key={id} className="flex justify-between text-xs font-black">
                          <span className="text-slate-900">{q}x {item.name}</span>
                          <span className="opacity-40">{((item.salePrice || item.price) * q).toLocaleString()} د.ع</span>
                        </div>
                      )
                    })}
                    <div className="border-t border-slate-200 mt-4 pt-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-3xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} <span className="text-xs">د.ع</span></span>
                      </div>
                      {settings.cartDeliveryNote && (
                        <p className="text-[11px] font-bold text-slate-500 leading-snug text-right">{settings.cartDeliveryNote}</p>
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
                <button disabled={!address || !customerName || !customerPhone} onClick={sendWhatsApp} className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-30 disabled:grayscale transition-all">إرسال عبر واتساب ✅</button>
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