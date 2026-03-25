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
    bgColor: "#f8fafc",
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "Karbala, City Center"
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
    const text = `🔥 ${settings.restaurantName} ORDER 🔥\n\n👤 الاسم: ${customerName}\n📞 الهاتف: ${customerPhone}\n📍 العنوان: ${address}\n\n🛒 التفاصيل:\n${items}\n\n💰 المجموع: ${cartTotal.toLocaleString()} IQD`;
    const waUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`;
    window.open(waUrl);
  };

  return (
    <div className="min-h-screen font-sans selection:bg-orange-100 antialiased transition-colors duration-500" style={{ backgroundColor: settings.bgColor }}>
      
      {/* 🛠 NAVIGATION */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl">
        <button 
          onClick={() => navigateTo("customer")}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white shadow-lg' : 'text-slate-400'}`}
          style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}
        >
          Menu / المنيو
        </button>
        <button 
          onClick={() => navigateTo("owner")}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-400'}`}
        >
          Admin
        </button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <form onSubmit={handleAuthSubmit} className="bg-white/5 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center">
              <h2 className="text-white text-2xl font-black italic uppercase mb-6">Kitchen Admin</h2>
              <input 
                type="password"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                className={`w-full bg-black/40 border ${showError ? 'border-red-500' : 'border-white/10'} p-5 rounded-2xl text-white text-center outline-none focus:border-orange-500`}
                placeholder="Password"
              />
              <button type="submit" className="w-full mt-6 py-5 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Login</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-24 pb-40">
            <div className="max-w-4xl mx-auto space-y-10">
              
              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">Store Branding & Design</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Store Name (EN)" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="اسم المطعم (عربي)" value={settings.restaurantNameAr} onChange={e => updateSettings("restaurantNameAr", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="WhatsApp Number" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Opening Hours" value={settings.openingHours} onChange={e => updateSettings("openingHours", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Location" value={settings.locationDesc} onChange={e => updateSettings("locationDesc", e.target.value)} />
                  
                  <div className="flex items-center justify-between bg-black/40 border border-white/10 p-4 rounded-xl">
                    <div className="pr-2">
                      <p className="text-sm font-bold">Accent Color</p>
                    </div>
                    <input type="color" value={settings.primaryColor} onChange={e => updateSettings("primaryColor", e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                  </div>

                  <div className="flex items-center justify-between bg-black/40 border border-white/10 p-4 rounded-xl">
                    <div className="pr-2">
                      <p className="text-sm font-bold">App Background</p>
                    </div>
                    <input type="color" value={settings.bgColor} onChange={e => updateSettings("bgColor", e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                  </div>
                </div>
              </section>

              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">Categories / الاصناف</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {categories.map(c => (
                    <div key={c} className="bg-white/10 px-4 py-2 rounded-xl flex items-center gap-3 text-[10px] font-black uppercase">
                      {c} <button onClick={() => deleteCategory(c)} className="text-red-500 font-bold hover:scale-125 transition-transform">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="New Category (e.g. برجر)..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                  <button onClick={addCategory} className="bg-white text-black px-6 rounded-xl font-black uppercase text-[10px]">Add</button>
                </div>
              </section>

              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">Add Item / اضافة وجبة</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input className="md:col-span-2 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Item Name (e.g. برجر لحم)" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <select className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Price" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                    <input className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-sm text-orange-400 placeholder:text-orange-900" placeholder="Sale Price" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                  </div>
                  <input className="md:col-span-2 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Image URL" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={addNewItem} className="md:col-span-2 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Save Item</button>
                </div>
              </section>
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          {/* Header with Arabic/English mix */}
          <header className="pt-24 pb-12 px-6 text-center">
             <h1 className="text-5xl font-black italic uppercase tracking-tighter leading-tight drop-shadow-sm">
                {settings.restaurantName}
             </h1>
             <h2 className="text-3xl font-black text-slate-700/50 mt-1" style={{ fontFamily: 'sans-serif' }}>{settings.restaurantNameAr}</h2>
             
             <div className="mt-8 flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2 bg-black/5 px-4 py-1.5 rounded-full border border-black/5">
                   <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                   <span className="text-[10px] font-black uppercase opacity-70 tracking-widest">{settings.openingHours}</span>
                </div>
                <div className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                   📍 {settings.locationDesc}
                </div>
             </div>
          </header>

          {/* 🔥 HOT DEALS */}
          {discountItems.length > 0 && (
            <section className="pt-2 pb-10">
              <div className="max-w-6xl mx-auto">
                <div className="px-6 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex space-x-0.5">
                        <div className="w-1.5 h-4 bg-orange-500 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-6 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    </div>
                    <h2 className="text-[14px] font-black uppercase tracking-tighter italic" style={{ color: settings.primaryColor }}>العروض الساخنة 🔥 Hot Deals</h2>
                  </div>
                </div>
                <div className="flex gap-5 px-6 overflow-x-auto no-scrollbar pb-6 snap-x">
                  {discountItems.map(item => (
                    <div key={item.id} className="snap-start shrink-0 w-80 rounded-[2.5rem] p-6 text-white relative overflow-hidden shadow-2xl shadow-black/10 transition-transform active:scale-95" style={{ backgroundColor: settings.primaryColor }}>
                      <div className="relative z-10">
                        <div className="mb-4">
                          <span className="bg-white/20 backdrop-blur-md text-[9px] font-black px-4 py-2 rounded-full uppercase border border-white/30">
                            توفير: {(item.price - item.salePrice).toLocaleString()} IQD
                          </span>
                        </div>
                        <h3 className="text-2xl font-black uppercase leading-tight mb-8 tracking-tighter">{item.name}</h3>
                        <div className="flex justify-between items-end">
                          <div>
                             <p className="text-xs font-bold opacity-60 line-through decoration-white/50 decoration-2 mb-1">{item.price.toLocaleString()} IQD</p>
                             <p className="text-3xl font-black tracking-tighter">{item.salePrice.toLocaleString()} <span className="text-xs">IQD</span></p>
                          </div>
                          <button 
                            onClick={() => addToCart(item)}
                            className="bg-white w-14 h-14 rounded-full flex items-center justify-center font-black shadow-2xl shadow-black/20 hover:scale-110 active:rotate-45 transition-all text-2xl"
                            style={{ color: settings.primaryColor }}
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                      <img src={item.image} className="absolute -top-4 -right-4 w-44 h-44 object-cover opacity-25 -rotate-12 rounded-[3rem]" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 🍔 CATEGORY SELECTOR (Arabic Focused) */}
          <div className="sticky top-[68px] z-[900] py-4 bg-inherit backdrop-blur-md">
            <div className="max-w-6xl mx-auto flex gap-2 px-6 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveCategory("الكل")}
                className={`shrink-0 px-8 py-3.5 rounded-full text-[12px] font-black transition-all ${activeCategory === "الكل" ? 'bg-black text-white' : 'bg-white/40 border border-black/5 text-slate-500 hover:bg-white'}`}
              >
                الكل
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-8 py-3.5 rounded-full text-[12px] font-black transition-all ${activeCategory === cat ? 'text-white shadow-lg' : 'bg-white/40 border border-black/5 text-slate-500 hover:bg-white'}`}
                  style={activeCategory === cat ? { backgroundColor: settings.primaryColor } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* GRID */}
          <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" dir="rtl">
            {filteredItems.map(item => (
              <div key={item.id} className="group bg-white rounded-[2.5rem] p-4 flex gap-4 border border-black/5 shadow-sm hover:shadow-xl transition-all items-center text-right">
                <div className="w-28 h-28 shrink-0 rounded-[2rem] overflow-hidden bg-slate-50 relative">
                  <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div className="flex-1 flex flex-col justify-between py-1 h-28">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight">{item.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold leading-tight line-clamp-2 mt-1" dir="ltr">{item.desc || "Delicious grill special"}</p>
                  </div>
                  
                  <div className="flex justify-between items-end flex-row-reverse">
                    <div>
                      {item.salePrice ? (
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-300 line-through decoration-red-400 decoration-1 mb-0.5">{item.price.toLocaleString()} IQD</span>
                          <p className="font-black text-sm" style={{ color: settings.primaryColor }}>
                            {item.salePrice.toLocaleString()} <span className="text-[8px]">IQD</span>
                          </p>
                        </div>
                      ) : (
                        <p className="font-black text-sm" style={{ color: settings.primaryColor }}>
                          {item.price.toLocaleString()} <span className="text-[8px]">IQD</span>
                        </p>
                      )}
                    </div>
                    
                    {cart[item.id] ? (
                      <div className="flex items-center bg-black text-white rounded-2xl p-0.5">
                        <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 font-black hover:bg-white/10 rounded-xl">－</button>
                        <span className="w-5 text-center font-black text-[10px]">{cart[item.id]}</span>
                        <button onClick={() => addToCart(item)} className="w-7 h-7 font-black hover:bg-white/10 rounded-xl">＋</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item)} className="px-5 py-2.5 bg-slate-50 rounded-2xl font-black text-[10px] border border-slate-100 hover:bg-black hover:text-white transition-all">
                        اضافة +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </main>

          {/* CART TOTAL */}
          {cartTotal > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
              <button 
                onClick={() => setIsCheckoutOpen(true)} 
                className="w-full bg-slate-950 text-white p-2.5 rounded-full shadow-2xl flex items-center justify-between hover:scale-[1.03] active:scale-95 transition-all"
              >
                <div className="flex items-center gap-3 pl-2">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-base" style={{ backgroundColor: settings.primaryColor }}>
                    {Object.values(cart).reduce((a,b)=>a+b,0)}
                  </div>
                  <div className="text-left leading-tight">
                    <p className="text-xs font-black">{cartTotal.toLocaleString()} IQD</p>
                    <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Order Summary / اتمام الطلب</p>
                  </div>
                </div>
                <div className="pr-6 font-black text-[9px] uppercase tracking-[0.2em]">Go / اذهب →</div>
              </button>
            </div>
          )}

          {/* CHECKOUT MODAL */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl animate-in slide-in-from-bottom-20" dir="rtl">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">تاكيد الطلب</h2>
                  <button onClick={() => setIsCheckoutOpen(false)} className="w-9 h-9 bg-slate-100 rounded-full font-bold flex items-center justify-center">×</button>
                </div>
                <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 mb-6 space-y-2">
                    {Object.entries(cart).map(([id, q]) => {
                      const item = menuItems.find(m => m.id === id);
                      return item && (
                        <div key={id} className="flex justify-between text-[11px] font-bold uppercase tracking-tight">
                          <span>{q}x {item.name}</span>
                          <span className="opacity-40">{((item.salePrice || item.price) * q).toLocaleString()} IQD</span>
                        </div>
                      )
                    })}
                    <div className="border-t border-slate-200 mt-3 pt-3 flex justify-between items-end">
                      <span className="text-[9px] font-black uppercase opacity-40">المجموع الكلي</span>
                      <span className="text-2xl font-black" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</span>
                    </div>
                </div>
                <div className="space-y-3 mb-6">
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl text-sm border border-slate-100 font-bold" placeholder="الاسم الكامل" />
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl text-sm border border-slate-100 font-bold" placeholder="رقم الهاتف" />
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl text-sm h-24 border border-slate-100 font-bold resize-none" placeholder="العنوان بالتفصيل..." />
                </div>
                <button disabled={!address || !customerName || !customerPhone} onClick={handleCheckout} className="w-full py-5 bg-[#25D366] text-white font-black rounded-2xl text-[12px] uppercase tracking-widest shadow-lg shadow-[#25D366]/30">
                  ارسال الطلب عبر واتساب
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}