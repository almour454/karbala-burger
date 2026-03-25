import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc,
  setDoc, 
  deleteDoc
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

// Speed Helper: Image component with lazy loading and error handling
const SafeImage = ({ src, alt, className }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-slate-200 ${className}`}>
      <img 
        src={src || 'https://via.placeholder.com/400x300?text=No+Image'} 
        alt={alt}
        loading="lazy"
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-300" />}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["Burgers", "Drinks", "Mandi"]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
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
  const audioContext = useRef(null);

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
      } catch (e) {
        console.error("Auth fail", e);
      }
    };
    initAuth();
    const unsubAuth = onAuthStateChanged(auth, setUser);

    const unsubMenu = onSnapshot(getMenuRef(), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false); 
    }, () => setLoading(false));

    const unsubSettings = onSnapshot(getSettingsRef(), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.categories) setCategories(data.categories);
        setSettings(prev => ({ ...prev, ...data }));
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

  // Actions
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
        <div className="w-12 h-12 border-4 border-slate-100 border-t-orange-500 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Karbala's Best...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-100 antialiased overflow-x-hidden" style={{ "--primary": settings.primaryColor }}>
      
      {/* GLOBAL NAV */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-2xl transition-transform hover:scale-105">
        <button onClick={() => navigateTo("customer")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'bg-[var(--primary)] text-white' : 'text-slate-400'}`}>Menu</button>
        <button onClick={() => navigateTo("owner")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-400'}`}>Admin</button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <form onSubmit={e => { e.preventDefault(); passInput === OWNER_PASSWORD ? setIsUnlocked(true) : setShowError(true); }} className="w-full max-w-md bg-white/5 p-12 rounded-[3rem] border border-white/10 text-center">
              <h2 className="text-white text-2xl font-black italic uppercase mb-8">Secure Kitchen</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-black p-5 rounded-2xl text-white text-center border border-white/10 mb-4" placeholder="Password" />
              <button type="submit" className="w-full py-5 rounded-2xl bg-[var(--primary)] text-white font-black uppercase text-xs tracking-widest">Enter</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-32 max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
                <h1 className="text-4xl font-black italic uppercase">Settings</h1>
                <button onClick={() => setIsUnlocked(false)} className="text-xs font-bold text-red-500 uppercase">Exit</button>
             </div>
             
             {/* Simple Admin Fields */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-20 bg-white/5 p-8 rounded-[3rem]">
                <input placeholder="Name" className="bg-black p-4 rounded-xl border border-white/5" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                <input placeholder="WhatsApp" className="bg-black p-4 rounded-xl border border-white/5" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                <input placeholder="Color (#hex)" className="bg-black p-4 rounded-xl border border-white/5" value={settings.primaryColor} onChange={e => updateSettings("primaryColor", e.target.value)} />
                <input placeholder="Address" className="bg-black p-4 rounded-xl border border-white/5" value={settings.locationDesc} onChange={e => updateSettings("locationDesc", e.target.value)} />
             </div>

             {/* Add Item Form Simplified */}
             <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10 mb-20">
                <h3 className="text-lg font-black uppercase mb-6 text-orange-500">Add New Dish</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input placeholder="Dish Name" className="bg-black p-4 rounded-xl" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <input placeholder="Price" className="bg-black p-4 rounded-xl" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  <select className="bg-black p-4 rounded-xl" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Image URL" className="bg-black p-4 rounded-xl" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={async () => {
                    const id = "i" + Date.now();
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {...newItem, id, price: parseInt(newItem.price)});
                    setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
                  }} className="md:col-span-2 py-4 bg-[var(--primary)] rounded-xl font-black uppercase text-xs">Post Dish</button>
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
             <p className="text-[10px] font-black tracking-[0.8em] text-slate-400 uppercase">{settings.tagline}</p>
             <div className="mt-8 flex flex-col items-center gap-2">
                <span className="bg-slate-900 text-white text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest">{settings.openingHours}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{settings.locationDesc}</span>
             </div>
          </header>

          <main className="max-w-6xl mx-auto px-6 py-20 space-y-32">
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <section key={cat}>
                <h2 className="text-3xl font-black italic uppercase mb-10 tracking-tight border-l-4 border-[var(--primary)] pl-6">{cat}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {items.map(item => (
                    <div key={item.id} className="bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm flex flex-col group">
                      <SafeImage src={item.image} alt={item.name} className="h-56" />
                      <div className="p-8 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-xl font-black uppercase italic leading-tight">{item.name}</h3>
                          <span className="font-black text-orange-600">{item.price.toLocaleString()} <small className="text-[9px]">IQD</small></span>
                        </div>
                        <p className="text-slate-400 text-[11px] leading-relaxed mb-8 flex-1">{item.desc}</p>
                        
                        <div className="flex items-center gap-2">
                          {cart[item.id] ? (
                            <div className="flex-1 flex items-center bg-slate-900 text-white rounded-2xl overflow-hidden">
                              <button onClick={() => removeFromCart(item.id)} className="flex-1 py-4 font-black hover:bg-white/10">-</button>
                              <span className="flex-1 text-center font-black">{cart[item.id]}</span>
                              <button onClick={() => addToCart(item)} className="flex-1 py-4 font-black hover:bg-white/10">+</button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item)} className="flex-1 py-4 rounded-2xl border border-slate-200 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-colors">Add to Tray</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {/* Fixed Quick Checkout */}
          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] w-full max-w-md px-6">
               <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-5 rounded-full shadow-2xl flex items-center justify-between group active:scale-95 transition-transform">
                  <div className="flex flex-col items-start ml-4">
                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Your Tray</span>
                     <span className="text-xl font-black" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</span>
                  </div>
                  <div className="bg-[var(--primary)] px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest">Confirm Order</div>
               </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-950/60 backdrop-blur-md">
               <div className="bg-white w-full max-w-md rounded-t-[3rem] md:rounded-[3rem] p-10 animate-in slide-in-from-bottom-20">
                  <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-black italic uppercase">Checkout</h2>
                    <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-300 font-black">X</button>
                  </div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Delivery Address</label>
                  <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-6 bg-slate-50 rounded-2xl text-sm h-32 mb-8 border border-slate-100 outline-none focus:border-orange-500 font-bold" placeholder="District, Street, Landmark..." />
                  <button disabled={!address.trim()} onClick={() => {
                    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
                    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`🚀 NEW ORDER\n\n${items}\n\nTotal: ${cartTotal.toLocaleString()} IQD\nAddress: ${address}`)}`);
                  }} className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl text-xs uppercase tracking-widest disabled:opacity-50">Send WhatsApp Order</button>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}