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

// SPEED BOOST: Enable Offline Persistence
try {
  enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-pro-v1';

const getMenuRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

// 🔑 UPDATED PASSWORD
const OWNER_PASSWORD = "12345"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  
  const [menuItems, setMenuItems] = useState(() => {
    const saved = localStorage.getItem('kb_menu_cache');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('kb_cat_cache');
    return saved ? JSON.parse(saved) : ["Burgers", "Drinks", "Mandi"];
  });

  const [cart, setCart] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [showError, setShowError] = useState(false);

  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    tagline: "Best Grill in the City",
    primaryColor: "#ea580c", 
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "Karbala, City Center"
  });

  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
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
      localStorage.setItem('kb_menu_cache', JSON.stringify(data));
    }, () => setDataLoaded(true));

    const unsubSettings = onSnapshot(getSettingsRef(), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.categories)) {
           setCategories(data.categories);
           localStorage.setItem('kb_cat_cache', JSON.stringify(data.categories));
        }
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

  const updateCloudItem = async (id, field, value) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'menu', id);
    try { await updateDoc(itemRef, { [field]: value }); } catch (e) {}
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
    if (activeCategory === "All") return menuItems;
    return menuItems.filter(item => item.category === activeCategory);
  }, [menuItems, activeCategory]);

  const handleCheckout = () => {
    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
    const waUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`🔥 ${settings.restaurantName} ORDER 🔥\n\n${items}\n\n💰 TOTAL: ${cartTotal.toLocaleString()} IQD\n📍 ADDR: ${address}`)}`;
    window.open(waUrl);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-100 antialiased">
      
      {/* 🛠 NAVIGATION */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl">
        <button 
          onClick={() => navigateTo("customer")}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white shadow-lg' : 'text-slate-400'}`}
          style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}
        >
          Menu
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
              {/* Business Settings */}
              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">Store Setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Store Name" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="WhatsApp" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Opening Hours" value={settings.openingHours} onChange={e => updateSettings("openingHours", e.target.value)} />
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Location" value={settings.locationDesc} onChange={e => updateSettings("locationDesc", e.target.value)} />
                </div>
              </section>

              {/* Category Management */}
              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">Menu Categories</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {categories.map(c => (
                    <div key={c} className="bg-white/10 px-4 py-2 rounded-xl flex items-center gap-3 text-[10px] font-black uppercase">
                      {c} <button onClick={() => deleteCategory(c)} className="text-red-500 font-bold">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="New Category..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                  <button onClick={addCategory} className="bg-white text-black px-6 rounded-xl font-black uppercase text-[10px]">Add</button>
                </div>
              </section>

              {/* Add Item */}
              <section className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <h3 className="text-sm font-black uppercase opacity-40 mb-6">New Item</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input className="col-span-2 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <select className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Price" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  <input className="col-span-2 bg-black/40 border border-white/10 p-4 rounded-xl text-sm" placeholder="Image Link" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={addNewItem} className="col-span-2 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Save to Menu</button>
                </div>
              </section>

              {/* List Items */}
              <div className="space-y-4">
                {menuItems.map(item => (
                  <div key={item.id} className="bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                    <div className="flex items-center gap-4">
                      <img src={item.image} className="w-12 h-12 rounded-lg object-cover bg-slate-800" />
                      <div>
                        <p className="font-bold text-xs uppercase">{item.name}</p>
                        <p className="text-[10px] opacity-40">{item.category} • {item.price} IQD</p>
                      </div>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-red-500 text-[10px] font-black uppercase px-4">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          {/* Mobile Header */}
          <header className="pt-24 pb-12 px-6 text-center bg-white">
             <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-tight">
                {settings.restaurantName}
             </h1>
             <p className="text-slate-400 text-[9px] font-black tracking-[0.6em] uppercase mt-2">{settings.tagline}</p>
          </header>

          {/* 🍔 CATEGORY SELECTOR (Horizontal Scroll) */}
          <div className="sticky top-[68px] z-[900] bg-slate-50/80 backdrop-blur-lg py-4 border-b border-slate-200">
            <div className="flex gap-2 px-6 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveCategory("All")}
                className={`shrink-0 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === "All" ? 'bg-black text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
              >
                All
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === cat ? 'text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
                  style={activeCategory === cat ? { backgroundColor: settings.primaryColor } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 📱 MOBILE LIST VIEW */}
          <main className="max-w-xl mx-auto px-4 py-8 space-y-4">
            {filteredItems.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                <p className="font-black uppercase text-xs">Nothing in {activeCategory} yet...</p>
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className="bg-white rounded-[2rem] p-3 flex gap-4 border border-slate-100 shadow-sm items-center">
                  <div className="w-24 h-24 shrink-0 rounded-[1.5rem] overflow-hidden bg-slate-50">
                    <img src={item.image || 'https://via.placeholder.com/200'} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1 py-1 pr-2">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-sm font-black uppercase italic tracking-tight leading-tight">{item.name}</h3>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mb-3 line-clamp-1">{item.desc || "Prepared fresh daily."}</p>
                    
                    <div className="flex justify-between items-end">
                      <p className="font-black text-sm" style={{ color: settings.primaryColor }}>
                        {item.price.toLocaleString()} <span className="text-[8px] opacity-60">IQD</span>
                      </p>
                      
                      {cart[item.id] ? (
                        <div className="flex items-center bg-slate-900 text-white rounded-xl p-0.5 scale-90 origin-right">
                          <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 font-black">－</button>
                          <span className="w-6 text-center font-black text-[11px]">{cart[item.id]}</span>
                          <button onClick={() => addToCart(item)} className="w-8 h-8 font-black">＋</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => addToCart(item)} 
                          className="px-4 py-2 bg-slate-50 rounded-xl font-black uppercase text-[9px] tracking-wider border border-slate-100 active:bg-black active:text-white transition-colors"
                        >
                          Add +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </main>

          {/* 🛒 FLOATING CART TOTAL */}
          {cartTotal > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
              <button 
                onClick={() => setIsCheckoutOpen(true)} 
                className="w-full bg-slate-950 text-white p-2 rounded-full shadow-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3 pl-2">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg" style={{ backgroundColor: settings.primaryColor }}>
                    {Object.values(cart).reduce((a,b)=>a+b,0)}
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-black">{cartTotal.toLocaleString()} IQD</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">In your tray</p>
                  </div>
                </div>
                <div className="pr-6 font-black text-[10px] uppercase tracking-[0.2em]">Checkout →</div>
              </button>
            </div>
          )}

          {/* Checkout Modal */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 animate-in slide-in-from-bottom-20">
                <h2 className="text-2xl font-black italic uppercase mb-4 tracking-tighter">Where to send?</h2>
                <textarea 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  className="w-full p-5 bg-slate-50 rounded-2xl text-sm h-28 mb-6 outline-none border border-slate-100 focus:border-orange-500 font-bold" 
                  placeholder="Street / Building / House No." 
                />
                <button 
                  disabled={!address.trim()} 
                  onClick={handleCheckout} 
                  className="w-full py-5 bg-[#25D366] text-white font-black rounded-2xl text-[10px] uppercase tracking-widest disabled:opacity-50"
                >
                  Send to WhatsApp
                </button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-4 text-slate-400 font-black text-[9px] uppercase tracking-widest">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}