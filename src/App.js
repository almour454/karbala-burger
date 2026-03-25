import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  onSnapshot,
  query
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
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const pendingIdRef = useRef(null);

  // App State
  const [menuItems, setMenuItems] = useState([]);
  const [categories] = useState(["Burgers", "Drinks", "Mandi", "Appetizers"]);
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

  // 1. MANDATORY AUTH (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      setAuthStatus("Logging in...");
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token && token !== "") {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setAuthStatus("Offline");
        setDbError("Database Connection Failed. Please refresh.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthStatus("Online");
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. REAL-TIME DATA (RULE 1 & 2)
  useEffect(() => {
    if (!user) return;

    // PUBLIC DATA PATH (RULE 1)
    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    
    const unsubMenu = onSnapshot(menuRef, 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMenuItems(items);
        setIsDataLoaded(true);
        
        // Clear loading state if our item appeared
        if (pendingIdRef.current && items.some(i => i.id === pendingIdRef.current)) {
          setIsSaving(false);
          pendingIdRef.current = null;
        }
      }, 
      (err) => {
        console.error("Firestore Read Error:", err);
        setDbError("Cloud Access Denied: " + err.code);
      }
    );

    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    });

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  const safeWrite = async (action) => {
    if (!user) {
      setDbError("You are not connected to the grill. Wait for 'Online' status.");
      return;
    }
    setIsSaving(true);
    setDbError(null);
    try {
      await action();
    } catch (e) {
      console.error("Write Error:", e);
      setDbError("DATABASE REJECTED SAVE: " + e.message);
      setIsSaving(false);
      pendingIdRef.current = null;
    }
  };

  const addNewItem = () => {
    if (!newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
    pendingIdRef.current = id;
    
    safeWrite(async () => {
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'menu', id);
      await setDoc(itemRef, {
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
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
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
      
      {/* 🛠️ TOP ALERT BAR */}
      {dbError && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white p-3 text-xs font-black uppercase text-center z-[9999] shadow-2xl flex items-center justify-center gap-4">
          <span>🚨 ERROR: {dbError}</span>
          <button onClick={() => window.location.reload()} className="bg-white text-red-600 px-3 py-1 rounded-full">FIX IT / RELOAD</button>
        </div>
      )}

      {/* Connection Indicator */}
      <div className="fixed bottom-4 left-4 z-[9999] flex items-center gap-2 bg-black/80 text-white px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10">
        <div className={`w-1.5 h-1.5 rounded-full ${authStatus === 'Online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
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
              <div className="text-5xl mb-6">🍔</div>
              <h2 className="text-white text-3xl font-black italic uppercase mb-8 tracking-tighter">Kitchen Access</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-white/5 border border-white/10 p-6 rounded-3xl text-white text-center mb-4 outline-none focus:border-orange-500 transition-colors" placeholder="Owner Password" />
              <button onClick={() => passInput === OWNER_PASSWORD ? setIsUnlocked(true) : setDbError("Access Denied")} className="w-full py-6 bg-orange-600 text-white font-black rounded-3xl uppercase text-[10px] tracking-widest">Login</button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto pt-32 pb-40 px-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8">
              <h3 className="text-sm font-black uppercase mb-6 opacity-30">Add to Cloud Menu</h3>
              <div className="grid grid-cols-2 gap-3">
                <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none focus:ring-2 ring-orange-500" placeholder="Product Name (e.g. Double Beef)" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <input className="bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" placeholder="Price (IQD)" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <select className="bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="col-span-2 bg-slate-50 p-4 rounded-2xl text-sm font-bold border border-slate-100 outline-none" placeholder="Image URL" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                <button onClick={addNewItem} disabled={isSaving || authStatus !== 'Online'} className="col-span-2 py-5 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest disabled:opacity-30">
                  {isSaving ? "Uploading to Cloud..." : "Save to Database"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase px-4 opacity-30 tracking-widest">Active Database Items ({menuItems.length})</h3>
              {!isDataLoaded && authStatus === 'Online' ? (
                <div className="p-20 text-center font-black uppercase text-xs text-slate-300">Fetching cloud data...</div>
              ) : (
                menuItems.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center justify-between border border-slate-100 shadow-sm animate-in fade-in duration-500">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden">
                        <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=100'} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="font-black uppercase text-xs">{item.name}</p>
                        <p className="text-[10px] text-orange-600 font-bold">{Number(item.price).toLocaleString()} IQD</p>
                      </div>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="px-4 py-2 text-red-500 font-black text-[10px] uppercase hover:bg-red-50 rounded-xl transition-all">Remove</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="pt-40 pb-20 px-6 text-center">
            <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-none mb-6 drop-shadow-sm">
              {settings.restaurantName}
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.8em] text-slate-400">{settings.tagline}</p>
          </header>

          <main className="max-w-6xl mx-auto px-6">
            {!isDataLoaded ? (
              <div className="text-center p-20 opacity-20 font-black italic">GETTING THE GRILL READY...</div>
            ) : menuItems.length === 0 ? (
              <div className="text-center p-20 opacity-20 font-black italic">NO BURGERS IN THE KITCHEN YET.</div>
            ) : (
              Object.entries(groupedMenu).map(([cat, items]) => (
                <section key={cat} className="mb-20">
                  <h2 className="text-3xl font-black italic uppercase mb-10 tracking-tight flex items-center gap-4">
                    {cat} <div className="h-1 flex-1 bg-slate-100 rounded-full"></div>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {items.map(item => (
                      <div key={item.id} className="bg-white rounded-[3rem] p-4 border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
                        <div className="aspect-square rounded-[2.5rem] overflow-hidden mb-6 bg-slate-50">
                          <img src={item.image || 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        </div>
                        <div className="px-2 pb-2">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-black uppercase italic tracking-tighter leading-tight">{item.name}</h3>
                            <p className="font-black text-orange-600">{Number(item.price).toLocaleString()} <span className="text-[8px]">IQD</span></p>
                          </div>
                          <button onClick={() => addToCart(item)} className="w-full mt-4 py-4 rounded-2xl bg-slate-50 font-black uppercase text-[10px] tracking-widest hover:bg-black hover:text-white transition-all">
                            {cart[item.id] ? `In Tray (${cart[item.id]})` : "Add to Tray"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>
          
          {/* Cart Logic remains the same... */}
          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-[2000]">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white p-2 rounded-full shadow-2xl flex items-center">
                <div className="bg-orange-600 h-14 w-14 rounded-full flex items-center justify-center font-black italic text-sm">{Object.values(cart).reduce((a,b)=>a+b, 0)}</div>
                <div className="flex-1 px-6 text-left">
                   <p className="text-[10px] font-black italic">{cartTotal.toLocaleString()} IQD</p>
                </div>
                <div className="pr-8 font-black text-[10px] uppercase">Checkout →</div>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-lg rounded-[3rem] p-10">
                <h2 className="text-3xl font-black italic uppercase mb-6">Confirm Order</h2>
                <textarea className="w-full p-6 bg-slate-50 rounded-2xl h-32 mb-6 outline-none focus:ring-2 ring-orange-500 font-bold" placeholder="Delivery Address..." value={address} onChange={e => setAddress(e.target.value)} />
                <button onClick={() => {
                   const msg = `*NEW ORDER*\n\n${Object.entries(cart).map(([id, q]) => `• ${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n')}\n\n*Total:* ${cartTotal} IQD\n*Address:* ${address}`;
                   window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                   setCart({}); setIsCheckoutOpen(false);
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