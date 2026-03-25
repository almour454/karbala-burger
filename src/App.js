import React, { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
// ⚡ Firestore Lite for speed, but with all administrative functions restored
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc,
  updateDoc
} from "firebase/firestore/lite"; 
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

const OWNER_PASSWORD = "KarbalaGrill2024"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  
  // 🚀 INSTANT RENDER
  const [menuItems, setMenuItems] = useState(() => {
    try {
      const saved = localStorage.getItem('kb_menu_cache');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  
  const [categories, setCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('kb_cat_cache');
      return saved ? JSON.parse(saved) : ["Burgers", "Drinks", "Mandi"];
    } catch (e) { return ["Burgers", "Drinks", "Mandi"]; }
  });

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('kb_settings_cache');
      return saved ? JSON.parse(saved) : {
        restaurantName: "AL KARBALA BURGER",
        tagline: "Best Grill in the City",
        primaryColor: "#ea580c", 
        whatsapp: "964780000000",
        openingHours: "12:00 PM - 12:00 AM",
        locationDesc: "Karbala, City Center"
      };
    } catch (e) { return { restaurantName: "AL KARBALA BURGER", primaryColor: "#ea580c" }; }
  });

  const [cart, setCart] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [showError, setShowError] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
  const [newCatInput, setNewCatInput] = useState("");

  // Hash Navigation
  useEffect(() => {
    const handleHash = () => setView(window.location.hash === "#admin" ? "owner" : "customer");
    window.addEventListener("hashchange", handleHash);
    handleHash();
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const navigateTo = (v) => { window.location.hash = v === "owner" ? "admin" : ""; };

  // 🔥 DATA FETCH
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);

        const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
        const menuSnap = await getDocs(menuRef);
        const menuData = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
        const settingsSnap = await getDoc(settingsRef);
        
        if (isMounted) {
          if (menuData.length > 0) {
            setMenuItems(menuData);
            localStorage.setItem('kb_menu_cache', JSON.stringify(menuData));
          }
          if (settingsSnap.exists()) {
            const sData = settingsSnap.data();
            setSettings(prev => ({ ...prev, ...sData }));
            localStorage.setItem('kb_settings_cache', JSON.stringify(sData));
            if (sData.categories) {
              setCategories(sData.categories);
              localStorage.setItem('kb_cat_cache', JSON.stringify(sData.categories));
            }
          }
          setDataLoaded(true);
        }
      } catch (err) {
        if (isMounted) setDataLoaded(true);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) {
        setUser(u);
        if (u) fetchData();
      }
    });
    return () => { isMounted = false; unsubscribe(); };
  }, []);

  // 🛠️ RESTORED ADMIN ACTIONS
  const updateSettings = async (field, value) => {
    if (!user) return;
    const nextSettings = { ...settings, [field]: value };
    setSettings(nextSettings);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { [field]: value }, { merge: true });
  };

  const addCategory = async () => {
    if (!newCatInput.trim() || !user) return;
    const updated = [...new Set([...categories, newCatInput.trim()])];
    setCategories(updated);
    await updateSettings("categories", updated);
    setNewCatInput("");
  };

  const deleteCategory = async (cat) => {
    if (!user) return;
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    await updateSettings("categories", updated);
  };

  const addNewItem = async () => {
    if (!newItem.name || !newItem.price || !user) return;
    const id = "item_" + Date.now();
    const itemData = {
      ...newItem,
      id,
      price: parseInt(newItem.price) || 0,
      salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null
    };
    setMenuItems(prev => [...prev, itemData]);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), itemData);
    setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: newItem.category });
  };

  const deleteItem = async (id) => {
    if (!user) return;
    setMenuItems(prev => prev.filter(i => i.id !== id));
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

  const groupedMenu = useMemo(() => categories.reduce((acc, cat) => {
    const items = menuItems.filter(i => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {}), [categories, menuItems]);

  const handleCheckout = () => {
    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
    const waUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`🔥 ${settings.restaurantName} ORDER 🔥\n\n${items}\n\n💰 TOTAL: ${cartTotal.toLocaleString()} IQD\n📍 ADDR: ${address}`)}`;
    window.open(waUrl);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased">
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/95 backdrop-blur-2xl p-2 rounded-full border border-white/10 shadow-2xl scale-90 md:scale-100">
        <button onClick={() => navigateTo("customer")} className={`px-10 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white' : 'text-slate-500 hover:text-white'}`} style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}>Menu</button>
        <button onClick={() => navigateTo("owner")} className={`px-10 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>Admin</button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <form onSubmit={(e) => { e.preventDefault(); if(passInput === OWNER_PASSWORD) setIsUnlocked(true); else setShowError(true); }} className="bg-white/5 border border-white/10 p-12 rounded-[4rem] w-full max-w-md text-center">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl rotate-3" style={{ backgroundColor: settings.primaryColor }}><span className="text-4xl text-white">🔒</span></div>
              <h2 className="text-white text-3xl font-black italic uppercase mb-2 tracking-tighter">Kitchen Access</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className={`w-full bg-black/40 border ${showError ? 'border-red-500' : 'border-white/10'} p-6 rounded-3xl text-white text-center text-lg outline-none mb-6`} placeholder="Password" />
              <button type="submit" className="w-full py-7 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest transition-all" style={{ backgroundColor: settings.primaryColor }}>Login</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-40 pb-60 max-w-6xl mx-auto">
            <h1 className="text-5xl font-black italic uppercase mb-10" style={{ color: settings.primaryColor }}>Owner HQ</h1>
            
            {/* Global Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
               <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10">
                 <p className="text-[10px] font-black uppercase text-slate-500 mb-4">Shop Name</p>
                 <input className="w-full bg-black/40 p-4 rounded-xl outline-none" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
               </div>
               <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10">
                 <p className="text-[10px] font-black uppercase text-slate-500 mb-4">WhatsApp</p>
                 <input className="w-full bg-black/40 p-4 rounded-xl outline-none" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
               </div>
            </div>

            {/* Restored Category Management */}
            <div className="bg-white/5 p-10 rounded-[4rem] border border-white/10 mb-12">
              <h3 className="text-xl font-black uppercase mb-6 italic">Menu Sections</h3>
              <div className="flex flex-wrap gap-3 mb-6">
                {categories.map(c => (
                  <div key={c} className="bg-white/10 px-5 py-3 rounded-2xl flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase">{c}</span>
                    <button onClick={() => deleteCategory(c)} className="text-red-500 font-bold hover:scale-125 transition-transform">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <input className="flex-1 bg-black/40 p-5 rounded-2xl outline-none border border-white/10" placeholder="New Section Name..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                <button onClick={addCategory} className="bg-white text-black px-10 rounded-2xl font-black uppercase text-[10px]">Add Section</button>
              </div>
            </div>

            {/* Restored Item Add */}
            <div className="bg-white/5 p-10 rounded-[4rem] border border-white/10 mb-12">
              <h3 className="text-xl font-black uppercase mb-8 italic" style={{ color: settings.primaryColor }}>Add New Dish</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <input className="bg-black/40 p-5 rounded-2xl outline-none" placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <select className="bg-black/40 p-5 rounded-2xl outline-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="bg-black/40 p-5 rounded-2xl outline-none" placeholder="Standard Price (IQD)" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <input className="bg-black/40 p-5 rounded-2xl outline-none" placeholder="Sale Price (Optional)" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                <input className="bg-black/40 p-5 rounded-2xl outline-none md:col-span-2" placeholder="Description / Ingredients" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                <input className="bg-black/40 p-5 rounded-2xl outline-none md:col-span-2" placeholder="Image URL (Unsplash/Direct link)" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
              </div>
              <button onClick={addNewItem} className="w-full py-6 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95" style={{ backgroundColor: settings.primaryColor }}>Put it on Menu</button>
            </div>

            {/* Item Management List */}
            <div className="space-y-4">
              {menuItems.map(item => (
                <div key={item.id} className="bg-white/5 p-6 rounded-3xl flex items-center justify-between border border-white/5 group">
                  <div className="flex items-center gap-4">
                    <img src={item.image} className="w-16 h-16 rounded-2xl object-cover bg-slate-800" loading="lazy" />
                    <div>
                      <p className="font-black text-sm uppercase tracking-tight">{item.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{item.category} • {item.salePrice ? <s>{item.price}</s> : item.price} {item.salePrice && item.salePrice} IQD</p>
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="text-red-500 text-[10px] font-black uppercase p-4 hover:bg-red-500/10 rounded-xl transition-colors">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="py-24 px-6 text-center bg-white relative">
            <h1 className="text-7xl md:text-9xl font-black italic uppercase tracking-tighter leading-[0.8]">
              {settings.restaurantName.split(' ')[0]} <br/> 
              <span style={{ color: settings.primaryColor }}>{settings.restaurantName.split(' ').slice(1).join(' ')}</span>
            </h1>
            <p className="mt-8 text-slate-400 text-[10px] font-black tracking-[1em] uppercase">{settings.tagline}</p>
          </header>

          <main className="max-w-6xl mx-auto px-6 py-12">
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <section key={cat} className="mb-24">
                <h2 className="text-4xl font-black italic uppercase mb-10 tracking-tighter border-l-8 pl-6" style={{ borderColor: settings.primaryColor }}>{cat}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {items.map(item => (
                    <div key={item.id} className="bg-white rounded-[3.5rem] p-4 shadow-sm border border-slate-100 transition-all hover:shadow-xl group">
                      <div className="h-60 rounded-[3rem] overflow-hidden bg-slate-100 mb-6 relative">
                        <img src={item.image || 'https://via.placeholder.com/400'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-5 py-2 rounded-2xl font-black shadow-xl">
                          {item.salePrice ? (
                            <span className="flex items-center gap-2">
                              <s className="text-slate-400 text-[10px]">{item.price.toLocaleString()}</s>
                              <span>{item.salePrice.toLocaleString()}</span>
                            </span>
                          ) : item.price.toLocaleString()} <span className="text-[10px]">IQD</span>
                        </div>
                      </div>
                      <div className="px-6 pb-6">
                        <h3 className="text-xl font-black uppercase italic mb-2">{item.name}</h3>
                        <p className="text-slate-400 text-[11px] mb-8 line-clamp-2 h-8 leading-relaxed">{item.desc || "Freshly grilled in Karbala center with authentic local flavor."}</p>
                        {cart[item.id] ? (
                          <div className="flex items-center bg-slate-950 text-white rounded-2xl p-1">
                            <button onClick={() => removeFromCart(item.id)} className="flex-1 py-3 font-black">－</button>
                            <span className="flex-1 text-center font-black">{cart[item.id]}</span>
                            <button onClick={() => addToCart(item)} className="flex-1 py-3 font-black">＋</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} className="w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-slate-200 hover:text-white transition-all active:scale-95" style={{ "--hover-bg": settings.primaryColor }} onMouseEnter={e => e.target.style.backgroundColor = settings.primaryColor} onMouseLeave={e => e.target.style.backgroundColor = ""}>Add to Tray</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] w-full max-w-sm px-6">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-5 rounded-[2.5rem] shadow-2xl flex items-center justify-between border border-white/10 active:scale-95 transition-all">
                <div className="text-left pl-4">
                  <p className="text-2xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</p>
                </div>
                <span className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Checkout</span>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md">
              <div className="bg-white w-full max-w-md rounded-[4rem] p-12 relative animate-in zoom-in-95 duration-200">
                <button onClick={() => setIsCheckoutOpen(false)} className="absolute top-8 right-10 text-2xl font-black">×</button>
                <h2 className="text-4xl font-black italic uppercase mb-8 tracking-tighter">Delivery</h2>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl text-sm h-32 mb-8 outline-none border border-slate-100 focus:border-orange-500 font-bold" placeholder="Area / Street / Landmark in Karbala..." />
                <button disabled={!address.trim()} onClick={handleCheckout} className="w-full py-8 bg-[#25D366] text-white font-black rounded-3xl text-[11px] uppercase tracking-widest disabled:opacity-50 shadow-xl transition-all active:scale-95">Send WhatsApp</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}