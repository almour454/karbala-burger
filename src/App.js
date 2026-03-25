import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence
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

// 🛡️ HARDCODED APP ID - This prevents data loss on refresh
const FIXED_APP_ID = "karbala-burger-production-v1"; 

const OWNER_PASSWORD = "KarbalaGrill2024"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("Connecting...");
  const [dbError, setDbError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const pendingIdRef = useRef(null);

  // App State
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["Burgers", "Drinks", "Mandi", "Appetizers"]);
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

  // 1. AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setAuthStatus("Auth Error");
        setDbError("Authentication failed. Check Firebase console.");
      }
    };

    initAuth();
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthStatus("Connected");
    });
  }, []);

  // 2. REAL-TIME CLOUD SYNC
  useEffect(() => {
    if (!user) return;

    // Listen for Menu
    const menuRef = collection(db, 'artifacts', FIXED_APP_ID, 'public', 'data', 'menu');
    const unsubMenu = onSnapshot(menuRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMenuItems(items);
      setIsDataLoaded(true);
      
      if (pendingIdRef.current && items.some(i => i.id === pendingIdRef.current)) {
        setIsSaving(false);
        pendingIdRef.current = null;
      }
    }, (err) => setDbError("Cloud Sync Error: " + err.message));

    // Listen for Settings
    const settingsRef = doc(db, 'artifacts', FIXED_APP_ID, 'public', 'data', 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...snap.data() }));
      }
    });

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  const safeWrite = async (action) => {
    if (!user) return setDbError("Wait for connection...");
    setIsSaving(true);
    try {
      await action();
    } catch (e) {
      setDbError("Save failed: " + e.message);
      setIsSaving(false);
    }
  };

  const addNewItem = () => {
    if (!newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
    pendingIdRef.current = id;
    
    safeWrite(async () => {
      await setDoc(doc(db, 'artifacts', FIXED_APP_ID, 'public', 'data', 'menu', id), {
        ...newItem,
        id,
        price: Number(newItem.price),
        salePrice: newItem.salePrice ? Number(newItem.salePrice) : null,
        createdAt: new Date().toISOString()
      });
      setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: "Burgers" });
    });
  };

  const deleteItem = (id) => safeWrite(async () => {
    await deleteDoc(doc(db, 'artifacts', FIXED_APP_ID, 'public', 'data', 'menu', id));
    setIsSaving(false);
  });

  const updateSetting = (key, val) => safeWrite(async () => {
    await setDoc(doc(db, 'artifacts', FIXED_APP_ID, 'public', 'data', 'settings', 'global'), { [key]: val }, { merge: true });
    setIsSaving(false);
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
    <div className="min-h-screen bg-[#fafafa] text-[#1a1a1a] font-sans">
      
      {/* 🛠️ SYSTEM STATUS */}
      {dbError && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white p-2 text-[10px] font-black uppercase text-center z-[9999]">
          {dbError} <button onClick={() => window.location.reload()} className="underline ml-2">Reload</button>
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black/90 backdrop-blur-xl p-1 rounded-full border border-white/10 shadow-2xl">
        <button onClick={() => setView("customer")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}>Menu</button>
        <button onClick={() => setView("owner")} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-400'}`}>Admin</button>
      </nav>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6">
            <div className="w-full max-w-sm text-center">
              <h2 className="text-white text-4xl font-black italic uppercase mb-8 tracking-tighter">Owner Login</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-white/5 border border-white/10 p-6 rounded-3xl text-white text-center mb-4 outline-none focus:border-orange-500 transition-colors" placeholder="••••••••" />
              <button onClick={() => passInput === OWNER_PASSWORD ? setIsUnlocked(true) : setDbError("Wrong Password")} className="w-full py-6 bg-orange-600 text-white font-black rounded-3xl uppercase text-[10px] tracking-widest hover:bg-orange-500 transition-colors">Enter Kitchen</button>
              <div className="mt-8 flex items-center justify-center gap-2">
                <div className={`w-2 h-2 rounded-full ${authStatus === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{authStatus}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto pt-32 pb-40 px-6 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                <h3 className="text-sm font-black uppercase mb-6 opacity-30">Shop Settings</h3>
                <div className="space-y-4">
                  <input className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-transparent focus:border-orange-500 outline-none" placeholder="Shop Name" value={settings.restaurantName} onChange={e => setSettings({...settings, restaurantName: e.target.value})} onBlur={e => updateSetting("restaurantName", e.target.value)} />
                  <input className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-transparent focus:border-orange-500 outline-none" placeholder="WhatsApp Number" value={settings.whatsapp} onChange={e => setSettings({...settings, whatsapp: e.target.value})} onBlur={e => updateSetting("whatsapp", e.target.value)} />
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                <h3 className="text-sm font-black uppercase mb-6 opacity-30">Add Product</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none" placeholder="Item Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  <input className="bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none" placeholder="Price IQD" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                  <select className="bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none" placeholder="Image URL (Optional)" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                  <button onClick={addNewItem} disabled={isSaving} className="col-span-2 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50">
                    {isSaving ? "Syncing..." : "Add to Menu"}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase px-4 opacity-30 tracking-widest">Live Menu ({menuItems.length})</h3>
              {!isDataLoaded ? (
                <div className="p-20 text-center animate-pulse font-black uppercase text-xs text-slate-300">Loading Cloud Data...</div>
              ) : (
                menuItems.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center justify-between border border-slate-100 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden">
                        <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=100'} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="font-black uppercase text-xs">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{item.price.toLocaleString()} IQD</p>
                      </div>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="px-4 py-2 text-red-500 font-black text-[10px] uppercase hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">Remove</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="pt-40 pb-20 px-6 text-center max-w-4xl mx-auto">
            <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-none mb-6">
              {settings.restaurantName}
            </h1>
            <div className="h-1 w-20 bg-orange-600 mx-auto mb-6"></div>
            <p className="text-[10px] font-black uppercase tracking-[0.8em] text-slate-400 leading-loose">{settings.tagline}</p>
          </header>

          <main className="max-w-6xl mx-auto px-6">
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <section key={cat} className="mb-24">
                <div className="flex items-center gap-6 mb-12">
                  <h2 className="text-3xl font-black italic uppercase tracking-tight">{cat}</h2>
                  <div className="flex-1 h-px bg-slate-200"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {items.map(item => (
                    <div key={item.id} className="group relative">
                      <div className="aspect-[4/5] rounded-[3rem] overflow-hidden bg-slate-100 mb-6 shadow-sm border border-slate-100">
                        <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                      
                      <div className="px-2">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-black uppercase italic tracking-tight">{item.name}</h3>
                          <p className="font-black text-orange-600">{item.price.toLocaleString()} <span className="text-[8px] uppercase">IQD</span></p>
                        </div>
                        <p className="text-[11px] text-slate-400 mb-6 font-bold leading-relaxed line-clamp-2">The finest ingredients grilled to perfection by the masters of Karbala.</p>
                        
                        {cart[item.id] ? (
                          <div className="flex bg-black text-white rounded-2xl p-1 items-center">
                            <button onClick={() => removeFromCart(item.id)} className="w-12 h-12 flex items-center justify-center font-black text-lg hover:text-orange-500 transition-colors">－</button>
                            <span className="flex-1 text-center font-black text-xs">{cart[item.id]} IN TRAY</span>
                            <button onClick={() => addToCart(item)} className="w-12 h-12 flex items-center justify-center font-black text-lg hover:text-orange-500 transition-colors">＋</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} className="w-full py-4 rounded-2xl bg-white border border-slate-200 shadow-sm font-black uppercase text-[10px] tracking-widest hover:bg-black hover:text-white hover:border-black transition-all">Add to Tray</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {/* Floating Cart Button */}
          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-[2000] animate-in slide-in-from-bottom-10">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white p-2 rounded-full shadow-2xl flex items-center overflow-hidden">
                <div className="bg-orange-600 h-14 w-14 rounded-full flex items-center justify-center font-black text-xs italic">
                  {Object.values(cart).reduce((a,b)=>a+b, 0)}
                </div>
                <div className="flex-1 px-6 text-left">
                  <p className="text-[8px] font-black uppercase opacity-40">Complete Order</p>
                  <p className="text-lg font-black italic tracking-tight">{cartTotal.toLocaleString()} IQD</p>
                </div>
                <div className="pr-8 font-black text-[10px] uppercase tracking-widest animate-pulse">Checkout →</div>
              </button>
            </div>
          )}

          {/* Modal */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
              <div className="bg-white w-full max-w-lg rounded-t-[3rem] md:rounded-[4rem] p-10 md:p-14 animate-in slide-in-from-bottom-20">
                <div className="w-12 h-1 bg-slate-100 mx-auto mb-8 rounded-full md:hidden"></div>
                <h2 className="text-4xl font-black italic uppercase mb-2 tracking-tighter">Confirm Order</h2>
                <p className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest">Sent via WhatsApp to the kitchen</p>
                
                <div className="max-h-40 overflow-y-auto mb-8 space-y-2 pr-2">
                   {Object.entries(cart).map(([id, q]) => {
                     const itm = menuItems.find(m=>m.id===id);
                     return (
                       <div key={id} className="flex justify-between text-xs font-black uppercase italic">
                         <span>{q}x {itm?.name}</span>
                         <span className="text-slate-300">{(itm?.price * q).toLocaleString()} IQD</span>
                       </div>
                     );
                   })}
                </div>

                <textarea className="w-full p-6 bg-slate-50 rounded-3xl h-32 mb-6 border border-slate-100 outline-none focus:ring-2 ring-orange-500 font-bold text-sm" placeholder="Neighborhood, Street, House No..." value={address} onChange={e => setAddress(e.target.value)} />
                <button onClick={() => {
                   const msg = `*NEW ORDER - AL KARBALA BURGER*\n\n${Object.entries(cart).map(([id, q]) => `• ${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n')}\n\n*Total:* ${cartTotal.toLocaleString()} IQD\n*Address:* ${address}`;
                   window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                }} className="w-full py-6 bg-[#25D366] text-white font-black rounded-3xl uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-transform">Confirm & Send to WhatsApp</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-4 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">Go Back</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}