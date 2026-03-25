import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  query,
  enableIndexedDbPersistence
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";

/**
 * 🛠️ CONFIGURATION - RE-LINKED TO YOUR PROJECT
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

const firebaseConfig = typeof window !== 'undefined' && window.__firebase_config 
  ? JSON.parse(window.__firebase_config) 
  : localConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Simple persistent storage attempt
try {
  enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-pro-v1';

// HELPERS FOR FIRESTORE PATHS (RULE 1)
const getMenuCollection = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 

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
    locationDesc: "كربلاء - مركز المدينة"
  });

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [showError, setShowError] = useState(false);

  // Admin Form States
  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "برجر" });
  const [newCatInput, setNewCatInput] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // Hash Navigation
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

  // Firebase Auth & Data Listeners (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
      try {
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) {
        setUser({ uid: 'guest-' + Math.random().toString(36).substr(2, 9) });
      }
    };
    initAuth();
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
    });

    return () => unsubscribeAuth();
  }, []);

  // Data Listeners dependent on User (RULE 3)
  useEffect(() => {
    if (!user) return;

    // Listen to Menu (RULE 2 - Simple query)
    const unsubMenu = onSnapshot(getMenuCollection(), 
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMenuItems(data);
      },
      (err) => console.error("Menu fetch error:", err)
    );

    // Listen to Settings
    const unsubSettings = onSnapshot(getSettingsDoc(), 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.categories)) setCategories(data.categories);
          setSettings(prev => ({ ...prev, ...data }));
        }
      },
      (err) => console.error("Settings fetch error:", err)
    );

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (passInput === OWNER_PASSWORD) { setIsUnlocked(true); setShowError(false); } 
    else { setShowError(true); setPassInput(""); }
  };

  const updateGlobalSettings = async (field, value) => {
    if (!user) return;
    await setDoc(getSettingsDoc(), { [field]: value }, { merge: true });
  };

  const handleAddItem = async () => {
    if (!user || !newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
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
    if (!user || !newCatInput.trim()) return;
    const updated = [...new Set([...categories, newCatInput.trim()])];
    await updateGlobalSettings("categories", updated);
    setNewCatInput("");
  };

  const handleDeleteCategory = async (cat) => {
    if (!user) return;
    const updated = categories.filter(c => c !== cat);
    await updateGlobalSettings("categories", updated);
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
    if (activeCategory === "الكل") return menuItems;
    return menuItems.filter(item => item.category === activeCategory);
  }, [menuItems, activeCategory]);

  const discountItems = useMemo(() => {
    return menuItems.filter(item => item.salePrice && item.salePrice < item.price);
  }, [menuItems]);

  const sendWhatsApp = () => {
    const itemsStr = Object.entries(cart).map(([id, q]) => {
      const it = menuItems.find(m=>m.id===id);
      return `${q}x ${it?.name}`;
    }).join('\n');
    const text = `طلب جديد: ${settings.restaurantNameAr}\n\nالاسم: ${customerName}\nالهاتف: ${customerPhone}\nالعنوان: ${address}\n\nالأصناف:\n${itemsStr}\n\nالمجموع: ${cartTotal.toLocaleString()} د.ع`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
  };

  return (
    <div className="min-h-screen transition-colors duration-500" style={{ backgroundColor: settings.bgColor, fontFamily: 'sans-serif' }}>
      
      {/* 🛠 FIXED TOP NAV */}
      <div className="sticky top-0 z-[100] flex justify-center p-4">
        <div className="flex bg-black/90 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-2xl">
          <button 
            onClick={() => navigateTo("customer")}
            className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white shadow-lg' : 'text-slate-500'}`}
            style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}
          >
            المنيو / Menu
          </button>
          <button 
            onClick={() => navigateTo("owner")}
            className={`px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black shadow-lg' : 'text-slate-500'}`}
          >
            الإدارة / Admin
          </button>
        </div>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] p-6">
            <form onSubmit={handleAuthSubmit} className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center shadow-2xl scale-in">
              <div className="text-5xl mb-6">👨‍🍳</div>
              <h2 className="text-white text-2xl font-black italic uppercase mb-6">دخول الإدارة</h2>
              <input 
                type="password"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                className={`w-full bg-black border ${showError ? 'border-red-500 animate-shake' : 'border-white/10'} p-5 rounded-2xl text-white text-center outline-none focus:border-orange-500 text-xl font-bold`}
                placeholder="كلمة المرور"
              />
              <button type="submit" className="w-full mt-6 py-5 text-white font-black rounded-2xl text-[12px] uppercase tracking-widest shadow-xl transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}>دخول</button>
              {showError && <p className="text-red-500 text-[10px] font-bold mt-4 uppercase">كلمة مرور خاطئة</p>}
            </form>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6 pb-40 space-y-8" dir="rtl">
            
            {/* BRANDING SETTINGS */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">هوية المطعم</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم المطعم EN" value={settings.restaurantName} onChange={e => updateGlobalSettings("restaurantName", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="اسم المطعم AR" value={settings.restaurantNameAr} onChange={e => updateGlobalSettings("restaurantNameAr", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="واتساب (964...)" value={settings.whatsapp} onChange={e => updateGlobalSettings("whatsapp", e.target.value)} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="ساعات العمل" value={settings.openingHours} onChange={e => updateGlobalSettings("openingHours", e.target.value)} />
                <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5">
                  <span className="text-white text-[10px] font-bold">اللون الأساسي</span>
                  <input type="color" className="w-10 h-10 rounded bg-transparent border-0 cursor-pointer" value={settings.primaryColor} onChange={e => updateGlobalSettings("primaryColor", e.target.value)} />
                </div>
              </div>
            </section>

            {/* CATEGORIES */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">الأصناف</h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {categories.map(c => (
                  <div key={c} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-white text-xs flex items-center gap-3">
                    {c}
                    <button onClick={() => handleDeleteCategory(c)} className="text-red-500 font-bold hover:scale-125">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="صنف جديد" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                <button onClick={handleAddCategory} className="bg-white text-black px-6 rounded-xl font-black text-xs uppercase">إضافة</button>
              </div>
            </section>

            {/* ADD ITEM */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">إضافة وجبة جديدة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="md:col-span-2 bg-black/40 border border-white/5 p-5 rounded-2xl text-white font-bold" placeholder="اسم الوجبة" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <textarea className="md:col-span-2 bg-black/40 border border-white/5 p-5 rounded-2xl text-white text-sm h-24" placeholder="وصف قصير" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="السعر" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <input className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-orange-400 text-sm" placeholder="سعر العرض (اختياري)" type="number" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                <select className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="bg-black/40 border border-white/5 p-4 rounded-xl text-white text-sm" placeholder="رابط الصورة" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                <button onClick={handleAddItem} className="md:col-span-2 py-5 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all" style={{ backgroundColor: settings.primaryColor }}>حفظ الوجبة</button>
                {saveStatus && <p className="md:col-span-2 text-center text-xs font-bold text-white mt-2">{saveStatus}</p>}
              </div>
            </section>

            {/* CURRENT ITEMS LIST (THE FIX) */}
            <section className="bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-xl">
              <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-6">قائمة الوجبات الحالية ({menuItems.length})</h3>
              <div className="space-y-3">
                {menuItems.length === 0 ? (
                  <p className="text-white/20 text-center py-10 italic">لا توجد وجبات حالياً</p>
                ) : (
                  menuItems.map(item => (
                    <div key={item.id} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <img src={item.image || 'https://via.placeholder.com/50'} className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                        <div>
                          <p className="text-white font-bold text-sm">{item.name}</p>
                          <p className="text-white/40 text-[10px] uppercase">{item.category} • {item.price} د.ع</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="bg-red-500/10 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase"
                      >
                        حذف
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>
        )
      ) : (
        <div className="pb-40">
          {/* CUSTOMER HEADER */}
          <header className="pt-10 pb-8 px-6 text-center animate-fade-in">
             <h1 className="text-6xl font-black italic uppercase tracking-tighter leading-tight text-slate-950">
                {settings.restaurantName}
             </h1>
             <h2 className="text-4xl font-black text-slate-800/40 mt-1">{settings.restaurantNameAr}</h2>
             <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 bg-black text-white px-6 py-2.5 rounded-full shadow-2xl">
                   <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                   <span className="text-[11px] font-black uppercase tracking-widest">{settings.openingHours}</span>
                </div>
                <div className="text-[12px] font-black text-slate-900/40 uppercase tracking-tighter" dir="rtl">
                   📍 {settings.locationDesc}
                </div>
             </div>
          </header>

          {/* 🔥 DEALS SLIDER */}
          {discountItems.length > 0 && (
            <section className="py-6 overflow-hidden">
                <div className="px-6 flex items-center justify-center mb-6" dir="rtl">
                   <h2 className="text-[20px] font-black uppercase italic" style={{ color: settings.primaryColor }}>عروض نارية 🔥 HOT DEALS</h2>
                </div>
                <div className="flex gap-6 px-6 overflow-x-auto no-scrollbar pb-8 snap-x">
                  {discountItems.map(item => (
                    <div key={item.id} className="snap-center shrink-0 w-[85vw] md:w-80 rounded-[3rem] p-7 text-white relative overflow-hidden shadow-2xl" style={{ backgroundColor: settings.primaryColor }}>
                      <div className="relative z-10">
                        <div className="mb-6"><span className="bg-white/20 backdrop-blur-md text-[9px] font-black px-4 py-1.5 rounded-full">خصم خاص</span></div>
                        <h3 className="text-2xl font-black uppercase leading-none mb-8 tracking-tighter text-right">{item.name}</h3>
                        <div className="flex justify-between items-end">
                           <button onClick={() => addToCart(item)} className="bg-white w-12 h-12 rounded-full flex items-center justify-center font-black shadow-2xl text-xl text-black">＋</button>
                           <div className="text-right">
                             <p className="text-xs font-black opacity-60 line-through mb-1">{item.price} د.ع</p>
                             <p className="text-2xl font-black tracking-tighter">{item.salePrice} <span className="text-xs">د.ع</span></p>
                          </div>
                        </div>
                      </div>
                      <img src={item.image} className="absolute -top-10 -left-10 w-40 h-40 object-cover opacity-20 -rotate-12 rounded-[4rem]" />
                    </div>
                  ))}
                </div>
            </section>
          )}

          {/* CATEGORY TABS */}
          <div className="sticky top-16 z-50 py-4 bg-transparent backdrop-blur-sm">
            <div className="max-w-6xl mx-auto flex gap-2 px-6 overflow-x-auto no-scrollbar justify-start md:justify-center" dir="rtl">
              <button 
                onClick={() => setActiveCategory("الكل")}
                className={`shrink-0 px-8 py-3.5 rounded-2xl text-[12px] font-black transition-all ${activeCategory === "الكل" ? 'bg-black text-white shadow-xl' : 'bg-white text-slate-400 border border-black/5'}`}
              >
                الكل
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-8 py-3.5 rounded-2xl text-[12px] font-black transition-all ${activeCategory === cat ? 'text-white shadow-xl' : 'bg-white text-slate-400 border border-black/5'}`}
                  style={activeCategory === cat ? { backgroundColor: settings.primaryColor } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* MENU GRID */}
          <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" dir="rtl">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-10">
                <p className="text-5xl font-black italic uppercase">Coming Soon</p>
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-4 flex flex-col border border-black/5 shadow-lg hover:shadow-2xl transition-all group">
                  <div className="w-full aspect-square rounded-[2rem] overflow-hidden bg-slate-50 mb-5 relative">
                    <img src={item.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=500'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                  </div>
                  <div className="flex-1 flex flex-col justify-between px-2">
                    <div className="mb-4">
                      <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{item.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold leading-tight">{item.desc || "ألذ وجبة من مطبخنا"}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-right">
                        <p className="font-black text-lg tracking-tighter" style={{ color: settings.primaryColor }}>
                          {(item.salePrice || item.price).toLocaleString()} <span className="text-[10px]">د.ع</span>
                        </p>
                      </div>
                      {cart[item.id] ? (
                        <div className="flex items-center bg-slate-100 rounded-xl p-1">
                          <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 font-black hover:bg-white rounded-lg transition-colors">－</button>
                          <span className="w-6 text-center font-black text-xs">{cart[item.id]}</span>
                          <button onClick={() => addToCart(item)} className="w-8 h-8 font-black hover:bg-white rounded-lg transition-colors">＋</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} className="px-5 py-2.5 bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                          إضافة +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </main>

          {/* FLOATING CART SUMMARY */}
          {cartTotal > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
              <button 
                onClick={() => setIsCheckoutOpen(true)} 
                className="w-full bg-black text-white p-3 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-between hover:scale-[1.02] active:scale-95 transition-all"
              >
                <div className="flex items-center gap-3 pl-2" dir="ltr">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg" style={{ backgroundColor: settings.primaryColor }}>
                    {Object.values(cart).reduce((a,b)=>a+b,0)}
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-black leading-none">{cartTotal.toLocaleString()} <span className="text-[10px]">IQD</span></p>
                    <p className="text-[7px] font-black opacity-40 uppercase tracking-widest mt-1">Review Order</p>
                  </div>
                </div>
                <div className="pr-8 font-black text-[10px] uppercase italic tracking-widest">تأكيد الطلب ➔</div>
              </button>
            </div>
          )}

          {/* CHECKOUT MODAL */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up" dir="rtl">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-black italic">طلبك 📝</h2>
                  <button onClick={() => setIsCheckoutOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full font-black text-2xl flex items-center justify-center transition-transform hover:rotate-90">×</button>
                </div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 mb-8 space-y-3">
                    {Object.entries(cart).map(([id, q]) => {
                      const item = menuItems.find(m => m.id === id);
                      return item && (
                        <div key={id} className="flex justify-between text-xs font-black">
                          <span className="text-slate-900">{q}x {item.name}</span>
                          <span className="opacity-40">{( (item.salePrice || item.price) * q).toLocaleString()} د.ع</span>
                        </div>
                      )
                    })}
                    <div className="border-t border-slate-200 mt-4 pt-4 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase opacity-30">المجموع</span>
                      <span className="text-3xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} <span className="text-xs">د.ع</span></span>
                    </div>
                </div>
                <div className="space-y-3 mb-8">
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500 transition-all" placeholder="الاسم الكامل" />
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500 transition-all" placeholder="رقم الهاتف" />
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm h-24 border-2 border-slate-100 font-bold text-right outline-none focus:border-orange-500 transition-all resize-none" placeholder="العنوان بالتفصيل" />
                </div>
                <button 
                  disabled={!address || !customerName || !customerPhone} 
                  onClick={sendWhatsApp} 
                  className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-30 disabled:grayscale transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  إرسال عبر واتساب ✅
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOM CSS FOR ANIMATIONS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        .scale-in { animation: fadeIn 0.5s ease-out; }
      `}} />
    </div>
  );
}