import React, { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc
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

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-pro-v1';

const getMenuRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "KarbalaGrill2024"; 

// Speed Helper: Optimized Image Component
const SafeImage = ({ src, alt, className, priority = false }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-slate-200 ${className}`}>
      <img 
        src={src || 'https://via.placeholder.com/400x300?text=No+Image'} 
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-300" />}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  
  // Load initial data from LocalStorage for "Instant-On" feel
  const [menuItems, setMenuItems] = useState(() => {
    const saved = localStorage.getItem(`menu_${appId}`);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem(`cats_${appId}`);
    return saved ? JSON.parse(saved) : ["Burgers", "Drinks", "Mandi"];
  });

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(`settings_${appId}`);
    return saved ? JSON.parse(saved) : {
      restaurantName: "AL KARBALA BURGER",
      tagline: "Best Grill in the City",
      primaryColor: "#ea580c",
      whatsapp: "964780000000",
      openingHours: "12:00 PM - 12:00 AM",
      locationDesc: "Karbala, City Center"
    };
  });

  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(menuItems.length === 0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", desc: "", image: "", category: "Burgers" });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      setView(hash === "admin" ? "owner" : "customer");
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateTo = (newView) => {
    window.location.hash = newView === "owner" ? "admin" : "";
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) { console.error("Auth fail", e); }
    };
    initAuth();
    
    const unsubAuth = onAuthStateChanged(auth, setUser);

    const unsubMenu = onSnapshot(getMenuRef(), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMenuItems(data);
      localStorage.setItem(`menu_${appId}`, JSON.stringify(data));
      setLoading(false); 
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    const unsubSettings = onSnapshot(getSettingsRef(), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.categories) {
          setCategories(data.categories);
          localStorage.setItem(`cats_${appId}`, JSON.stringify(data.categories));
        }
        setSettings(prev => {
          const updated = { ...prev, ...data };
          localStorage.setItem(`settings_${appId}`, JSON.stringify(updated));
          return updated;
        });
      }
    });

    return () => { unsubAuth(); unsubMenu(); unsubSettings(); };
  }, []);

  const cartTotal = useMemo(() => Object.entries(cart).reduce((t, [id, q]) => {
    const item = menuItems.find(m => m.id === id);
    return item ? t + ((item.salePrice || item.price) * q) : t;
  }, 0), [cart, menuItems]);

  const groupedMenu = useMemo(() => categories.reduce((acc, cat) => {
    const items = menuItems.filter(i => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {}), [categories, menuItems]);

  const updateSettings = async (f, v) => await setDoc(getSettingsRef(), { [f]: v }, { merge: true });
  const addToCart = (i) => setCart(p => ({ ...p, [i.id]: (p[i.id] || 0) + 1 }));
  const removeFromCart = (id) => setCart(p => {
    const n = { ...p };
    if (n[id] > 1) n[id]--; else delete n[id];
    return n;
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-slate-100 border-t-orange-500 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Firing up the grill...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased overflow-x-hidden" style={{ "--primary": settings.primaryColor }}>
      
      {/* PERSISTENT NAV */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-2xl">
        <button onClick={() => navigateTo("customer")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'bg-[var(--primary)] text-white' : 'text-slate-400'}`}>Menu</button>
        <button onClick={() => navigateTo("owner")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-400'}`}>Admin</button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
            <form onSubmit={e => { e.preventDefault(); passInput === OWNER_PASSWORD ? setIsUnlocked(true) : alert("Wrong Password"); }} className="w-full max-w-md bg-white/5 p-12 rounded-[3rem] border border-white/10">
              <h2 className="text-white text-2xl font-black italic uppercase mb-8 tracking-tighter">Kitchen Access</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-black p-5 rounded-2xl text-white text-center border border-white/10 mb-4 outline-none focus:border-orange-500" placeholder="Passphrase" />
              <button type="submit" className="w-full py-5 rounded-2xl bg-[var(--primary)] text-white font-black uppercase text-xs tracking-widest">Unlock</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-32 max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
                <h1 className="text-4xl font-black italic uppercase">Management</h1>
                <button onClick={() => setIsUnlocked(false)} className="text-xs font-bold text-red-500 uppercase px-4 py-2 bg-red-500/10 rounded-lg">Lock System</button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-20 bg-white/5 p-8 rounded-[3rem]">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Shop Name</label>
                  <input className="w-full bg-black p-4 rounded-xl border border-white/5" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">WhatsApp Number</label>
                  <input className="w-full bg-black p-4 rounded-xl border border-white/5" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                </div>
             </div>

             <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10 mb-20">
                <h3 className="text-lg font-black uppercase mb-6 text-orange-500 italic">Add To Menu</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input placeholder="Item Name" className="bg-black p-4 rounded-xl" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <input placeholder="Price (IQD)" className="bg-black p-4 rounded-xl" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  <select className="bg-black p-4 rounded-xl" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Image Link" className="bg-black p-4 rounded-xl" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={async () => {
                    const id = "i" + Date.now();
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {...newItem, id, price: parseInt(newItem.price)});
                    setNewItem({ name: "", price: "", desc: "", image: "", category: "Burgers" });
                  }} className="md:col-span-2 py-5 bg-[var(--primary)] rounded-xl font-black uppercase text-xs">Add Dish</button>
                </div>
             </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="pt-32 pb-20 px-6 text-center bg-white border-b border-slate-100">
             <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-[0.8] mb-6">
                {settings.restaurantName}
             </h1>
             <p className="text-[10px] font-black tracking-[0.5em] text-slate-400 uppercase">{settings.tagline}</p>
             <div className="mt-8 flex flex-col items-center gap-2">
                <span className="bg-slate-950 text-white text-[9px] font-black px-5 py-2 rounded-full uppercase tracking-widest">{settings.openingHours}</span>
             </div>
          </header>

          <main className="max-w-6xl mx-auto px-6 py-20 space-y-32">
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <section key={cat}>
                <h2 className="text-4xl font-black italic uppercase mb-10 tracking-tighter flex items-center gap-4">
                  <span className="w-12 h-1 bg-[var(--primary)] rounded-full"></span>
                  {cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {items.map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm flex flex-col group hover:shadow-xl transition-all duration-500">
                      <SafeImage src={item.image} alt={item.name} className="h-64" priority={idx < 3} />
                      <div className="p-8 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-xl font-black uppercase italic leading-tight">{item.name}</h3>
                          <span className="font-black text-orange-600 text-lg">{item.price.toLocaleString()} <small className="text-[9px]">IQD</small></span>
                        </div>
                        <p className="text-slate-400 text-[11px] font-medium leading-relaxed mb-8 flex-1">{item.desc || "Prepared fresh with the finest Karbala spices."}</p>
                        
                        <div className="flex items-center gap-2">
                          {cart[item.id] ? (
                            <div className="flex-1 flex items-center bg-slate-950 text-white rounded-2xl overflow-hidden shadow-lg">
                              <button onClick={() => removeFromCart(item.id)} className="flex-1 py-4 font-black hover:bg-white/10 active:scale-90 transition-transform">-</button>
                              <span className="flex-1 text-center font-black">{cart[item.id]}</span>
                              <button onClick={() => addToCart(item)} className="flex-1 py-4 font-black hover:bg-white/10 active:scale-90 transition-transform">+</button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item)} className="flex-1 py-4 rounded-2xl border-2 border-slate-100 font-black uppercase text-[10px] tracking-widest hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-all active:scale-95">Add to Tray</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {/* Quick Checkout */}
          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] w-full max-w-md px-6 animate-in slide-in-from-bottom-10">
               <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-5 rounded-full shadow-2xl flex items-center justify-between group active:scale-95 transition-transform border border-white/10">
                  <div className="flex flex-col items-start ml-4">
                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Total Bill</span>
                     <span className="text-xl font-black" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</span>
                  </div>
                  <div className="bg-[var(--primary)] px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest">Order Now</div>
               </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
               <div className="bg-white w-full max-w-md rounded-t-[3rem] md:rounded-[3rem] p-10 shadow-2xl">
                  <div className="flex justify-between items-center mb-10">
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter">Delivery Info</h2>
                    <button onClick={() => setIsCheckoutOpen(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full font-black">✕</button>
                  </div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block ml-2">Location in Karbala</label>
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[2rem] text-sm h-32 mb-8 border-2 border-transparent focus:border-orange-500 outline-none font-bold transition-all" placeholder="House number, Street, Neighborhood..." />
                  <button disabled={!address.trim()} onClick={() => {
                    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
                    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`🍔 NEW ORDER\n\n${items}\n\nTotal: ${cartTotal.toLocaleString()} IQD\n\n📍 Address:\n${address}`)}`);
                  }} className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl text-[10px] uppercase tracking-widest disabled:opacity-50 shadow-xl active:scale-95 transition-transform">Complete Order on WhatsApp</button>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}