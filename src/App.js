import React, { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Printer, 
  Play,
  ChefHat,
  Settings,
  PlusCircle,
  X,
  CheckCircle2,
  Trash2,
  Phone
} from "lucide-react";

/**
 * 🛠️ FIREBASE CONFIG
 */
const localConfig = {
  apiKey: "AIzaSyBi9O20ep4sQEfAQSvQAexHzzT1wjj8cHc",
  authDomain: "karbala-burger-app.firebaseapp.com",
  projectId: "karbala-burger-app",
  storageBucket: "karbala-burger-app.firebasestorage.app",
  messagingSenderId: "112064338237",
  appId: "1:112064338237:web:93b7154a4504704d82cd54"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : localConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  db = getFirestore(app);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'karbala-burger-pro-v2';

// Path Helpers
const getMenuColl = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getOrdersColl = () => collection(db, 'artifacts', appId, 'public', 'data', 'orders');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 
const PLACEHOLDER = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop";
const PING_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

const formatPrice = (p) => p?.toLocaleString() + " د.ع";

export default function App() {
  const [view, setView] = useState("customer"); 
  const [adminTab, setAdminTab] = useState("orders");
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("الكل");
  
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState(["برجر", "مقبلات", "مشروبات", "عروض"]);
  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    restaurantNameAr: "برجر كربلاء",
    primaryColor: "#ea580c", 
    bgColor: "#ffffff",
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "كربلاء - شارع السناتر"
  });

  // Printer State
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState(false);
  const [lastPrintedId, setLastPrintedId] = useState(null);
  const [currentPrintOrder, setCurrentPrintOrder] = useState(null);

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", desc: "", image: "", category: "برجر" });
  
  const audioRef = useRef(new Audio(PING_SOUND_URL));

  // Sync Auth
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    onAuthStateChanged(auth, u => u && setUser(u));
  }, []);

  // Real-time Listeners
  useEffect(() => {
    if (!user) return;
    
    const unsubMenu = onSnapshot(getMenuColl(), snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSettings = onSnapshot(getSettingsDoc(), snap => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    });

    // Orders Listener with Auto-Print Logic
    const q = query(getOrdersColl(), orderBy('timestamp', 'desc'), limit(30));
    const unsubOrders = onSnapshot(q, (snapshot) => {
      const orderList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(orderList);

      // AUTO PRINT LOGIC
      if (isSystemActive && isAutoPrintEnabled) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            const oid = change.doc.id;
            const isRecent = (Date.now() - (data.timestamp?.toMillis() || 0)) < 40000;

            if (isRecent && oid !== lastPrintedId) {
              handlePrint(change.doc.id, data);
            }
          }
        });
      }
    });

    return () => { unsubMenu(); unsubOrders(); unsubSettings(); };
  }, [user, isSystemActive, isAutoPrintEnabled, lastPrintedId]);

  const handlePrint = (id, data) => {
    setLastPrintedId(id);
    setCurrentPrintOrder({ id, ...data });
    audioRef.current.play().catch(() => {});
    
    // Trigger print after DOM update
    setTimeout(() => {
      window.print();
    }, 800);
  };

  const handleCheckout = async () => {
    if (!user) return;
    const orderData = {
      customer: customerInfo,
      items: Object.entries(cart).map(([id, q]) => {
        const item = menuItems.find(m => m.id === id);
        return { name: item.name, quantity: q, price: item.salePrice || item.price };
      }),
      totalPrice: cartTotal,
      status: 'pending',
      timestamp: serverTimestamp()
    };

    await addDoc(getOrdersColl(), orderData);
    setCart({});
    setIsCheckoutOpen(false);
    
    const itemsStr = orderData.items.map(i => `${i.quantity}x ${i.name}`).join('\n');
    const text = `طلب جديد!\nالاسم: ${customerInfo.name}\n${itemsStr}\nالمجموع: ${formatPrice(cartTotal)}`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
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
    return activeCategory === "الكل" ? menuItems : menuItems.filter(i => i.category === activeCategory);
  }, [menuItems, activeCategory]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: settings.bgColor, fontFamily: 'system-ui, sans-serif' }}>
      
      {/* NAV SWITCHER */}
      <nav className="no-print flex justify-center p-4 sticky top-0 z-[100] bg-white/50 backdrop-blur-lg">
        <div className="flex bg-black p-1 rounded-full shadow-2xl">
          <button onClick={() => setView("customer")} className={`px-8 py-2 rounded-full text-[10px] font-black uppercase transition-all ${view === 'customer' ? 'text-white' : 'text-zinc-500'}`} style={view === 'customer' ? { backgroundColor: settings.primaryColor } : {}}>المنيو</button>
          <button onClick={() => setView("owner")} className={`px-8 py-2 rounded-full text-[10px] font-black uppercase transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-zinc-500'}`}>لوحة التحكم</button>
        </div>
      </nav>

      {view === "customer" ? (
        <div className="animate-in fade-in duration-700">
          <header className="px-6 py-16 text-center">
            <h1 className="text-7xl font-black italic uppercase tracking-tighter text-zinc-950">{settings.restaurantName}</h1>
            <p className="text-2xl font-black text-zinc-400 mt-2">{settings.restaurantNameAr}</p>
          </header>

          <div className="flex gap-2 px-6 overflow-x-auto no-scrollbar justify-start md:justify-center mb-10" dir="rtl">
            <button onClick={() => setActiveCategory("الكل")} className={`shrink-0 px-8 py-4 rounded-[1.5rem] text-xs font-black ${activeCategory === "الكل" ? 'bg-black text-white shadow-xl' : 'bg-white border'}`}>الكل</button>
            {categories.map(c => (
              <button key={c} onClick={() => setActiveCategory(c)} className={`shrink-0 px-8 py-4 rounded-[1.5rem] text-xs font-black transition-all ${activeCategory === c ? 'text-white shadow-xl' : 'bg-white border text-zinc-400'}`} style={activeCategory === c ? { backgroundColor: settings.primaryColor } : {}}>{c}</button>
            ))}
          </div>

          <main className="max-w-7xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pb-40" dir="rtl">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-white rounded-[2.5rem] p-5 shadow-sm border border-zinc-100 group hover:shadow-2xl transition-all">
                <div className="overflow-hidden rounded-[2rem] mb-6 aspect-square bg-zinc-100">
                  <img src={item.image || PLACEHOLDER} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                </div>
                <h3 className="font-black text-xl text-zinc-900 mb-1">{item.name}</h3>
                <p className="text-xs text-zinc-400 font-bold mb-6 line-clamp-2">{item.desc || "أفضل مذاق للبرجر في كربلاء"}</p>
                <div className="flex justify-between items-center">
                  <span className="font-black text-2xl" style={{ color: settings.primaryColor }}>{formatPrice(item.salePrice || item.price)}</span>
                  <button onClick={() => addToCart(item)} className="bg-black text-white px-6 py-3 rounded-2xl text-xs font-black uppercase hover:bg-zinc-800 transition-all">Add +</button>
                </div>
              </div>
            ))}
          </main>

          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white p-5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-between">
                <span className="bg-orange-500 w-12 h-12 rounded-full flex items-center justify-center font-black text-lg">{Object.values(cart).reduce((a,b)=>a+b,0)}</span>
                <span className="font-black uppercase italic text-sm tracking-widest">تأكيد الطلب | {formatPrice(cartTotal)}</span>
                <span className="pr-4 text-xl">➔</span>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] p-8 animate-in slide-in-from-bottom-20 duration-500" dir="rtl">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-black italic">اتمام الطلب</h2>
                  <button onClick={() => setIsCheckoutOpen(false)} className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-2xl font-light">×</button>
                </div>
                <div className="space-y-4">
                  <input className="w-full p-5 bg-zinc-100 rounded-2xl font-bold border-none" placeholder="الاسم" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
                  <input className="w-full p-5 bg-zinc-100 rounded-2xl font-bold border-none" placeholder="رقم الهاتف" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
                  <textarea className="w-full p-5 bg-zinc-100 rounded-2xl font-bold border-none h-24" placeholder="العنوان بالتفصيل" value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} />
                  <button onClick={handleCheckout} className="w-full py-6 bg-black text-white font-black rounded-[2rem] uppercase tracking-widest shadow-2xl hover:bg-zinc-800 transition-all mt-4">إرسال الطلب عبر الواتساب</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* OWNER / DASHBOARD VIEW */
        <div className="max-w-6xl mx-auto p-6" dir="rtl">
          {!isUnlocked ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <form onSubmit={(e) => { e.preventDefault(); if(passInput === OWNER_PASSWORD) setIsUnlocked(true); }} className="bg-zinc-950 p-12 rounded-[3.5rem] w-full max-w-md text-center shadow-2xl">
                <ChefHat className="text-orange-600 mx-auto mb-6" size={50} />
                <h2 className="text-white font-black uppercase text-2xl mb-8 tracking-widest italic">Dashboard Login</h2>
                <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-zinc-900 border-none p-5 rounded-2xl text-white text-center mb-4 text-xl font-mono tracking-widest" placeholder="•••••" />
                <button className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl uppercase tracking-widest">Login</button>
              </form>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              
              {/* SYSTEM CONTROLS (PRINTER) */}
              <div className="bg-black rounded-[2.5rem] p-8 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl text-white">
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isSystemActive ? 'bg-green-600' : 'bg-zinc-800'}`}>
                    <Printer size={28} />
                  </div>
                  <div>
                    <h3 className="font-black uppercase italic tracking-tighter text-xl">Printer Control Engine</h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">Status: {isSystemActive ? 'CONNECTED & LISTENING' : 'IDLE - CLICK START'}</p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  {!isSystemActive ? (
                    <button 
                      onClick={() => { setIsSystemActive(true); setIsAutoPrintEnabled(true); }}
                      className="bg-orange-600 hover:bg-orange-500 px-8 py-4 rounded-2xl font-black uppercase text-xs flex items-center gap-2 transition-all shadow-lg shadow-orange-600/20"
                    >
                      <Play size={16} fill="white" /> Start Print System
                    </button>
                  ) : (
                    <button 
                      onClick={() => setIsAutoPrintEnabled(!isAutoPrintEnabled)}
                      className={`px-8 py-4 rounded-2xl font-black uppercase text-xs transition-all ${isAutoPrintEnabled ? 'bg-green-600' : 'bg-red-600'}`}
                    >
                      Auto-Print: {isAutoPrintEnabled ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
              </div>

              {/* TABS */}
              <div className="flex gap-3 mb-10 overflow-x-auto no-scrollbar py-2">
                <button onClick={() => setAdminTab("orders")} className={`px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest ${adminTab === 'orders' ? 'bg-orange-600 text-white shadow-xl' : 'bg-zinc-100 text-zinc-500'}`}>الطلبات ({orders.filter(o=>o.status==='pending').length})</button>
                <button onClick={() => setAdminTab("menu")} className={`px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest ${adminTab === 'menu' ? 'bg-orange-600 text-white shadow-xl' : 'bg-zinc-100 text-zinc-500'}`}>المنيو</button>
                <button onClick={() => setAdminTab("settings")} className={`px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest ${adminTab === 'settings' ? 'bg-orange-600 text-white shadow-xl' : 'bg-zinc-100 text-zinc-500'}`}>الإعدادات</button>
              </div>

              {adminTab === "orders" && (
                <div className="grid gap-6">
                  {orders.map(order => (
                    <div key={order.id} className={`p-8 rounded-[3rem] border-2 transition-all ${order.status === 'pending' ? 'bg-white border-orange-500/20 shadow-xl' : 'bg-zinc-100/50 border-transparent opacity-60'}`}>
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                        <div>
                          <span className="text-[10px] font-black uppercase text-orange-600 mb-2 block">رقم الطلب #{order.id?.substring(0, 6)}</span>
                          <h4 className="font-black text-2xl italic">{order.customer?.name}</h4>
                          <div className="flex gap-4 mt-2">
                            <a href={`tel:${order.customer?.phone}`} className="text-sm font-bold flex items-center gap-1 text-zinc-500"><Phone size={14} /> {order.customer?.phone}</a>
                          </div>
                          <p className="text-xs font-bold text-zinc-400 mt-2">العنوان: {order.customer?.address}</p>
                        </div>
                        <div className="flex gap-3">
                           <button onClick={() => handlePrint(order.id, order)} className="bg-zinc-100 hover:bg-zinc-200 p-4 rounded-2xl text-zinc-600 transition-all"><Printer size={20} /></button>
                           {order.status === 'pending' && (
                             <button onClick={() => updateDoc(doc(getOrdersColl(), order.id), {status:'completed'})} className="bg-green-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-tighter flex items-center gap-2 shadow-lg shadow-green-600/20"><CheckCircle2 size={18} /> تم التوصيل</button>
                           )}
                           <button onClick={() => {if(window.confirm('حذف؟')) deleteDoc(doc(getOrdersColl(), order.id))}} className="bg-red-50 text-red-600 p-4 rounded-2xl hover:bg-red-100 transition-all"><Trash2 size={20} /></button>
                        </div>
                      </div>
                      <div className="bg-zinc-50/50 rounded-[2rem] p-6 border border-zinc-100">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center py-3 border-b border-zinc-100 last:border-0">
                            <span className="font-black text-sm"><span className="text-orange-600 mr-2">{item.quantity}x</span> {item.name}</span>
                            <span className="font-mono text-sm text-zinc-500">{formatPrice(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex justify-between items-center">
                        <span className="text-zinc-400 text-xs font-bold italic">{new Date(order.timestamp?.toMillis()).toLocaleString()}</span>
                        <div className="text-3xl font-black italic text-zinc-900">{formatPrice(order.totalPrice || order.total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminTab === "menu" && (
                <div className="space-y-8">
                  <div className="bg-white p-10 rounded-[3rem] border shadow-xl">
                    <h3 className="font-black mb-8 uppercase text-orange-600 text-sm tracking-widest flex items-center gap-2"><PlusCircle size={18} /> إضافة وجبة جديدة</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <input className="w-full p-5 bg-zinc-50 rounded-2xl font-bold border-none" placeholder="اسم الوجبة" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                        <div className="flex gap-4">
                          <input className="w-1/2 p-5 bg-zinc-50 rounded-2xl font-bold border-none" placeholder="السعر" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                          <select className="w-1/2 p-5 bg-zinc-50 rounded-2xl font-bold border-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <input className="w-full p-5 bg-zinc-50 rounded-2xl font-bold border-none" placeholder="رابط الصورة" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                        <textarea className="w-full p-5 bg-zinc-50 rounded-2xl font-bold border-none h-20" placeholder="وصف الوجبة" value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} />
                      </div>
                      <button onClick={async () => {
                        const id = "item_" + Date.now();
                        await setDoc(doc(getMenuColl(), id), {...newItem, id, price: Number(newItem.price)});
                        setNewItem({ name: "", price: "", desc: "", image: "", category: "برجر" });
                      }} className="md:col-span-2 py-6 bg-black text-white font-black rounded-3xl uppercase tracking-widest shadow-xl hover:bg-zinc-800 transition-all">حفظ الوجبة في القائمة</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {menuItems.map(item => (
                      <div key={item.id} className="bg-white p-6 rounded-[2rem] flex items-center gap-4 border shadow-sm group">
                        <img src={item.image || PLACEHOLDER} className="w-20 h-20 rounded-2xl object-cover" />
                        <div className="flex-1">
                          <h4 className="font-black text-sm">{item.name}</h4>
                          <p className="text-orange-600 font-bold text-xs">{formatPrice(item.price)}</p>
                        </div>
                        <button onClick={() => deleteDoc(doc(getMenuColl(), item.id))} className="p-3 text-red-100 group-hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminTab === "settings" && (
                <div className="bg-white p-10 rounded-[3rem] border shadow-xl grid gap-6">
                   <div className="grid md:grid-cols-2 gap-6">
                     <div>
                       <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block mr-4">English Name</label>
                       <input className="w-full p-5 bg-zinc-50 rounded-2xl font-bold" value={settings.restaurantName} onChange={e => setDoc(getSettingsDoc(), {restaurantName: e.target.value}, {merge:true})} />
                     </div>
                     <div>
                       <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block mr-4">الاسم بالعربي</label>
                       <input className="w-full p-5 bg-zinc-50 rounded-2xl font-bold" value={settings.restaurantNameAr} onChange={e => setDoc(getSettingsDoc(), {restaurantNameAr: e.target.value}, {merge:true})} />
                     </div>
                   </div>
                   <div className="grid md:grid-cols-2 gap-6">
                     <div>
                       <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block mr-4">WhatsApp Number</label>
                       <input className="w-full p-5 bg-zinc-50 rounded-2xl font-bold font-mono" value={settings.whatsapp} onChange={e => setDoc(getSettingsDoc(), {whatsapp: e.target.value}, {merge:true})} />
                     </div>
                     <div>
                       <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block mr-4">Brand Color</label>
                       <input type="color" className="w-full h-16 bg-zinc-50 rounded-2xl p-2 cursor-pointer" value={settings.primaryColor} onChange={e => setDoc(getSettingsDoc(), {primaryColor: e.target.value}, {merge:true})} />
                     </div>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- INVISIBLE PRINT TEMPLATE --- */}
      <div id="thermal-receipt" className="print-only">
        {currentPrintOrder && (
          <div className="thermal-content" style={{ direction: 'rtl', textAlign: 'right', padding: '10px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <h1 style={{ fontSize: '24px', margin: '0' }}>{settings.restaurantNameAr}</h1>
              <p style={{ margin: '0', fontSize: '14px' }}>{settings.locationDesc}</p>
              <p style={{ margin: '5px 0', fontSize: '12px' }}>رقم الطلب: #{currentPrintOrder.id?.substring(0, 6)}</p>
              <p style={{ fontSize: '11px' }}>{new Date().toLocaleString()}</p>
            </div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ marginBottom: '10px' }}>
              <p style={{ margin: '2px 0' }}><strong>الزبون:</strong> {currentPrintOrder.customer?.name}</p>
              <p style={{ margin: '2px 0' }}><strong>الهاتف:</strong> {currentPrintOrder.customer?.phone}</p>
              <p style={{ margin: '2px 0' }}><strong>العنوان:</strong> {currentPrintOrder.customer?.address}</p>
            </div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ minHeight: '100px' }}>
              {currentPrintOrder.items?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                  <span>{item.quantity}x {item.name}</span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '2px solid #000', marginTop: '10px', paddingTop: '10px', textAlign: 'left' }}>
              <p style={{ fontSize: '22px', margin: '0', fontWeight: 'bold' }}>المجموع: {formatPrice(currentPrintOrder.totalPrice || currentPrintOrder.total)}</p>
            </div>
            <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '11px' }}>
              <p>شكراً لطلبكم!</p>
              <p>********************************</p>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .print-only { display: none; }

        @media print {
          @page { margin: 0; }
          .no-print { display: none !important; }
          body { background: #fff !important; margin: 0; padding: 0; }
          .print-only {
            display: block !important;
            width: 80mm;
            font-family: 'Courier New', Courier, monospace;
            padding: 0;
            color: #000;
          }
          .thermal-content { width: 100%; box-sizing: border-box; }
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.6s ease-out forwards; }
      `}} />
    </div>
  );
}