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
 * 🛠️ FIREBASE CONFIG
 */
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

try {
  enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-v2-bold';

const getMenuRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(["برجر", "مقبلات", "مشروبات"]);
  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");

  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    restaurantNameAr: "برجر كربلاء",
    primaryColor: "#ea580c", 
    bgColor: "#ffffff",
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM",
    locationDesc: "كربلاء - المركز"
  });

  const [newItem, setNewItem] = useState({ name: "", price: "", salePrice: "", desc: "", image: "", category: "برجر" });
  const [newCatInput, setNewCatInput] = useState("");

  useEffect(() => {
    const initAuth = async () => {
      const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
      try {
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) {}
    };
    initAuth();
    onAuthStateChanged(auth, (u) => u && setUser(u));

    const unsubMenu = onSnapshot(getMenuRef(), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error(err));

    const unsubSettings = onSnapshot(getSettingsRef(), (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    }, (err) => console.error(err));

    return () => { unsubMenu(); unsubSettings(); };
  }, []);

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
      salePrice: newItem.salePrice ? parseInt(newItem.salePrice) : null,
    });
    setNewItem({ name: "", price: "", salePrice: "", desc: "", image: "", category: newItem.category });
  };

  const addCategory = async () => {
    if (!newCatInput.trim()) return;
    const updated = [...new Set([...(settings.categories || categories), newCatInput.trim()])];
    await updateSettings("categories", updated);
    setNewCatInput("");
  };

  const deleteItem = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));

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
    const list = activeCategory === "الكل" ? menuItems : menuItems.filter(i => i.category === activeCategory);
    return list;
  }, [menuItems, activeCategory]);

  return (
    <div className="min-h-screen transition-all duration-300" style={{ backgroundColor: settings.bgColor, color: '#1a1a1a' }}>
      
      {/* NAVIGATION PANEL */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex bg-black p-1 rounded-full border border-white/20 shadow-2xl">
        <button onClick={() => setView("customer")} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${view === 'customer' ? 'text-white' : 'text-slate-500'}`} style={view === 'customer' ? {backgroundColor: settings.primaryColor} : {}}>Menu</button>
        <button onClick={() => setView("owner")} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500'}`}>Admin</button>
      </div>

      {view === "owner" ? (
        /* ADMIN VIEW */
        <div className="pt-24 px-6 pb-20 max-w-2xl mx-auto">
           {!isUnlocked ? (
             <div className="bg-black p-8 rounded-[2rem] text-center border border-white/10">
                <h2 className="text-white font-black mb-4">كود الدخول</h2>
                <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full bg-white/10 border border-white/20 p-4 rounded-xl text-white text-center mb-4" />
                <button onClick={() => passInput === OWNER_PASSWORD && setIsUnlocked(true)} className="w-full py-4 rounded-xl text-white font-black uppercase tracking-widest" style={{backgroundColor: settings.primaryColor}}>دخول</button>
             </div>
           ) : (
             <div className="space-y-6">
                <div className="bg-white shadow-2xl p-6 rounded-[2rem] border-2 border-black/5">
                   <h3 className="font-black mb-4 border-b pb-2">اعدادات المطعم</h3>
                   <div className="space-y-3">
                      <input className="w-full p-4 bg-slate-50 rounded-xl border font-bold" placeholder="Store Name EN" value={settings.restaurantName} onChange={e => updateSettings("restaurantName", e.target.value)} />
                      <input className="w-full p-4 bg-slate-50 rounded-xl border font-bold" placeholder="اسم المطعم بالعربي" value={settings.restaurantNameAr} onChange={e => updateSettings("restaurantNameAr", e.target.value)} />
                      <div className="flex gap-2 items-center p-4 bg-slate-50 rounded-xl border">
                        <span className="text-xs font-black shrink-0">Background:</span>
                        <input type="color" className="w-full h-8" value={settings.bgColor} onChange={e=>updateSettings("bgColor", e.target.value)} />
                      </div>
                   </div>
                </div>

                <div className="bg-white shadow-2xl p-6 rounded-[2rem] border-2 border-black/5">
                   <h3 className="font-black mb-4 border-b pb-2">الاصناف (Columns)</h3>
                   <div className="flex flex-wrap gap-2 mb-4">
                      {(settings.categories || categories).map(c => <span key={c} className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold">{c}</span>)}
                   </div>
                   <div className="flex gap-2">
                      <input className="flex-1 p-4 bg-slate-50 rounded-xl border font-bold" placeholder="صنف جديد..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                      <button onClick={addCategory} className="bg-black text-white px-6 rounded-xl font-black">اضافة</button>
                   </div>
                </div>

                <div className="bg-white shadow-2xl p-6 rounded-[2rem] border-2 border-black/5">
                   <h3 className="font-black mb-4 border-b pb-2">اضافة وجبة جديدة</h3>
                   <div className="space-y-3">
                      <input className="w-full p-4 bg-slate-50 rounded-xl border font-bold" placeholder="اسم الوجبة" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                      <select className="w-full p-4 bg-slate-50 rounded-xl border font-bold" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                        {(settings.categories || categories).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input className="p-4 bg-slate-50 rounded-xl border font-bold" placeholder="السعر" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                        <input className="p-4 bg-orange-50 rounded-xl border border-orange-200 font-bold" placeholder="سعر العرض (اختياري)" value={newItem.salePrice} onChange={e => setNewItem({...newItem, salePrice: e.target.value})} />
                      </div>
                      <input className="w-full p-4 bg-slate-50 rounded-xl border font-bold" placeholder="رابط الصورة" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                      <button onClick={addNewItem} className="w-full py-5 text-white rounded-xl font-black text-lg" style={{backgroundColor: settings.primaryColor}}>حفظ الوجبة ✅</button>
                   </div>
                </div>

                <div className="bg-black p-6 rounded-[2rem]">
                   <h3 className="text-white font-black mb-4">قائمة الوجبات الحالية</h3>
                   {menuItems.map(item => (
                     <div key={item.id} className="flex justify-between items-center text-white p-4 border-b border-white/10">
                        <span>{item.name}</span>
                        <button onClick={() => deleteItem(item.id)} className="bg-red-500 px-3 py-1 rounded-lg text-[10px] font-black">حذف</button>
                     </div>
                   ))}
                </div>
             </div>
           )}
        </div>
      ) : (
        /* CUSTOMER VIEW */
        <div className="pb-40">
          <header className="pt-24 pb-8 text-center px-6">
             <h1 className="text-5xl font-black italic tracking-tighter drop-shadow-md leading-none mb-1" style={{ color: '#000', WebkitTextStroke: '1px rgba(255,255,255,0.2)' }}>{settings.restaurantName}</h1>
             <h2 className="text-3xl font-black opacity-80" style={{ color: '#000' }}>{settings.restaurantNameAr}</h2>
             <div className="mt-4 inline-flex items-center gap-2 bg-black text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest uppercase">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                {settings.openingHours}
             </div>
          </header>

          {/* COLUMNS / CATEGORIES */}
          <div className="sticky top-[60px] z-[900] py-4 bg-inherit/80 backdrop-blur-xl">
             <div className="max-w-4xl mx-auto flex gap-3 px-6 overflow-x-auto no-scrollbar" dir="rtl">
                <button onClick={() => setActiveCategory("الكل")} className={`shrink-0 px-8 py-4 rounded-2xl text-sm font-black transition-all shadow-lg ${activeCategory === "الكل" ? 'bg-black text-white' : 'bg-white text-black border-2 border-black/5'}`}>الكل</button>
                {(settings.categories || categories).map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setActiveCategory(cat)} 
                    className={`shrink-0 px-8 py-4 rounded-2xl text-sm font-black transition-all shadow-lg ${activeCategory === cat ? 'text-white' : 'bg-white text-black border-2 border-black/5'}`}
                    style={activeCategory === cat ? {backgroundColor: settings.primaryColor} : {}}
                  >
                    {cat}
                  </button>
                ))}
             </div>
          </div>

          {/* GRID OF ITEMS */}
          <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-6" dir="rtl">
             {filteredItems.map(item => (
               <div key={item.id} className="relative group bg-white p-5 rounded-[2.5rem] border-2 border-black/5 shadow-xl hover:shadow-2xl transition-all flex flex-row-reverse gap-6 items-center">
                  
                  {/* BIG DISCOUNT TAG */}
                  {item.salePrice && (
                    <div className="absolute top-4 left-4 z-10 bg-red-600 text-white px-4 py-2 rounded-2xl font-black text-[12px] shadow-lg animate-bounce">
                       عرض خاص!
                    </div>
                  )}

                  <div className="w-32 h-32 md:w-40 md:h-40 shrink-0 rounded-[2.5rem] overflow-hidden bg-slate-100 border-2 border-black/5">
                     <img src={item.image || "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400"} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                  </div>

                  <div className="flex-1 space-y-3">
                     <div>
                        <h3 className="text-xl md:text-2xl font-black leading-tight text-black">{item.name}</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed line-clamp-2">{item.desc || "ألذ وجبة كربلائية مشوية على الفحم"}</p>
                     </div>

                     <div className="flex items-center gap-4">
                        {item.salePrice ? (
                          <div className="flex flex-col">
                             <span className="text-xs font-bold text-red-500 line-through opacity-50">{item.price.toLocaleString()} د.ع</span>
                             <span className="text-2xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{item.salePrice.toLocaleString()} <span className="text-xs">دينار</span></span>
                          </div>
                        ) : (
                          <span className="text-2xl font-black tracking-tighter" style={{ color: settings.primaryColor }}>{item.price.toLocaleString()} <span className="text-xs">دينار</span></span>
                        )}
                     </div>

                     {cart[item.id] ? (
                        <div className="flex items-center gap-4 bg-black p-1 rounded-2xl w-fit">
                           <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 flex items-center justify-center text-white font-black text-xl hover:bg-white/10 rounded-xl">－</button>
                           <span className="text-white font-black text-lg min-w-[20px] text-center">{cart[item.id]}</span>
                           <button onClick={() => addToCart(item)} className="w-10 h-10 flex items-center justify-center text-white font-black text-xl hover:bg-white/10 rounded-xl">＋</button>
                        </div>
                     ) : (
                        <button 
                          onClick={() => addToCart(item)}
                          className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
                        >
                          اضافة للسلة +
                        </button>
                     )}
                  </div>
               </div>
             ))}
          </main>

          {/* CHECKOUT BUTTON (THE FLOATER) */}
          {cartTotal > 0 && (
            <div className="fixed bottom-8 left-0 right-0 z-[1000] px-6">
               <button 
                 onClick={() => setIsCheckoutOpen(true)}
                 className="max-w-md mx-auto w-full bg-black text-white p-3 rounded-[2.5rem] flex items-center justify-between shadow-2xl hover:scale-105 active:scale-95 transition-all border-4 border-white/10"
               >
                  <div className="flex items-center gap-4 pr-2" dir="rtl">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl" style={{ backgroundColor: settings.primaryColor }}>
                       {Object.values(cart).reduce((a,b)=>a+b,0)}
                    </div>
                    <div className="text-right">
                       <p className="text-xs font-bold opacity-60 uppercase tracking-widest">المجموع</p>
                       <p className="text-xl font-black">{cartTotal.toLocaleString()} دينار</p>
                    </div>
                  </div>
                  <div className="pl-8 font-black text-sm uppercase italic tracking-tighter">اطلب الان 🔥</div>
               </button>
            </div>
          )}

          {/* FINAL CHECKOUT SHEET */}
          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-end justify-center p-4">
               <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 shadow-2xl animate-in slide-in-from-bottom-full duration-500" dir="rtl">
                  <div className="flex justify-between items-center mb-8">
                     <h2 className="text-3xl font-black italic">تاكيد الطلب 📝</h2>
                     <button onClick={() => setIsCheckoutOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full font-black text-2xl flex items-center justify-center">×</button>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                     <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 space-y-3">
                        {Object.entries(cart).map(([id, q]) => (
                          <div key={id} className="flex justify-between font-bold text-sm">
                             <span>{q}x {menuItems.find(m=>m.id===id)?.name}</span>
                             <span className="opacity-50">{(menuItems.find(m=>m.id===id)?.salePrice || menuItems.find(m=>m.id===id)?.price) * q} د.ع</span>
                          </div>
                        ))}
                        <div className="pt-4 mt-4 border-t-2 border-slate-200 flex justify-between items-center">
                           <span className="font-black text-lg">المجموع النهائي:</span>
                           <span className="text-3xl font-black" style={{ color: settings.primaryColor }}>{cartTotal.toLocaleString()} د.ع</span>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 gap-4">
                        <input className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-2 border-slate-100 font-bold text-lg" placeholder="اسمك الكريم" value={customerName} onChange={e=>setCustomerName(e.target.value)} />
                        <input className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-2 border-slate-100 font-bold text-lg" placeholder="رقم الموبايل" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} />
                        <textarea className="w-full p-5 bg-slate-50 rounded-[1.5rem] border-2 border-slate-100 font-bold text-lg h-32 resize-none" placeholder="العنوان (مثال: حي الحسين - قرب جامع ...)" value={address} onChange={e=>setAddress(e.target.value)} />
                     </div>
                  </div>

                  <button 
                    disabled={!customerName || !customerPhone || !address}
                    onClick={() => {
                      const text = `🔥 طلب جديد من ${settings.restaurantName} 🔥\n\n👤 الاسم: ${customerName}\n📞 الموبايل: ${customerPhone}\n📍 العنوان: ${address}\n\n🛒 الوجبات:\n${Object.entries(cart).map(([id, q]) => `${q}x ${menuItems.find(m=>m.id===id)?.name}`).join('\n')}\n\n💰 المجموع الكلي: ${cartTotal.toLocaleString()} د.ع`;
                      window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
                    }}
                    className="w-full py-6 bg-[#25D366] text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-[#25D366]/40 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    إرسال الطلب (WhatsApp)
                  </button>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}