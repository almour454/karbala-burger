import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, enableIndexedDbPersistence 
} from "firebase/firestore";
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from "firebase/auth";

// --- FIREBASE CONFIG (RESTORED) ---
const firebaseConfig = {
  apiKey: "AIzaSyBi9O20ep4sQEfAQSvQAexHzzT1wjj8cHc",
  authDomain: "karbala-burger-app.firebaseapp.com",
  projectId: "karbala-burger-app",
  storageBucket: "karbala-burger-app.firebasestorage.app",
  messagingSenderId: "112064338237",
  appId: "1:112064338237:web:93b7154a4504704d82cd54"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'karbala-burger-pro-v1';

try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

const getMenuCollection = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 
const PLACEHOLDER = "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop";

export default function App() {
  const [view, setView] = useState("customer");
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [menuItems, setMenuItems] = useState([]);
  const [settings, setSettings] = useState({
    restaurantName: "AL KARBALA BURGER",
    restaurantNameAr: "برجر كربلاء",
    primaryColor: "#ea580c", 
    whatsapp: "964780000000",
    openingHours: "12:00 PM - 12:00 AM"
  });

  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState(""); // Table feature
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", desc: "", image: "", category: "برجر", isVisible: true });

  // Sync Data
  useEffect(() => {
    signInAnonymously(auth);
    const unsubMenu = onSnapshot(getMenuCollection(), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSettings = onSnapshot(getSettingsDoc(), (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    });
    return () => { unsubMenu(); unsubSettings(); };
  }, []);

  const handleAddItem = async () => {
    const id = newItem.id || "item_" + Date.now();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), {
      ...newItem, id, price: Number(newItem.price), isVisible: true
    });
    setNewItem({ name: "", price: "", desc: "", image: "", category: "برجر" });
  };

  const toggleVisibility = async (item) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), {
      ...item, isVisible: !item.isVisible
    });
  };

  const filteredItems = useMemo(() => {
    let items = activeCategory === "الكل" ? menuItems : menuItems.filter(i => i.category === activeCategory);
    return view === "customer" ? items.filter(i => i.isVisible !== false) : items;
  }, [menuItems, activeCategory, view]);

  const sendOrder = () => {
    const itemsStr = Object.entries(cart).map(([id, q]) => {
      const it = menuItems.find(m=>m.id===id);
      return `${q}x ${it?.name}`;
    }).join('\n');
    const tableStr = tableNumber ? `\nرقم الطاولة: ${tableNumber}` : '';
    const text = `طلب جديد من ${customerName}${tableStr}\n\nالأصناف:\n${itemsStr}`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="rtl">
      {/* Navbar */}
      <nav className="p-4 flex justify-center sticky top-0 z-50">
        <div className="bg-black/90 backdrop-blur-md p-1 rounded-full flex gap-2 shadow-xl border border-white/10">
          <button onClick={() => setView("customer")} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${view === 'customer' ? 'text-white' : 'text-slate-500'}`} style={view === 'customer' ? {backgroundColor: settings.primaryColor} : {}}>المنيو</button>
          <button onClick={() => setView("owner")} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${view === 'owner' ? 'bg-white text-black' : 'text-slate-500'}`}>الإدارة</button>
        </div>
      </nav>

      {view === "owner" ? (
        !isUnlocked ? (
          <div className="flex flex-col items-center justify-center pt-20">
            <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} className="p-4 rounded-xl border-2 border-slate-200 text-center text-xl mb-4" placeholder="رمز الدخول" />
            <button onClick={() => passInput === OWNER_PASSWORD && setIsUnlocked(true)} className="bg-black text-white px-10 py-3 rounded-xl font-bold">دخول</button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* ADD ITEM FORM */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="font-black mb-4">إضافة وجبة جديدة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="p-4 bg-slate-50 rounded-xl" placeholder="الاسم" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <input className="p-4 bg-slate-50 rounded-xl" placeholder="السعر" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                <input className="p-4 bg-slate-50 rounded-xl md:col-span-2" placeholder="رابط الصورة" value={newItem.image} onChange={e => setNewItem({...newItem, image: e.target.value})} />
                <button onClick={handleAddItem} className="md:col-span-2 text-white py-4 rounded-xl font-black" style={{backgroundColor: settings.primaryColor}}>حفظ في المنيو</button>
              </div>
            </div>

            {/* LIST MANAGEMENT */}
            <div className="space-y-2">
              {menuItems.map(item => (
                <div key={item.id} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100">
                  <div className="flex items-center gap-4">
                    <img src={item.image || PLACEHOLDER} className={`w-12 h-12 rounded-lg object-cover ${!item.isVisible && 'grayscale opacity-30'}`} />
                    <div>
                      <p className="font-bold text-sm">{item.name}</p>
                      <p className="text-[10px] text-slate-400">{item.price} د.ع</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleVisibility(item)} className={`p-2 rounded-lg text-xs font-bold ${item.isVisible ? 'bg-slate-100' : 'bg-red-100 text-red-600'}`}>
                      {item.isVisible ? "ظاهر" : "مخفي"}
                    </button>
                    <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id))} className="text-red-500 text-xs font-bold p-2">حذف</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="animate-fade-in">
          {/* Header */}
          <header className="py-12 px-6 text-center">
            <h1 className="text-6xl font-black italic tracking-tighter text-slate-900">{settings.restaurantName}</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest mt-2">{settings.openingHours}</p>
          </header>

          {/* Categories */}
          <div className="flex gap-2 px-6 overflow-x-auto no-scrollbar pb-4 max-w-2xl mx-auto">
            {["الكل", "برجر", "مقبلات", "مشروبات"].map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-8 py-3 rounded-2xl text-xs font-black transition-all ${activeCategory === cat ? 'bg-black text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{cat}</button>
            ))}
          </div>

          {/* MENU GRID (RESTORED COLUMNS) */}
          <main className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-8">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-white p-3 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col group">
                <div className="aspect-square rounded-[1.5rem] overflow-hidden mb-3 bg-slate-50">
                  <img src={item.image || PLACEHOLDER} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div className="flex-1 px-1">
                  <h3 className="font-black text-sm text-slate-800 leading-none mb-1">{item.name}</h3>
                  <p className="text-[9px] text-slate-400 font-bold mb-3">{item.price.toLocaleString()} د.ع</p>
                  <button onClick={() => setCart(p => ({...p, [item.id]: (p[item.id] || 0) + 1}))} className="w-full py-2 bg-slate-50 rounded-xl text-[10px] font-black hover:bg-black hover:text-white transition-all">+ إضافة</button>
                </div>
              </div>
            ))}
          </main>
        </div>
      )}

      {/* Floating Cart Button */}
      {Object.keys(cart).length > 0 && view === "customer" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
          <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white p-4 rounded-full flex justify-between items-center shadow-2xl">
            <span className="bg-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black text-xs">{Object.values(cart).reduce((a,b)=>a+b,0)}</span>
            <span className="font-black text-xs tracking-widest uppercase">عرض الطلب ➔</span>
            <span className="font-black text-sm">إتمام</span>
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black italic">تأكيد الطلب 🧾</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-2xl opacity-20">×</button>
            </div>
            <div className="space-y-4 mb-8">
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-100 outline-none focus:border-orange-500" placeholder="اسمك الكامل" />
              <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-100 outline-none focus:border-orange-500" placeholder="رقم الطاولة (اختياري)" />
            </div>
            <button onClick={sendOrder} className="w-full py-5 bg-[#25D366] text-white font-black rounded-xl text-sm shadow-xl">إرسال عبر واتساب ✅</button>
          </div>
        </div>
      )}
    </div>
  );
}