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
// This makes items load INSTANTLY if the user has visited before.
try {
  enableIndexedDbPersistence(db).catch(() => {
    // Silently fail if multiple tabs are open
  });
} catch (e) {}

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-pro-v1';

const getMenuRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "KarbalaGrill2024"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  
  // SPEED FIX: Initialize with data from LocalStorage if available for 0ms loading
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
  const audioContext = useRef(null);

  const playNotificationSound = () => {
    try {
      if (!audioContext.current) audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioContext.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

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

    // Listen to Menu - Faster connection
    const unsubMenu = onSnapshot(getMenuRef(), { includeMetadataChanges: true }, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMenuItems(data);
      setDataLoaded(true);
      // Update cache
      localStorage.setItem('kb_menu_cache', JSON.stringify(data));
    }, (error) => setDataLoaded(true));

    // Listen to Settings - Faster connection
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
      salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null
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

  const groupedMenu = useMemo(() => categories.reduce((acc, cat) => {
    const items = menuItems.filter(i => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {}), [categories, menuItems]);

  const discountedItems = useMemo(() => menuItems.filter(item => item.salePrice && item.salePrice < item.price), [menuItems]);

  const handleCheckout = () => {
    playNotificationSound();
    const items = Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n');
    const waUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`🔥 ${settings.restaurantName} ORDER 🔥\n\n${items}\n\n💰 TOTAL: ${cartTotal.toLocaleString()} IQD\n📍 ADDR: ${address}`)}`;
    window.open(waUrl);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-100 antialiased transition-opacity duration-700">
      
      {/* 🛠 TOP NAV */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/95 backdrop-blur-2xl p-2 rounded-full border border-white/10 shadow-2xl scale-90 md:scale-100">
        <button 
          onClick={() => navigateTo("customer")}
          className={`px-10 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white' : 'text-slate-500 hover:text-white'}`}
          style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}
        >
          View Menu
        </button>
        <button 
          onClick={() => navigateTo("owner")}
          className={`px-10 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
        >
          Kitchen Admin
        </button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <form onSubmit={handleAuthSubmit} className="bg-white/5 border border-white/10 p-12 rounded-[4rem] w-full max-w-md text-center backdrop-blur-md">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl rotate-3" style={{ backgroundColor: settings.primaryColor }}>
                <span className="text-4xl text-white">🔒</span>
              </div>
              <h2 className="text-white text-3xl font-black italic uppercase mb-2 tracking-tighter">Owner Access</h2>
              <input 
                type="password"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                className={`w-full bg-black/40 border ${showError ? 'border-red-500' : 'border-white/10'} p-6 rounded-3xl text-white text-center text-lg outline-none focus:border-orange-500 transition-all`}
                placeholder="Password"
              />
              <button type="submit" className="w-full mt-10 py-7 text-white font-black rounded-3xl text-[11px] uppercase tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Enter Kitchen</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-32 md:p-12 md:pt-40 pb-60">
            <header className="max-w-5xl mx-auto mb-20 flex justify-between items-end border-b border-white/5 pb-10">
              <div>
                <h1 className="text-5xl font-black italic uppercase tracking-tighter" style={{ color: settings.primaryColor }}>Kitchen HQ</h1>
                <p className="text-slate-500 text-[10px] font-bold tracking-[0.4em] mt-3 uppercase">Syncing Live with Customers</p>
              </div>
              <button onClick={() => setIsUnlocked(false)} className="bg-white/5 px-8 py-3 rounded-full text-slate-400 text-[10px] font-black uppercase hover:text-white hover:bg-red-600 transition-all">Logout</button>
            </header>

            {/* Global Settings Panel */}
            <div className="max-w-5xl mx-auto mb-16 bg-white/5 p-10 rounded-[4rem] border border-white/10">
              <h3 className="text-xl font-black italic uppercase mb-8 text-white">Business Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Restaurant Name</label>
                  <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Vibe / Tagline</label>
                  <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.tagline} onChange={e => updateSettings("tagline", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4">WhatsApp Number</label>
                  <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Theme Color (Hex)</label>
                  <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.primaryColor} onChange={e => updateSettings("primaryColor", e.target.value)} />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Opening Hours</label>
                   <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.openingHours} onChange={e => updateSettings("openingHours", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4">Physical Address</label>
                  <input className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl outline-none" value={settings.locationDesc} onChange={e => updateSettings("locationDesc", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Admin Add Category */}
            <div className="max-w-5xl mx-auto mb-16 bg-white/5 p-10 rounded-[4rem] border border-white/10">
              <h3 className="text-xl font-black italic uppercase mb-6 text-white">Sections</h3>
              <div className="flex flex-wrap gap-3 mb-8">
                {categories.map(c => (
                  <div key={String(c)} className="bg-white/10 px-5 py-3 rounded-2xl flex items-center gap-4 group">
                    <span className="text-[11px] font-black uppercase tracking-wider">{String(c)}</span>
                    <button onClick={() => deleteCategory(c)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <input 
                  placeholder="New Section (e.g. Pizza, Steaks)" 
                  className="flex-1 bg-black/40 border border-white/10 p-5 rounded-2xl outline-none focus:border-orange-500 text-sm"
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                />
                <button onClick={addCategory} className="bg-white text-black px-10 rounded-2xl font-black uppercase text-[10px] tracking-widest">Add Section</button>
              </div>
            </div>

            {/* Admin Add Item */}
            <div className="max-w-5xl mx-auto mb-24 bg-white/5 border border-white/10 p-12 rounded-[5rem]">
              <h3 className="text-2xl font-black italic uppercase mb-10" style={{ color: settings.primaryColor }}>Create New Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="md:col-span-2">
                  <input placeholder="Item Name" className="w-full bg-black/60 border border-white/10 p-6 rounded-3xl outline-none text-sm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <select className="w-full bg-black/60 border border-white/10 p-6 rounded-3xl outline-none text-sm appearance-none cursor-pointer" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} >
                    {categories.map(c => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
                  </select>
                </div>
                <input placeholder="Price (IQD)" className="w-full bg-black/60 border border-white/10 p-6 rounded-3xl outline-none text-sm" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <input placeholder="Offer Price (Optional)" className="w-full bg-black/60 border border-orange-500/20 p-6 rounded-3xl outline-none text-sm" style={{ color: settings.primaryColor }} value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                <input placeholder="Image Link (URL)" className="w-full md:col-span-2 bg-black/60 border border-white/10 p-6 rounded-3xl outline-none text-sm" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                <textarea placeholder="Description (Optional)" className="w-full md:col-span-4 bg-black/60 border border-white/10 p-6 rounded-3xl outline-none text-sm h-32 resize-none" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                <button onClick={addNewItem} className="md:col-span-4 py-8 rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-2xl" style={{ backgroundColor: settings.primaryColor }}>Post to Menu</button>
              </div>
            </div>

            {/* Existing Items - Interactive Editor */}
            <div className="max-w-5xl mx-auto space-y-20">
              {categories.map(cat => (
                <div key={String(cat)} className="space-y-8">
                  <h2 className="text-2xl font-black uppercase tracking-[0.4em] text-white italic">{String(cat)}</h2>
                  <div className="grid grid-cols-1 gap-6">
                    {menuItems.filter(i => i.category === cat).map(item => (
                      <div key={item.id} className="bg-white/5 border border-white/5 p-8 rounded-[3.5rem] flex items-center gap-8 group">
                        <img src={item.image || 'https://via.placeholder.com/150'} className="w-20 h-20 rounded-2xl object-cover bg-slate-800" loading="lazy" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                          <input className="bg-transparent border-b border-white/10 p-2 text-white font-bold" value={item.name} onChange={e => updateCloudItem(item.id, "name", e.target.value)} />
                          <div className="flex items-center gap-2">
                            <input className="bg-transparent border-b border-white/10 p-2 text-white w-full" value={item.price} onChange={e => updateCloudItem(item.id, "price", parseInt(e.target.value) || 0)} />
                            <span className="text-[8px] text-slate-500">IQD</span>
                          </div>
                          <button onClick={() => deleteItem(item.id)} className="bg-red-600/10 text-red-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all">Remove Item</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="pb-48">
          {/* Customer Header */}
          <header className="py-24 px-6 text-center bg-white relative overflow-hidden">
             <h1 className="text-6xl md:text-9xl font-black italic uppercase tracking-tighter leading-none mb-4">
                {settings.restaurantName.split(' ').slice(0,-1).join(' ')} <br/><span style={{ color: settings.primaryColor }}>{settings.restaurantName.split(' ').pop()}</span>
             </h1>
             <p className="text-slate-400 text-[10px] font-black tracking-[1em] uppercase">{settings.tagline}</p>
             <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{settings.openingHours}</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{settings.locationDesc}</span>
             </div>
          </header>

          {/* Featured Deals */}
          {discountedItems.length > 0 && (
            <div className="bg-slate-900 py-12">
               <div className="max-w-7xl mx-auto px-6 mb-8 flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full animate-ping" style={{ backgroundColor: settings.primaryColor }}></div>
                  <h2 className="text-white text-2xl font-black uppercase italic">Hot Offers</h2>
               </div>
               <div className="flex overflow-x-auto gap-6 px-6 no-scrollbar">
                  {discountedItems.map(item => (
                    <div key={item.id + "_sale"} className="shrink-0 w-80 bg-white/5 p-6 rounded-[3rem] border border-white/10">
                      <img src={item.image} className="w-full h-40 object-cover rounded-[2rem] mb-4 bg-slate-800" loading="lazy" />
                      <h4 className="text-white font-black uppercase mb-1 truncate">{item.name}</h4>
                      <div className="flex items-center gap-3">
                         <span className="font-black" style={{ color: settings.primaryColor }}>{(item.salePrice || item.price).toLocaleString()} IQD</span>
                         <span className="text-slate-500 line-through text-[10px]">{item.price.toLocaleString()}</span>
                      </div>
                      <button onClick={() => addToCart(item)} className="mt-4 w-full py-3 bg-white text-black font-black uppercase text-[10px] rounded-xl">Add to Tray</button>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Menu Sections */}
          <main className="max-w-7xl mx-auto px-6 py-20 space-y-32 min-h-[40vh]">
            {menuItems.length === 0 && !dataLoaded ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-orange-600 rounded-full animate-spin mb-6"></div>
                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">Loading Menu...</p>
              </div>
            ) : menuItems.length === 0 && dataLoaded ? (
              <div className="text-center py-32 opacity-20">
                <span className="text-6xl mb-6 block">🍽️</span>
                <h3 className="text-xl font-black uppercase italic">Menu is being prepared</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-2">The owner hasn't added items yet</p>
              </div>
            ) : (
              Object.entries(groupedMenu).map(([category, items]) => (
                <section key={String(category)}>
                  <h2 className="text-4xl font-black italic uppercase mb-12 tracking-tighter">{String(category)}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {items.map(item => (
                      <div key={item.id} className="bg-white rounded-[4rem] overflow-hidden border border-slate-100 shadow-sm flex flex-col group transition-transform hover:-translate-y-2">
                        <div className="h-64 overflow-hidden relative bg-slate-100">
                          <img src={item.image || 'https://via.placeholder.com/600x400?text=Karbala+Burger'} className="w-full h-full object-cover" alt="" loading="lazy" />
                          <div className="absolute top-6 right-6 bg-white px-4 py-2 rounded-2xl font-black text-lg shadow-lg">
                             {(item.salePrice || item.price).toLocaleString()} <small className="text-[10px]">IQD</small>
                          </div>
                        </div>
                        <div className="p-10 flex-1 flex flex-col">
                          <h3 className="text-2xl font-black uppercase mb-3 italic">{item.name}</h3>
                          <p className="text-slate-400 text-xs mb-8 flex-1">{item.desc || "The finest taste in the city."}</p>
                          {cart[item.id] ? (
                              <div className="flex items-center bg-slate-950 text-white rounded-3xl p-1 shadow-xl">
                                  <button onClick={() => removeFromCart(item.id)} className="flex-1 py-4 font-black">－</button>
                                  <span className="flex-1 text-center font-black">{cart[item.id]}</span>
                                  <button onClick={() => addToCart(item)} className="flex-1 py-4 font-black">＋</button>
                              </div>
                          ) : (
                              <button onClick={() => addToCart(item)} className="w-full py-5 bg-slate-50 text-slate-900 border border-slate-100 rounded-3xl font-black uppercase text-[10px] tracking-widest hover:text-white transition-all hover:border-transparent" style={{ "--hover-bg": settings.primaryColor }} onMouseEnter={e => e.target.style.backgroundColor = settings.primaryColor} onMouseLeave={e => e.target.style.backgroundColor = ""}>Add to Tray</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>

          {/* Floating Total */}
          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] w-full max-w-md px-6 animate-in slide-in-from-bottom-10">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-6 rounded-[3rem] shadow-2xl flex items-center justify-between border border-white/10">
                <div className="text-left pl-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</p>
                  <p className="text-3xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</p>
                </div>
                <span className="px-10 py-5 rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest" style={{ backgroundColor: settings.primaryColor }}>Order Now</span>
              </button>
            </div>
          )}

          {/* Checkout Modal */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
              <div className="bg-white w-full max-w-sm rounded-[4rem] p-10 shadow-2xl">
                <h2 className="text-4xl font-black italic uppercase mb-2 tracking-tighter">Delivery</h2>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl text-sm h-32 mb-8 outline-none border border-slate-100 focus:border-orange-500 font-bold" placeholder="Your Address (Neighborhood / Street)..." />
                <button disabled={!address.trim()} onClick={handleCheckout} className="w-full py-8 bg-[#25D366] text-white font-black rounded-3xl text-[11px] uppercase tracking-widest disabled:opacity-50">Order via WhatsApp</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-6 text-slate-400 font-black text-[10px] uppercase tracking-widest">Close</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}