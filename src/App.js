import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  onSnapshot,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getDocs,
  query,
  enableIndexedDbPersistence
} from "firebase/firestore"; 
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Use standard init first for better compatibility
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const OWNER_PASSWORD = "KarbalaGrill2024"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("Connecting...");
  const [dbError, setDbError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const pendingIdRef = useRef(null);

  // App State - Immediate Load from Local Storage to bypass "Loading" screens
  const [menuItems, setMenuItems] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const backup = localStorage.getItem("karbala_menu_backup");
      return backup ? JSON.parse(backup) : [];
    } catch (e) { return []; }
  });

  const [categories] = useState(["Burgers", "Drinks", "Mandi", "Appetizers"]);
  const [settings, setSettings] = useState(() => {
    if (typeof window === 'undefined') return { restaurantName: "AL KARBALA BURGER", tagline: "The King of Grill", whatsapp: "964780000000" };
    try {
      const backup = localStorage.getItem("karbala_settings_backup");
      return backup ? JSON.parse(backup) : { restaurantName: "AL KARBALA BURGER", tagline: "The King of Grill", whatsapp: "964780000000" };
    } catch (e) { return { restaurantName: "AL KARBALA BURGER", tagline: "The King of Grill", whatsapp: "964780000000" }; }
  });

  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return {};
    const saved = localStorage.getItem("karbala_cart");
    return saved ? JSON.parse(saved) : {};
  });

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });

  // Persistent Backups
  useEffect(() => {
    localStorage.setItem("karbala_cart", JSON.stringify(cart));
    if (menuItems.length > 0) localStorage.setItem("karbala_menu_backup", JSON.stringify(menuItems));
    localStorage.setItem("karbala_settings_backup", JSON.stringify(settings));
  }, [cart, menuItems, settings]);

  // Fail-safe: If we have cached items, we are "loaded" enough to show the UI
  useEffect(() => {
    if (menuItems.length > 0) {
      setIsDataLoaded(true);
    }
    const timer = setTimeout(() => {
      if (!isDataLoaded) setShowRetry(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isDataLoaded]);

  // 1. AUTHENTICATION (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setAuthStatus("Offline");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthStatus("Online");
    });
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNC (RULE 1 & 3)
  useEffect(() => {
    if (!user) return;

    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

    // Snapshot with explicit error handling and metadata tracking
    const unsubMenu = onSnapshot(menuRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (items.length > 0 || snap.metadata.fromCache === false) {
        setMenuItems(items);
        setIsDataLoaded(true);
        setShowRetry(false);
      }
      setDbError(null);
    }, (err) => {
      console.error("Firestore Menu Error:", err);
      // If we have items from localStorage, don't nag the user with an error bar
      if (menuItems.length === 0) setDbError("Connecting to Grill...");
    });

    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    }, (err) => console.error("Settings error:", err));

    return () => { unsubMenu(); unsubSettings(); };
  }, [user, appId]);

  const safeWrite = async (action) => {
    if (!user) {
      setDbError("Waiting for connection...");
      return;
    }
    setIsSaving(true);
    try {
      await action();
      setIsSaving(false);
    } catch (e) {
      console.error("Write error:", e);
      setDbError("Grill is busy. Try again.");
      setIsSaving(false);
    }
  };

  const addNewItem = () => {
    if (!newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
    safeWrite(async () => {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {
        ...newItem,
        id,
        price: Number(newItem.price),
        createdAt: new Date().toISOString()
      });
      setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
    });
  };

  const deleteItem = (id) => safeWrite(async () => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
  });

  const addToCart = (item) => setCart(p => ({ ...p, [item.id]: (p[item.id] || 0) + 1 }));
  const removeFromCart = (id) => setCart(p => {
    const n = { ...p };
    if (n[id] > 1) n[id]--; else delete n[id];
    return n;
  });

  const cartTotal = useMemo(() => Object.entries(cart).reduce((t, [id, q]) => {
    const item = menuItems.find(m => m.id === id);
    return item ? t + (item.price * q) : t;
  }, 0), [cart, menuItems]);

  const groupedMenu = useMemo(() => categories.reduce((acc, cat) => {
    const items = menuItems.filter(i => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {}), [categories, menuItems]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans">
      {dbError && (
        <div className="fixed top-0 left-0 w-full bg-orange-600 text-white p-2 text-[10px] font-black uppercase text-center z-[9999] shadow-lg">
          {dbError}
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-[9999] flex items-center gap-2 bg-black/80 text-white px-3 py-1.5 rounded-full text-[8px] font-black uppercase border border-white/10">
        <div className={`w-1.5 h-1.5 rounded-full ${authStatus === 'Online' ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500 animate-pulse'}`}></div>
        {authStatus}
      </div>

      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-xl p-1 rounded-full border border-white/10 shadow-2xl">
        <button onClick={() => setView("customer")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}>Menu</button>
        <button onClick={() => setView("owner")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-400'}`}>Admin</button>
      </nav>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6">
            <div className="w-full max-w-sm text-center">
              <h2 className="text-white text-3xl font-black italic uppercase mb-8 tracking-tighter">Kitchen Access</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-white/5 border border-white/10 p-6 rounded-3xl text-white text-center mb-4 outline-none focus:border-orange-500 transition-colors" placeholder="••••••••" />
              <button onClick={() => passInput === OWNER_PASSWORD ? setIsUnlocked(true) : setDbError("Wrong Password")} className="w-full py-6 bg-orange-600 text-white font-black rounded-3xl uppercase text-[10px] tracking-widest">Login</button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto pt-32 pb-40 px-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8">
              <h3 className="text-sm font-black uppercase mb-6 opacity-30">Add Product</h3>
              <div className="grid grid-cols-2 gap-3">
                <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <input className="bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" placeholder="Price (IQD)" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <select className="bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" placeholder="Image URL" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                <button onClick={addNewItem} disabled={isSaving || authStatus !== 'Online'} className="col-span-2 py-5 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest">
                  {isSaving ? "Syncing..." : "Save Product"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {menuItems.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center justify-between border border-slate-100">
                  <div className="flex items-center gap-4">
                    <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=100'} className="w-12 h-12 rounded-xl object-cover" />
                    <div><p className="font-black uppercase text-xs">{item.name}</p><p className="text-[10px] text-orange-600 font-bold">{Number(item.price).toLocaleString()} IQD</p></div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="px-4 py-2 text-red-500 font-black text-[10px] uppercase">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="pt-40 pb-20 px-6 text-center">
            <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter mb-6">{settings.restaurantName}</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.8em] text-slate-400">{settings.tagline}</p>
          </header>

          <main className="max-w-6xl mx-auto px-6">
            {!isDataLoaded && menuItems.length === 0 ? (
              <div className="text-center py-20 flex flex-col items-center">
                <div className="font-black uppercase text-[10px] tracking-widest opacity-20 animate-pulse mb-4">Warming the Grill...</div>
                {showRetry && (
                  <button 
                    onClick={() => window.location.reload()} 
                    className="px-6 py-3 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest animate-in fade-in zoom-in shadow-xl"
                  >
                    Force Restart
                  </button>
                )}
              </div>
            ) : (
              Object.entries(groupedMenu).length > 0 ? (
                Object.entries(groupedMenu).map(([cat, items]) => (
                  <section key={cat} className="mb-20">
                    <h2 className="text-3xl font-black italic uppercase mb-10 tracking-tight flex items-center gap-4">
                      {cat} <div className="h-1 flex-1 bg-slate-100 rounded-full"></div>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {items.map(item => (
                        <div key={item.id} className="bg-white rounded-[3rem] p-4 border border-slate-100 shadow-sm group">
                          <div className="aspect-square rounded-[2.5rem] overflow-hidden mb-6 bg-slate-50">
                            <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                          </div>
                          <div className="px-2 pb-2">
                            <div className="flex justify-between items-start mb-4">
                              <h3 className="text-xl font-black uppercase italic tracking-tighter">{item.name}</h3>
                              <p className="font-black text-orange-600">{Number(item.price).toLocaleString()} <span className="text-[8px]">IQD</span></p>
                            </div>
                            {cart[item.id] ? (
                              <div className="flex bg-black text-white rounded-2xl p-1 items-center">
                                <button onClick={() => removeFromCart(item.id)} className="w-12 h-12 flex items-center justify-center font-black">－</button>
                                <span className="flex-1 text-center font-black text-[10px]">{cart[item.id]} IN TRAY</span>
                                <button onClick={() => addToCart(item)} className="w-12 h-12 flex items-center justify-center font-black">＋</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(item)} className="w-full py-4 rounded-2xl bg-slate-50 font-black uppercase text-[10px] tracking-widest hover:bg-black hover:text-white transition-all">Add to Tray</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="text-center py-20">
                  <p className="font-black uppercase text-[10px] opacity-20">The menu is empty. Check Admin.</p>
                </div>
              )
            )}
          </main>
          
          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-[2000]">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white p-2 rounded-full shadow-2xl flex items-center">
                <div className="bg-orange-600 h-14 w-14 rounded-full flex items-center justify-center font-black italic">{Object.values(cart).reduce((a,b)=>a+b,0)}</div>
                <div className="flex-1 px-6 text-left font-black italic">{cartTotal.toLocaleString()} IQD</div>
                <div className="pr-8 font-black text-[10px] uppercase">Checkout →</div>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl">
                <h2 className="text-3xl font-black italic uppercase mb-6">Confirm Order</h2>
                <textarea className="w-full p-6 bg-slate-50 rounded-2xl h-32 mb-6 outline-none font-bold" placeholder="Delivery Address / Phone..." value={address} onChange={e => setAddress(e.target.value)} />
                <button onClick={() => {
                   const msg = `*NEW ORDER*\n\n${Object.entries(cart).map(([id, q]) => `• ${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n')}\n\n*Total:* ${cartTotal.toLocaleString()} IQD\n*Address:* ${address}`;
                   window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                }} className="w-full py-6 bg-[#25D366] text-white font-black rounded-2xl uppercase text-[10px] tracking-widest">Send WhatsApp</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-4 text-slate-400 font-black text-[10px] uppercase">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}