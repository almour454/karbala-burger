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
  Printer, 
  Play,
  ChefHat,
  CheckCircle2,
  Trash2,
  Phone,
  Settings,
  ShoppingBag
} from "lucide-react";

const localConfig = {
  apiKey: "AIzaSyBi9O20ep4sQEfAQSvQAexHzzT1wjj8cHc",
  authDomain: "karbala-burger-app.firebaseapp.com",
  projectId: "karbala-burger-app",
  storageBucket: "karbala-burger-app.firebasestorage.app",
  messagingSenderId: "112064338237",
  appId: "1:112064338237:web:93b7154a4504704d82cd54"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'karbala-burger-pro-v2';

const getMenuColl = () => collection(db, 'artifacts', appId, 'public', 'data', 'menu');
const getOrdersColl = () => collection(db, 'artifacts', appId, 'public', 'data', 'orders');
const getSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

const OWNER_PASSWORD = "12345"; 
const PING_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

const formatPrice = (p) => p?.toLocaleString() + " د.ع";

export default function App() {
  const [view, setView] = useState("customer");
  const [adminTab, setAdminTab] = useState("orders");
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState(false);
  const [currentPrintOrder, setCurrentPrintOrder] = useState(null);
  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [settings, setSettings] = useState({
    restaurantNameAr: "برجر كربلاء",
    primaryColor: "#ea580c",
    whatsapp: "964780000000"
  });

  const audioRef = useRef(new Audio(PING_SOUND_URL));
  const printedIds = useRef(new Set());

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

  useEffect(() => {
    if (!user) return;
    onSnapshot(getMenuColl(), s => setMenuItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(getSettingsDoc(), s => s.exists() && setSettings(p => ({ ...p, ...s.data() })));

    const q = query(getOrdersColl(), orderBy('timestamp', 'desc'), limit(15));
    return onSnapshot(q, (snapshot) => {
      const orderList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(orderList);

      if (isSystemActive && isAutoPrintEnabled) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            const oid = change.doc.id;
            const isFresh = (Date.now() - (data.timestamp?.toMillis() || 0)) < 30000;

            if (isFresh && !printedIds.current.has(oid)) {
              executeSilentPrint(oid, data);
            }
          }
        });
      }
    });
  }, [user, isSystemActive, isAutoPrintEnabled]);

  const executeSilentPrint = (id, data) => {
    printedIds.current.add(id);
    setCurrentPrintOrder({ id, ...data });
    audioRef.current.play().catch(() => {});
    
    // The "Silent Hack": Use a small delay then trigger.
    // Combined with --kiosk-printing in Chrome, this is 100% automated.
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handleCheckout = async () => {
    const orderData = {
      customer: customerInfo,
      items: Object.entries(cart).map(([id, q]) => {
        const item = menuItems.find(m => m.id === id);
        return { name: item.name, quantity: q, price: item.price };
      }),
      totalPrice: Object.entries(cart).reduce((t, [id, q]) => t + (menuItems.find(m => m.id === id)?.price * q), 0),
      status: 'pending',
      timestamp: serverTimestamp()
    };
    await addDoc(getOrdersColl(), orderData);
    setCart({});
    setIsCheckoutOpen(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <nav className="no-print flex justify-center p-4 sticky top-0 z-[100] bg-white/80 backdrop-blur-md border-b">
        <div className="flex bg-zinc-900 p-1 rounded-full">
          <button onClick={() => setView("customer")} className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${view === 'customer' ? 'bg-orange-600 text-white' : 'text-zinc-400'}`}>المنيو</button>
          <button onClick={() => setView("owner")} className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${view === 'owner' ? 'bg-white text-black' : 'text-zinc-400'}`}>الادارة</button>
        </div>
      </nav>

      {view === "customer" ? (
        <div className="max-w-4xl mx-auto p-6" dir="rtl">
          <header className="text-center py-12">
            <h1 className="text-5xl font-black text-zinc-900 italic">{settings.restaurantNameAr}</h1>
            <p className="text-zinc-400 font-bold mt-2">أهلاً بكم في مطعمنا</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-32">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-3xl shadow-sm border flex items-center gap-4">
                <img src={item.image || "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200"} className="w-24 h-24 rounded-2xl object-cover" />
                <div className="flex-1">
                  <h3 className="font-black text-lg">{item.name}</h3>
                  <p className="text-orange-600 font-black">{formatPrice(item.price)}</p>
                  <button onClick={() => setCart(p => ({...p, [item.id]: (p[item.id]||0)+1}))} className="mt-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold">إضافة +</button>
                </div>
              </div>
            ))}
          </div>

          {Object.keys(cart).length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-orange-600 text-white p-5 rounded-2xl shadow-2xl flex justify-between items-center font-black">
                <span>تأكيد الطلب</span>
                <span>{formatPrice(Object.entries(cart).reduce((t, [id, q]) => t + (menuItems.find(m => m.id === id)?.price * q), 0))}</span>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-8" dir="rtl">
                <h2 className="text-2xl font-black mb-6">معلومات التوصيل</h2>
                <input className="w-full p-4 bg-zinc-100 rounded-xl mb-3 font-bold" placeholder="الاسم" onChange={e => setCustomerInfo({...customerInfo, name:e.target.value})} />
                <input className="w-full p-4 bg-zinc-100 rounded-xl mb-3 font-bold" placeholder="الهاتف" onChange={e => setCustomerInfo({...customerInfo, phone:e.target.value})} />
                <textarea className="w-full p-4 bg-zinc-100 rounded-xl mb-6 font-bold" placeholder="العنوان" onChange={e => setCustomerInfo({...customerInfo, address:e.target.value})} />
                <button onClick={handleCheckout} className="w-full py-4 bg-zinc-900 text-white rounded-xl font-black">إرسال الطلب</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-2 py-2 text-zinc-400 font-bold">إلغاء</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-5xl mx-auto p-6" dir="rtl">
          {!isUnlocked ? (
            <div className="flex flex-col items-center py-20">
              <input type="password" placeholder="كلمة المرور" className="p-4 bg-white border rounded-xl text-center text-2xl mb-4" onChange={e => e.target.value === OWNER_PASSWORD && setIsUnlocked(true)} />
            </div>
          ) : (
            <>
              <div className="bg-zinc-900 text-white p-8 rounded-[2.5rem] mb-8 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${isSystemActive ? 'bg-green-600' : 'bg-zinc-800'}`}>
                    <Printer size={30} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black italic uppercase">نظام الطباعة التلقائي</h2>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-tighter">الحالة: {isSystemActive ? 'نشط ويعمل' : 'متوقف'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isSystemActive ? (
                    <button onClick={() => {setIsSystemActive(true); setIsAutoPrintEnabled(true);}} className="bg-orange-600 px-8 py-4 rounded-xl font-black uppercase text-xs flex items-center gap-2"><Play size={16} fill="white" /> تشغيل النظام</button>
                  ) : (
                    <button onClick={() => setIsAutoPrintEnabled(!isAutoPrintEnabled)} className={`px-8 py-4 rounded-xl font-black text-xs ${isAutoPrintEnabled ? 'bg-green-600' : 'bg-red-600'}`}>الطباعة التلقائية: {isAutoPrintEnabled ? 'مفعلة' : 'معطلة'}</button>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                {orders.map(order => (
                  <div key={order.id} className={`bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row justify-between gap-6 ${order.status === 'completed' ? 'opacity-50' : ''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black italic uppercase">#{order.id.slice(0,5)}</span>
                        <h4 className="text-xl font-black">{order.customer?.name}</h4>
                      </div>
                      <p className="text-sm font-bold text-zinc-500">{order.customer?.phone} | {order.customer?.address}</p>
                      <div className="mt-4 space-y-1">
                        {order.items?.map((it, i) => <div key={i} className="text-sm font-bold"><span className="text-orange-600">{it.quantity}x</span> {it.name}</div>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between gap-4">
                      <div className="text-2xl font-black italic">{formatPrice(order.totalPrice)}</div>
                      <div className="flex gap-2">
                        <button onClick={() => executeSilentPrint(order.id, order)} className="p-4 bg-zinc-100 rounded-xl hover:bg-zinc-200"><Printer size={20} /></button>
                        {order.status === 'pending' && <button onClick={() => updateDoc(doc(getOrdersColl(), order.id), {status:'completed'})} className="bg-green-600 text-white px-6 py-4 rounded-xl font-black text-xs">تم التوصيل</button>}
                        <button onClick={() => deleteDoc(doc(getOrdersColl(), order.id))} className="p-4 text-red-600 bg-red-50 rounded-xl"><Trash2 size={20} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* RECEIPT DESIGN */}
      <div id="thermal-receipt" className="print-only">
        {currentPrintOrder && (
          <div style={{ padding: '0 5mm', direction: 'rtl', textAlign: 'right', fontFamily: 'monospace' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <h1 style={{ fontSize: '20px', margin: '0' }}>{settings.restaurantNameAr}</h1>
              <p style={{ fontSize: '12px', margin: '2px 0' }}>كربلاء - شارع السناتر</p>
              <p style={{ fontSize: '11px', borderBottom: '1px dashed black', paddingBottom: '10px' }}>{new Date().toLocaleString()}</p>
            </div>
            <div style={{ fontSize: '13px', marginBottom: '10px' }}>
              <p><strong>الزبون:</strong> {currentPrintOrder.customer?.name}</p>
              <p><strong>الهاتف:</strong> {currentPrintOrder.customer?.phone}</p>
              <p><strong>العنوان:</strong> {currentPrintOrder.customer?.address}</p>
            </div>
            <div style={{ borderBottom: '1px dashed black', marginBottom: '10px' }}></div>
            <div style={{ minHeight: '80px' }}>
              {currentPrintOrder.items?.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{it.quantity}x {it.name}</span>
                  <span>{formatPrice(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '2px solid black', marginTop: '10px', paddingTop: '5px', textAlign: 'left' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '0' }}>المجموع: {formatPrice(currentPrintOrder.totalPrice)}</p>
            </div>
            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '10px' }}>
              <p>شكراً لزيارتكم!</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; width: 80mm; }
          body { background: white; margin: 0; }
          @page { margin: 0; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  );
}