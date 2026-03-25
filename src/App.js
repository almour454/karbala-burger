import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc,
  query,
  onSnapshot
} from "firebase/firestore"; 
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";

/**
 * 🛠️ CONFIGURATION
 * If it works here but not on your site, ensure these match your Firebase Console exactly.
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
  const [isSaving, setIsSaving] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // 🚀 STATE
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["Burgers", "Drinks", "Mandi"]);
  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    tagline: "Best Grill in the City",
    primaryColor: "#ea580c", 
    whatsapp: "964780000000"
  });

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
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

  // 🔥 REAL-TIME DATA SYNC
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          // This is what happens on your live site
          await signInAnonymously(auth);
        }
      } catch (err) {
        setDbError("Auth Failed: " + err.message + ". Check if Anonymous Auth is enabled in Firebase Console.");
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    return () => unsubscribeAuth();
  }, []);

  // Data Fetching depends on User existence (Rule 3)
  useEffect(() => {
    if (!user) return;

    // Sync Menu
    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const unsubMenu = onSnapshot(menuRef, (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => setDbError("Menu Sync Failed: " + err.message));

    // Sync Settings
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSettings(prev => ({ ...prev, ...data }));
        if (data.categories) setCategories(data.categories);
      }
    }, (err) => setDbError("Settings Sync Failed: " + err.message));

    return () => { unsubMenu(); unsubSettings(); };
  }, [user]);

  // 🛠️ OWNER ACTIONS - FORCED SYNC
  const performAction = async (actionFn) => {
    if (!user) {
      setDbError("You must be logged in to perform this action.");
      return;
    }
    setIsSaving(true);
    setDbError(null);
    setSaveSuccess(false);
    try {
      await actionFn();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setDbError("Save Failed: " + e.message + ". Check Firestore Security Rules.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (field, value) => performAction(async () => {
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    await setDoc(settingsRef, { [field]: value }, { merge: true });
  });

  const addCategory = () => performAction(async () => {
    if (!newCatInput.trim()) return;
    const updated = [...new Set([...categories, newCatInput.trim()])];
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    await setDoc(settingsRef, { categories: updated }, { merge: true });
    setNewCatInput("");
  });

  const deleteCategory = (cat) => performAction(async () => {
    const updated = categories.filter(c => c !== cat);
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    await setDoc(settingsRef, { categories: updated }, { merge: true });
  });

  const addNewItem = () => performAction(async () => {
    if (!newItem.name || !newItem.price) return;
    const id = "item_" + Date.now();
    const itemData = {
      ...newItem,
      id,
      price: parseInt(newItem.price) || 0,
      salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null
    };
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'menu', id);
    await setDoc(itemRef, itemData);
    setNewItem({ ...newItem, name: "", price: "", salePrice: "", desc: "", image: "" });
  });

  const deleteItem = (id) => performAction(async () => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'menu', id);
    await deleteDoc(itemRef);
  });

  // UI HELPERS
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
    const orderItems = Object.entries(cart).map(([id, q]) => {
      const item = menuItems.find(m => m.id === id);
      return `• ${q}x ${item?.name}`;
    }).join('\n');
    
    const message = `*NEW ORDER FROM ${settings.restaurantName}*\n\n${orderItems}\n\n*Total:* ${cartTotal.toLocaleString()} IQD\n*Address:* ${address}`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${settings.whatsapp}?text=${encoded}`, '_blank');
    setCart({});
    setIsCheckoutOpen(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-orange-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Warming up the grill...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      {/* 🚨 ERROR TOAST */}
      {dbError && (
        <div className="fixed bottom-4 right-4 z-[3000] bg-red-600 text-white p-4 rounded-2xl shadow-2xl max-w-xs">
          <p className="text-[10px] font-black uppercase mb-1">Alert</p>
          <p className="text-xs font-bold leading-tight">{dbError}</p>
          <button onClick={() => setDbError(null)} className="mt-2 text-[10px] underline font-black">Dismiss</button>
        </div>
      )}

      {/* ✅ SUCCESS TOAST */}
      {saveSuccess && (
        <div className="fixed bottom-4 right-4 z-[3000] bg-green-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
          <span className="text-lg">✨</span>
          <p className="text-xs font-black uppercase tracking-widest">Changes Saved!</p>
        </div>
      )}

      {/* 🔄 SAVING INDICATOR */}
      {isSaving && (
        <div className="fixed top-4 right-4 z-[2000] bg-white border border-slate-100 shadow-xl px-6 py-3 rounded-full flex items-center gap-3">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Updating...</span>
        </div>
      )}

      {/* NAV */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex bg-black p-1.5 rounded-full border border-white/10 shadow-2xl">
        <button onClick={() => navigateTo("customer")} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'customer' ? 'text-white' : 'text-slate-500 hover:text-white'}`} style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}>Menu</button>
        <button onClick={() => navigateTo("owner")} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>Owner</button>
      </div>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <form onSubmit={(e) => { e.preventDefault(); if(passInput === OWNER_PASSWORD) setIsUnlocked(true); else setDbError("Wrong Password"); }} className="bg-white/5 border border-white/10 p-12 rounded-[4rem] w-full max-w-md text-center">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl rotate-3" style={{ backgroundColor: settings.primaryColor }}><span className="text-4xl text-white">🔒</span></div>
              <h2 className="text-white text-3xl font-black italic uppercase mb-2 tracking-tighter">Owner Login</h2>
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-black/40 border border-white/10 p-6 rounded-3xl text-white text-center text-lg outline-none mb-6" placeholder="••••••••" />
              <button type="submit" className="w-full py-7 text-white font-black rounded-3xl text-[10px] uppercase tracking-widest transition-all" style={{ backgroundColor: settings.primaryColor }}>Enter HQ</button>
            </form>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-950 text-white p-6 pt-40 pb-60 max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-12">
              <h1 className="text-6xl font-black italic uppercase tracking-tighter" style={{ color: settings.primaryColor }}>Owner HQ</h1>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase">System ID</p>
                <p className="text-[10px] font-mono text-slate-400 break-all max-w-[150px] leading-tight">{user?.uid || 'Not Authenticated'}</p>
                <p className="text-xs font-bold text-green-500 uppercase flex items-center gap-2 mt-1">● Live Connected</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
               <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10">
                 <p className="text-[10px] font-black uppercase text-slate-500 mb-4">Shop Title</p>
                 <input className="w-full bg-black/40 p-5 rounded-2xl outline-none text-xl font-bold" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
               </div>
               <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10">
                 <p className="text-[10px] font-black uppercase text-slate-500 mb-4">Customer WhatsApp</p>
                 <input className="w-full bg-black/40 p-5 rounded-2xl outline-none text-xl font-bold" value={settings.whatsapp} onChange={e => updateSettings("whatsapp", e.target.value)} />
               </div>
            </div>

            <div className="bg-white/5 p-10 rounded-[4rem] border border-white/10 mb-12">
              <h3 className="text-xl font-black uppercase mb-8 italic">Menu Sections</h3>
              <div className="flex flex-wrap gap-3 mb-10">
                {categories.map(c => (
                  <div key={c} className="bg-white/10 pl-6 pr-3 py-3 rounded-2xl flex items-center gap-4 group hover:bg-white/20 transition-all border border-white/5">
                    <span className="text-[11px] font-black uppercase tracking-widest">{c}</span>
                    <button onClick={() => deleteCategory(c)} className="w-8 h-8 flex items-center justify-center bg-red-500/20 text-red-500 rounded-xl font-black text-xl hover:bg-red-500 hover:text-white transition-all">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <input className="flex-1 bg-black/40 p-6 rounded-3xl outline-none border border-white/10 text-lg" placeholder="Add New Section (e.g. Desserts)..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                <button onClick={addCategory} className="bg-white text-black px-12 rounded-3xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all">Add</button>
              </div>
            </div>

            <div className="bg-white/5 p-10 rounded-[4rem] border border-white/10 mb-12">
              <h3 className="text-xl font-black uppercase mb-10 italic" style={{ color: settings.primaryColor }}>New Menu Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Item Name</p>
                  <input className="w-full bg-black/40 p-6 rounded-3xl outline-none text-lg border border-white/5" placeholder="Double Burger" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Menu Section</p>
                  <select className="w-full bg-black/40 p-6 rounded-3xl outline-none appearance-none border border-white/5 text-lg" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Base Price (IQD)</p>
                  <input className="w-full bg-black/40 p-6 rounded-3xl outline-none text-lg border border-white/5" placeholder="7500" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Sale Price (IQD)</p>
                  <input className="w-full bg-black/40 p-6 rounded-3xl outline-none text-lg border border-white/5" placeholder="5000" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Description</p>
                  <input className="w-full bg-black/40 p-6 rounded-3xl outline-none border border-white/5" placeholder="What's in it?" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-3">
                  <p className="text-[10px] uppercase font-black text-slate-500 px-2">Image Link (Unsplash or direct URL)</p>
                  <input className="w-full bg-black/40 p-6 rounded-3xl outline-none border border-white/5 font-mono text-xs" placeholder="https://images.unsplash..." value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                </div>
              </div>
              <button onClick={addNewItem} className="w-full mt-10 py-8 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 disabled:opacity-50" disabled={isSaving} style={{ backgroundColor: settings.primaryColor }}>Publish to Live Menu</button>
            </div>

            <div className="space-y-6">
              <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-widest border-b border-white/10 pb-4">Live Menu Inventory</h3>
              {menuItems.length === 0 && <p className="text-slate-600 font-bold py-10 text-center uppercase tracking-widest text-xs">No items found.</p>}
              {menuItems.map(item => (
                <div key={item.id} className="bg-white/5 p-6 rounded-[2.5rem] flex items-center justify-between border border-white/5 group hover:border-white/20 transition-all">
                  <div className="flex items-center gap-6">
                    <img src={item.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=200'} className="w-20 h-20 rounded-[1.5rem] object-cover bg-slate-800 ring-2 ring-white/5" loading="lazy" />
                    <div>
                      <p className="font-black text-lg uppercase tracking-tight">{item.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                        {item.category} • {item.salePrice ? <span className="text-orange-400">{item.salePrice.toLocaleString()} IQD</span> : <span>{item.price.toLocaleString()} IQD</span>}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="px-8 py-4 bg-red-500/10 text-red-500 text-[10px] font-black uppercase rounded-2xl hover:bg-red-500 hover:text-white transition-all">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="pb-40">
          <header className="py-32 px-6 text-center bg-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            <h1 className="text-8xl md:text-[12rem] font-black italic uppercase tracking-tighter leading-[0.75] relative z-10">
              {settings.restaurantName.split(' ')[0]} <br/> 
              <span style={{ color: settings.primaryColor }}>{settings.restaurantName.split(' ').slice(1).join(' ')}</span>
            </h1>
            <p className="mt-12 text-slate-400 text-[11px] font-black tracking-[1.2em] uppercase relative z-10">{settings.tagline}</p>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-12">
            {Object.entries(groupedMenu).length === 0 ? (
              <div className="text-center py-40">
                <p className="text-slate-300 font-black uppercase text-sm tracking-[0.5em]">The kitchen is currently empty</p>
              </div>
            ) : (
              Object.entries(groupedMenu).map(([cat, items]) => (
                <section key={cat} className="mb-32">
                  <div className="flex items-center gap-8 mb-16">
                    <h2 className="text-5xl font-black italic uppercase tracking-tighter">{cat}</h2>
                    <div className="flex-1 h-[2px] bg-slate-100"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {items.map(item => (
                      <div key={item.id} className="bg-white rounded-[4rem] p-5 shadow-sm border border-slate-100 transition-all hover:shadow-2xl hover:-translate-y-2 group">
                        <div className="h-72 rounded-[3.2rem] overflow-hidden bg-slate-100 mb-8 relative">
                          <img src={item.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                          <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-xl px-6 py-3 rounded-2xl font-black shadow-2xl flex items-center gap-2">
                            {item.salePrice ? (
                              <>
                                <s className="text-slate-400 text-xs">{item.price.toLocaleString()}</s>
                                <span className="text-orange-600">{item.salePrice.toLocaleString()}</span>
                              </>
                            ) : <span>{item.price.toLocaleString()}</span>}
                            <span className="text-[10px] text-slate-400">IQD</span>
                          </div>
                        </div>
                        <div className="px-6 pb-6">
                          <h3 className="text-2xl font-black uppercase italic mb-3">{item.name}</h3>
                          <p className="text-slate-400 text-xs mb-10 leading-relaxed font-medium line-clamp-2 h-10">{item.desc || "Exquisite local flavors prepared daily with fresh ingredients."}</p>
                          {cart[item.id] ? (
                            <div className="flex items-center bg-slate-950 text-white rounded-3xl p-1.5">
                              <button onClick={() => removeFromCart(item.id)} className="flex-1 py-4 font-black text-xl hover:bg-white/10 rounded-2xl transition-colors">－</button>
                              <span className="flex-1 text-center font-black text-lg">{cart[item.id]}</span>
                              <button onClick={() => addToCart(item)} className="flex-1 py-4 font-black text-xl hover:bg-white/10 rounded-2xl transition-colors">＋</button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item)} className="w-full py-5 rounded-[1.8rem] font-black uppercase text-[10px] tracking-[0.2em] border-2 border-slate-100 hover:border-slate-900 transition-all active:scale-95">Add to Tray</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>

          {cartTotal > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] w-full max-w-sm px-6">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-slate-950 text-white p-6 rounded-[2.8rem] shadow-2xl flex items-center justify-between border border-white/10 active:scale-95 transition-all">
                <div className="text-left pl-4">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Total Order</p>
                  <p className="text-3xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} IQD</p>
                </div>
                <div className="bg-orange-600 h-16 w-16 rounded-3xl flex items-center justify-center animate-pulse">
                   <span className="text-2xl">🔥</span>
                </div>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl">
              <div className="bg-white w-full max-w-lg rounded-[5rem] p-16 relative animate-in zoom-in-95 duration-300">
                <button onClick={() => setIsCheckoutOpen(false)} className="absolute top-10 right-14 text-4xl font-light hover:rotate-90 transition-transform">×</button>
                <h2 className="text-5xl font-black italic uppercase mb-12 tracking-tighter leading-none">Where to<br/><span style={{ color: settings.primaryColor }}>Send This?</span></h2>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-8 bg-slate-50 rounded-[2.5rem] text-sm h-40 mb-10 outline-none border border-slate-100 focus:border-slate-900 font-bold transition-all" placeholder="House #, Street, Neighborhood in Karbala..." />
                <button disabled={!address.trim()} onClick={handleCheckout} className="w-full py-10 bg-[#25D366] text-white font-black rounded-[2.5rem] text-xs uppercase tracking-[0.3em] disabled:opacity-20 shadow-2xl transition-all active:scale-95">Complete via WhatsApp</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}