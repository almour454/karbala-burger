import React, { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc,
  setDoc, 
  deleteDoc,
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

try {
  enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-pro-v1';

const getMenuRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("الكل");
  
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["برجر", "مقبلات", "مشروبات"]);

  const [cart, setCart] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [showError, setShowError] = useState(false);

  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    restaurantNameAr: "برجر كربلاء",
    tagline: "Best Grill in the City",
    primaryColor: "#ea580c", 
    bgColor: "#ffffff",
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "كربلاء - مركز المدينة"
  });

  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "برجر" });
  const [newCatInput, setNewCatInput] = useState("");

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
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) {
        setUser({ uid: 'guest-' + Math.random().toString(36).substr(2, 9) });
      }
    };
    initAuth();
    onAuthStateChanged(auth, (u) => u && setUser(u));

    const unsubMenu = onSnapshot(getMenuRef(), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMenuItems(data);
      setDataLoaded(true);
    });

    const unsubSettings = onSnapshot(getSettingsRef(), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.categories)) setCategories(data.categories);
        setSettings(prev => ({ ...prev, ...data }));
      }
    });

    return () => { unsubMenu(); unsubSettings(); };
  }, []);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (passInput === OWNER_PASSWORD) { setIsUnlocked(true); setShowError(false); } 
    else { setShowError(true); setPassInput(""); }
  };

  const updateSettings = async (field, value) => {
    await setDoc(getSettingsRef(), { [field]: value }, { merge: true });
  };

  const addNewItem = async () => {
    if (!newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {
      ...newItem,
      id,
      price: parseInt(newItem.price) || 0,
      salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null,
      createdAt: new Date().toISOString()
    });
    setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: newItem.category });
  };

  const addCategory = async () => {
    if (!newCatInput.trim()) return;
    const updated = [...new Set([...categories, newCatInput.trim()])];
    await updateSettings("categories", updated);
    setNewCatInput("");
  };

  const deleteCategory = async (catToDelete) => {
    const updated = categories.filter(c => c !== catToDelete);
    await updateSettings("categories", updated);
  };

  const deleteItem = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
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

  const handleCheckout = () => {
    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
    const text = `🔥 طلب جديد من ${settings.restaurantNameAr} 🔥\n\n👤 الاسم: ${customerName}\n📞 الهاتف: ${customerPhone}\n📍 العنوان: ${address}\n\n🛒 التفاصيل:\n${items}\n\n💰 المجموع: ${cartTotal.toLocaleString()} د.ع`;
    const waUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`;
    window.open(waUrl);
  };

  return (
    <div className="min-h-screen font-sans selection:bg-orange-100 antialiased" style={{ backgroundColor: settings.bgColor }}>
      
      {/* 🛠 TOP NAV */}
      <div className="flex justify-center p-6 pb-2">
        <div className="flex bg-black p-1 rounded-full border border-white/10 shadow-xl">
          <button 
            onClick={() => navigateTo("customer")}
            className={`px-8 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white shadow-lg' : 'text-slate-500'}`}
            style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}
          >
            المنيو / Menu
          </button>
          <button 
            onClick={() => navigateTo("owner")}
            className={`px-8 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500'}`}
          >
            الإدارة / Admin
          </button>
        </div>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="flex items-center justify-center p-6 py-20">
            <form onSubmit={handleAuthSubmit} className="bg-slate-900 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center shadow-2xl">
              <h2 className="text-white text-2xl font-black italic uppercase mb-6">التحكم بالمطبخ</h2>
              <input 
                type="password"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                className={`w-full bg-black border ${showError ? 'border-red-500' : 'border-white/10'} p-5 rounded-2xl text-white text-center outline-none focus:border-orange-500 text-xl font-bold`}
                placeholder="رقم السر"
              />
              <button type="submit" className="w-full mt-6 py-5 text-white font-black rounded-2xl text-[12px] uppercase tracking-widest shadow-xl" style={{ backgroundColor: settings.primaryColor }}>دخول</button>
            </form>
          </div>
        ) : (
          <div className="text-white p-6 pb-40">
            <div className="max-w-4xl mx-auto space-y-10">
              
              <section className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black uppercase opacity-40 mb-6 tracking-[0.2em] text-right">إعدادات الهوية</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 mr-2 block text-right">اسم المطعم (انجليزي)</label>
                    <input className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 mr-2 block text-right">اسم المطعم (عربي)</label>
                    <input className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold text-right" value={settings.restaurantNameAr} onChange={e => updateSettings("restaurantNameAr", e.target.value)} />
                  </div>
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold text-right" placeholder="رقم الواتساب" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold text-right" placeholder="ساعات العمل" value={settings.openingHours} onChange={e => updateSettings("openingHours", e.target.value)} />
                  <input className="md:col-span-2 bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-bold text-right" placeholder="العنوان" value={settings.locationDesc} onChange={e => updateSettings("locationDesc", e.target.value)} />
                  
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div className="flex flex-col bg-black/40 border border-white/10 p-4 rounded-xl">
                      <span className="text-[9px] font-black uppercase opacity-40 mb-2">اللون الأساسي</span>
                      <input type="color" value={settings.primaryColor} onChange={e => updateSettings("primaryColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border-0 bg-transparent" />
                    </div>
                    <div className="flex flex-col bg-black/40 border border-white/10 p-4 rounded-xl">
                      <span className="text-[9px] font-black uppercase opacity-40 mb-2">لون الخلفية</span>
                      <input type="color" value={settings.bgColor} onChange={e => updateSettings("bgColor", e.target.value)} className="w-full h-8 rounded cursor-pointer border-0 bg-transparent" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black uppercase opacity-40 mb-6 tracking-[0.2em] text-right">الأصناف / Categories</h3>
                <div className="flex flex-wrap justify-end gap-2 mb-6">
                  {categories.map(c => (
                    <div key={c} className="bg-white/10 px-5 py-2.5 rounded-xl flex items-center gap-4 text-[11px] font-black uppercase border border-white/5 shadow-inner">
                      <button onClick={() => deleteCategory(c)} className="text-red-500 font-black hover:scale-150 transition-transform">×</button>
                      {c}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={addCategory} className="bg-white text-black px-8 rounded-2xl font-black uppercase text-[12px] shadow-lg">إضافة</button>
                  <input className="flex-1 bg-black/40 border border-white/10 p-5 rounded-2xl text-sm font-bold text-right" placeholder="صنف جديد" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                </div>
              </section>

              <section className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black uppercase opacity-40 mb-6 tracking-[0.2em] text-right">إدارة الوجبات / Manage Items</h3>
                
                {/* Add New Item Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 pb-10 border-b border-white/5">
                  <input className="md:col-span-2 bg-black/40 border border-white/10 p-5 rounded-2xl text-lg font-black text-right" placeholder="اسم الوجبة" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <textarea className="md:col-span-2 bg-black/40 border border-white/10 p-5 rounded-2xl text-sm font-bold text-right h-24 resize-none" placeholder="وصف الوجبة (اختياري)" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="bg-orange-500/10 border border-orange-500/30 p-5 rounded-2xl text-sm font-black text-orange-400 placeholder:text-orange-900" placeholder="سعر العرض" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                    <input className="bg-black/40 border border-white/10 p-5 rounded-2xl text-sm font-black text-right" placeholder="السعر" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  </div>
                  <select className="bg-black/40 border border-white/10 p-5 rounded-2xl text-sm font-black text-right" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} >
                    {categories.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                  <input className="md:col-span-2 bg-black/40 border border-white/10 p-5 rounded-2xl text-sm font-bold text-right" placeholder="رابط صورة الوجبة" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={addNewItem} className="md:col-span-2 py-6 rounded-2xl font-black uppercase text-[14px] tracking-[0.3em] shadow-2xl transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}>حفظ الوجبة</button>
                </div>

                {/* List Current Items to Delete */}
                <div className="space-y-4">
                  <h4 className="text-[9px] font-black uppercase opacity-30 text-right">قائمة الوجبات الحالية (للحذف)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {menuItems.map(item => (
                      <div key={item.id} className="bg-black/30 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                        <button onClick={() => deleteItem(item.id)} className="bg-red-500/10 text-red-500 p-2 px-4 rounded-xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">حذف</button>
                        <div className="text-right">
                          <p className="font-black text-sm">{item.name}</p>
                          <p className="text-[10px] opacity-40">{item.category} • {item.price.toLocaleString()} د.ع</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          {/* Header */}
          <header className="pt-10 pb-8 px-6 text-center">
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

          {/* 🔥 DEALS */}
          {discountItems.length > 0 && (
            <section className="py-6">
              <div className="max-w-6xl mx-auto">
                <div className="px-6 flex items-center justify-center mb-6" dir="rtl">
                   <h2 className="text-[22px] font-black uppercase italic" style={{ color: settings.primaryColor }}>عروض اليوم 🔥 Hot Deals</h2>
                </div>
                <div className="flex gap-6 px-6 overflow-x-auto no-scrollbar pb-8 snap-x">
                  {discountItems.map(item => (
                    <div key={item.id} className="snap-center shrink-0 w-80 rounded-[3rem] p-7 text-white relative overflow-hidden shadow-2xl" style={{ backgroundColor: settings.primaryColor }}>
                      <div className="relative z-10">
                        <div className="mb-6">
                          <span className="bg-white/20 backdrop-blur-md text-[10px] font-black px-5 py-2 rounded-full border border-white/20">
                            توفير: {(item.price - item.salePrice).toLocaleString()} IQD
                          </span>
                        </div>
                        <h3 className="text-3xl font-black uppercase leading-[0.9] mb-8 tracking-tighter text-right">{item.name}</h3>
                        <div className="flex justify-between items-end">
                           <button onClick={() => addToCart(item)} className="bg-white w-14 h-14 rounded-full flex items-center justify-center font-black shadow-2xl text-2xl" style={{ color: settings.primaryColor }}>＋</button>
                           <div className="text-right">
                             <p className="text-sm font-black opacity-60 line-through mb-1">{item.price.toLocaleString()} IQD</p>
                             <p className="text-3xl font-black tracking-tighter">{item.salePrice.toLocaleString()} <span className="text-xs">د.ع</span></p>
                          </div>
                        </div>
                      </div>
                      <img src={item.image} className="absolute -top-6 -left-6 w-48 h-48 object-cover opacity-30 -rotate-12 rounded-[4rem]" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 🍔 CATEGORY MENU */}
          <div className="py-8 bg-transparent">
            <div className="max-w-6xl mx-auto flex gap-3 px-6 overflow-x-auto no-scrollbar justify-start md:justify-center" dir="rtl">
              <button 
                onClick={() => setActiveCategory("الكل")}
                className={`shrink-0 px-10 py-4 rounded-[2rem] text-[14px] font-black transition-all ${activeCategory === "الكل" ? 'bg-black text-white' : 'bg-white text-slate-900 border-2 border-black/5'}`}
              >
                الكل
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-10 py-4 rounded-[2rem] text-[14px] font-black transition-all ${activeCategory === cat ? 'text-white' : 'bg-white text-slate-900 border-2 border-black/5'}`}
                  style={activeCategory === cat ? { backgroundColor: settings.primaryColor } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* GRID */}
          <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" dir="rtl">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-20">
                <p className="text-4xl font-black italic uppercase">قريباً / Coming Soon</p>
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className="bg-white rounded-[3rem] p-5 flex flex-col border-2 border-black/5 shadow-xl hover:shadow-2xl transition-all relative">
                  <div className="w-full aspect-square rounded-[2.5rem] overflow-hidden bg-slate-100 relative mb-5">
                    <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                    {item.salePrice && (
                      <div className="absolute top-4 left-4 bg-red-600 text-white px-4 py-2 rounded-2xl font-black text-[10px] uppercase shadow-xl animate-pulse">
                        عرض
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="mb-4">
                      <h3 className="text-xl font-black text-slate-950 leading-tight mb-1">{item.name}</h3>
                      <p className="text-[11px] text-slate-400 font-bold leading-tight" dir="rtl">{item.desc || "ألذ وجبة في كربلاء"}</p>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div className="text-right">
                        {item.salePrice ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 line-through mb-0.5">{item.price.toLocaleString()} د.ع</span>
                            <p className="font-black text-xl tracking-tighter" style={{ color: settings.primaryColor }}>
                              {item.salePrice.toLocaleString()} <span className="text-[10px]">د.ع</span>
                            </p>
                          </div>
                        ) : (
                          <p className="font-black text-xl tracking-tighter" style={{ color: settings.primaryColor }}>
                            {item.price.toLocaleString()} <span className="text-[10px]">د.ع</span>
                          </p>
                        )}
                      </div>
                      
                      {cart[item.id] ? (
                        <div className="flex items-center bg-black text-white rounded-2xl p-1 shadow-lg">
                          <button onClick={() => removeFromCart(item.id)} className="w-9 h-9 font-black hover:bg-white/10 rounded-xl text-xl">－</button>
                          <span className="w-7 text-center font-black text-sm">{cart[item.id]}</span>
                          <button onClick={() => addToCart(item)} className="w-9 h-9 font-black hover:bg-white/10 rounded-xl text-xl">＋</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} className="px-7 py-3.5 bg-slate-950 text-white rounded-2xl font-black text-[12px] uppercase shadow-lg active:scale-95 transition-transform">
                          إضافة +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </main>

          {/* FLOATING CART */}
          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-6">
              <button 
                onClick={() => setIsCheckoutOpen(true)} 
                className="w-full bg-black text-white p-3 rounded-full shadow-2xl flex items-center justify-between hover:scale-[1.05] active:scale-95 transition-all"
              >
                <div className="flex items-center gap-4 pl-2" dir="ltr">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl shadow-inner" style={{ backgroundColor: settings.primaryColor }}>
                    {Object.values(cart).reduce((a,b)=>a+b,0)}
                  </div>
                  <div className="text-left leading-none">
                    <p className="text-xl font-black">{cartTotal.toLocaleString()} IQD</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Review Order / مراجعة الطلب</p>
                  </div>
                </div>
                <div className="pr-8 font-black text-[11px] uppercase italic">اطلب الآن 🔥</div>
              </button>
            </div>
          )}

          {/* CHECKOUT MODAL */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
              <div className="bg-white w-full max-w-xl rounded-[4rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]" dir="rtl">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-4xl font-black italic">إتمام الطلب 📝</h2>
                  <button onClick={() => setIsCheckoutOpen(false)} className="w-14 h-14 bg-slate-100 rounded-full font-black text-3xl flex items-center justify-center transition-colors">×</button>
                </div>
                <div className="bg-slate-50 p-7 rounded-[3rem] border-2 border-slate-100 mb-8 space-y-3">
                    {Object.entries(cart).map(([id, q]) => {
                      const item = menuItems.find(m => m.id === id);
                      return item && (
                        <div key={id} className="flex justify-between text-sm font-black">
                          <span className="text-slate-900">{q}x {item.name}</span>
                          <span className="opacity-40">{( (item.salePrice || item.price) * q).toLocaleString()} د.ع</span>
                        </div>
                      )
                    })}
                    <div className="border-t-2 border-slate-200 mt-5 pt-5 flex justify-between items-center">
                      <span className="text-[12px] font-black uppercase opacity-40">المجموع النهائي</span>
                      <span className="text-4xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} <span className="text-sm">د.ع</span></span>
                    </div>
                </div>
                <div className="space-y-4 mb-10">
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl text-lg border-2 border-slate-100 font-black text-right outline-none focus:border-orange-500 transition-all" placeholder="الاسم الكامل" />
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl text-lg border-2 border-slate-100 font-black text-right outline-none focus:border-orange-500 transition-all" placeholder="رقم الهاتف" />
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl text-lg h-32 border-2 border-slate-100 font-black text-right outline-none focus:border-orange-500 transition-all resize-none" placeholder="العنوان بالتفصيل" />
                </div>
                <button 
                  disabled={!address || !customerName || !customerPhone} 
                  onClick={handleCheckout} 
                  className="w-full py-7 bg-[#25D366] text-white font-black rounded-3xl text-[16px] shadow-2xl disabled:opacity-30 disabled:grayscale transition-all"
                >
                  إرسال الطلب عبر الواتساب
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}