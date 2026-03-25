import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  onSnapshot
} from "firebase/firestore"; 
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";

// --- FIREBASE CONFIG ---
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
const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'karbala-burger-v1';

const OWNER_PASSWORD = "KarbalaGrill2024"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("Connecting...");
  const [dbError, setDbError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingIdRef = useRef(null); // Track the item we are currently trying to add

  // App State
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["Burgers", "Drinks", "Mandi"]);
  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    tagline: "The King of Grill",
    primaryColor: "#ea580c", 
    whatsapp: "964780000000"
  });

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });

  // 1. AUTHENTICATION (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      setAuthStatus("Attempting Login...");
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setAuthStatus("Auth Failed: " + err.code);
        setDbError(`Login Failed: ${err.message}. Ensure 'Anonymous' is enabled in Firebase Auth.`);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setAuthStatus("Ready");
        setDbError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNC (WITH SMART LOADING CLEARING)
  useEffect(() => {
    if (!user) return;

    // Sync Menu
    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const unsubMenu = onSnapshot(menuRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMenuItems(items);

      // SMART CHECK: If the item we just added appears in the list, stop the "Publishing" state
      if (pendingIdRef.current && items.some(i => i.id === pendingIdRef.current)) {
        setIsSaving(false);
        pendingIdRef.current = null;
      }
    }, (err) => {
      console.error(err);
      setDbError("Sync Error: " + err.message);
    });

    // Sync Settings
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSettings(prev => ({ ...prev, ...data }));
        if (data.categories) setCategories(data.categories);
      }
    });

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  // Enhanced Firestore Helper
  const safeWrite = async (action) => {
    if (!user) {
      setDbError("Not Authenticated. Please wait for the 'Ready' status.");
      return;
    }
    
    setIsSaving(true);
    
    // Safety timeout: If it takes more than 5 seconds, we force-clear the UI
    const timeout = setTimeout(() => {
      if (isSaving) {
        setIsSaving(false);
        pendingIdRef.current = null;
      }
    }, 5000);

    try {
      await action();
      setDbError(null);
    } catch (e) {
      console.error(e);
      setDbError("Write Failed: " + e.message);
      setIsSaving(false);
      pendingIdRef.current = null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const addNewItem = () => {
    if (!newItem.name || !newItem.price) {
      setDbError("Please enter a name and price.");
      return;
    }
    
    const id = "item_" + Date.now();
    pendingIdRef.current = id; // Tell the sync effect to watch for this ID

    safeWrite(async () => {
      const itemData = {
        ...newItem,
        id,
        price: parseInt(newItem.price),
        salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), itemData);
      setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
      // Note: setIsSaving(false) will be handled by the onSnapshot listener for a smoother UI experience
    });
  };

  const deleteItem = (id) => safeWrite(async () => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
    setIsSaving(false);
  });

  const updateSetting = (key, val) => safeWrite(async () => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { [key]: val }, { merge: true });
    setIsSaving(false);
  });

  // UI Handlers
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-orange-100">
      
      {/* 🛠️ ERROR NOTIFICATION */}
      {dbError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-[5000] animate-bounce">
          <div className="bg-red-600 text-white p-4 rounded-2xl text-center text-xs font-black shadow-2xl flex items-center justify-between">
            <span>🚨 {dbError}</span>
            <button onClick={() => setDbError(null)} className="bg-white/20 p-2 rounded-lg">✕</button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black p-1.5 rounded-full border border-white/10 shadow-2xl backdrop-blur-md">
        <button onClick={() => setView("customer")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white' : 'text-slate-500'}`} style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}>Menu</button>
        <button onClick={() => setView("owner")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500'}`}>Admin</button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
            <div className="bg-white/5 border border-white/10 p-10 rounded-[3rem] w-full max-w-sm text-center">
              <div className="w-16 h-16 bg-orange-500 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl rotate-6">🔐</div>
              <h2 className="text-white text-2xl font-black uppercase italic mb-6">Staff Only</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-black p-5 rounded-2xl text-white text-center mb-4 outline-none border border-white/10" placeholder="Password" />
              <button onClick={() => passInput === OWNER_PASSWORD ? setIsUnlocked(true) : setDbError("Wrong Password")} className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest">Unlock Grill</button>
              <p className="mt-6 text-[10px] text-slate-500 uppercase font-black">Connection: {authStatus}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto pt-32 pb-40 px-6">
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 mb-10">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black uppercase italic" style={{ color: settings.primaryColor }}>Shop Settings</h2>
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${authStatus === 'Ready' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                  {authStatus}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="Shop Name" value={settings.restaurantName} onChange={e => updateSetting("restaurantName", e.target.value)} />
                <input className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="WhatsApp Number" value={settings.whatsapp} onChange={e => updateSetting("whatsapp", e.target.value)} />
              </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 mb-10">
              <h2 className="text-3xl font-black uppercase italic mb-8">Add New Item</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <input className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <select className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="Price (IQD)" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <input className="bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="Sale Price (Optional)" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                <input className="md:col-span-2 bg-slate-50 p-5 rounded-2xl outline-none border border-slate-100" placeholder="Image URL" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
              </div>
              <button 
                onClick={addNewItem} 
                disabled={isSaving || authStatus !== 'Ready'} 
                className="w-full py-6 bg-slate-950 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest disabled:opacity-50 relative overflow-hidden active:scale-95 transition-transform"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin text-lg">⏳</span> Serving...
                  </span>
                ) : "Add to Menu"}
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-black uppercase italic px-4">Current Menu ({menuItems.length})</h3>
              {menuItems.length === 0 && <p className="p-10 text-center text-slate-400 font-bold italic">The grill is empty...</p>}
              {menuItems.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center justify-between border border-slate-100 shadow-sm animate-in fade-in zoom-in duration-300">
                  <div className="flex items-center gap-4">
                    <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200'} className="w-16 h-16 rounded-2xl object-cover" />
                    <div>
                      <p className="font-black uppercase text-sm">{item.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{item.category} • {item.price.toLocaleString()} IQD</p>
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="p-4 text-red-500 font-black text-xs uppercase hover:bg-red-50 rounded-2xl transition-colors">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="pt-40 pb-20 px-6 text-center">
            <h1 className="text-7xl md:text-9xl font-black italic uppercase tracking-tighter leading-none mb-6">
              {settings.restaurantName}
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[1em] text-slate-400">{settings.tagline}</p>
          </header>

          <main className="max-w-6xl mx-auto px-6">
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <section key={cat} className="mb-20">
                <h2 className="text-4xl font-black italic uppercase mb-10 border-b-4 border-black inline-block pb-2">{cat}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {items.map(item => (
                    <div key={item.id} className="bg-white rounded-[3rem] p-4 border border-slate-100 shadow-sm group hover:shadow-2xl transition-all">
                      <div className="h-64 rounded-[2.5rem] overflow-hidden mb-6 bg-slate-100">
                        <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      </div>
                      <div className="px-4 pb-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-black uppercase italic">{item.name}</h3>
                          <div className="text-right">
                            {item.salePrice ? (
                              <p className="font-black text-orange-600">{item.salePrice.toLocaleString()} <span className="text-[8px]">IQD</span></p>
                            ) : (
                              <p className="font-black">{item.price.toLocaleString()} <span className="text-[8px]">IQD</span></p>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed">{item.desc || "Freshly grilled and served hot."}</p>
                        
                        {cart[item.id] ? (
                          <div className="flex bg-slate-950 text-white rounded-2xl p-1">
                            <button onClick={() => removeFromCart(item.id)} className="flex-1 py-3 font-black text-lg">－</button>
                            <span className="flex-1 text-center py-3 font-black">{cart[item.id]}</span>
                            <button onClick={() => addToCart(item)} className="flex-1 py-3 font-black text-lg">＋</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} className="w-full py-4 rounded-2xl border-2 border-slate-100 font-black uppercase text-[10px] tracking-widest hover:bg-slate-950 hover:text-white transition-all">Add to Tray</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm px-6 z-[2000]">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-6 rounded-[2.5rem] shadow-2xl flex items-center justify-between group overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[8px] font-black uppercase text-slate-500 mb-1">Total Order</p>
                  <p className="text-2xl font-black italic tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</p>
                </div>
                <div className="bg-orange-600 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest relative z-10">Checkout</div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/20 rounded-full -mr-10 -mt-10 group-hover:scale-150 transition-transform"></div>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[3000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-md rounded-[4rem] p-12 animate-in slide-in-from-bottom-10">
                <h2 className="text-4xl font-black italic uppercase mb-8">Delivery Info</h2>
                <textarea className="w-full p-6 bg-slate-50 rounded-3xl h-32 mb-6 border border-slate-100 outline-none focus:ring-2 ring-orange-500 font-bold" placeholder="Your Address / Location..." value={address} onChange={e => setAddress(e.target.value)} />
                <button onClick={() => {
                   const msg = `*ORDER FROM BURGER APP*\n\n${Object.entries(cart).map(([id, q]) => `• ${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n')}\n\n*Total:* ${cartTotal} IQD\n*Address:* ${address}`;
                   window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                   setCart({}); setIsCheckoutOpen(false);
                }} className="w-full py-6 bg-[#25D366] text-white font-black rounded-3xl uppercase text-[10px] tracking-widest shadow-xl">Send Order via WhatsApp</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-4 py-4 text-slate-400 font-black uppercase text-[10px]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}