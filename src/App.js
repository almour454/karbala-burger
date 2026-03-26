import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit,
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
  Trash2,
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
  const [user, setUser] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState(false);
  const [cart, setCart] = useState({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  const [isUnlocked, setIsUnlocked] = useState(false);
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
              executeIframePrint(oid, data);
            }
          }
        });
      }
    });
  }, [user, isSystemActive, isAutoPrintEnabled]);

  const executeIframePrint = (id, orderData) => {
    printedIds.current.add(id);
    audioRef.current.play().catch(() => {});
    
    // Create a hidden, separate "browser" just for the receipt
    // This stops the main screen from freezing when Chrome prompts the printer
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    printFrame.style.width = '0px';
    printFrame.style.height = '0px';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow.document;
    
    // Construct the receipt HTML for a generic thermal printer (80mm)
    const receiptHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <style>
            @media print {
              @page { margin: 0; padding: 0; }
              body { margin: 0; padding: 10px; font-family: monospace, Tahoma, sans-serif; background: white; color: black; font-size: 14px; width: 80mm; }
              .header { text-align: center; margin-bottom: 15px; border-bottom: 2px dashed black; padding-bottom: 10px; }
              h1 { font-size: 22px; margin: 0; padding: 0; }
              p { margin: 4px 0; }
              .items { border-bottom: 2px dashed black; margin-bottom: 10px; padding-bottom: 10px; }
              .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; border-top: 2px solid black; padding-top: 10px; margin-top: 10px; }
              .footer { text-align: center; font-size: 12px; margin-top: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${settings.restaurantNameAr}</h1>
            <p>طلب رقم: #${id.slice(0, 5)}</p>
            <p>${new Date().toLocaleString()}</p>
            <p><strong>الزبون:</strong> ${orderData.customer?.name || "غير معروف"}</p>
            <p><strong>الهاتف:</strong> ${orderData.customer?.phone || "غير معروف"}</p>
            <p><strong>العنوان:</strong> ${orderData.customer?.address || "غير معروف"}</p>
          </div>
          
          <div class="items">
            ${orderData.items ? orderData.items.map(it => `
              <div class="item">
                <span>${it.quantity}x ${it.name}</span>
                <span>${formatPrice(it.price * it.quantity)}</span>
              </div>
            `).join('') : ''}
          </div>

          <div class="total">
            <span>المجموع الكلي:</span>
            <span>${formatPrice(orderData.totalPrice)}</span>
          </div>

          <div class="footer">
            <p>شكراً لزيارتكم!</p>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(receiptHtml);
    doc.close();

    // Give the iframe a tiny moment to render the HTML, then print and destroy it.
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      
      // Clean up the DOM after printing is triggered
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 5000);
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
      <nav className="flex justify-center p-4 sticky top-0 z-[100] bg-white/80 backdrop-blur-md border-b">
        <div className="flex bg-zinc-900 p-1 rounded-full shadow-lg">
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
              <div key={item.id} className="bg-white p-4 rounded-3xl shadow-sm border flex items-center gap-4 hover:shadow-md transition-shadow">
                <img src={item.image || "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200"} className="w-24 h-24 rounded-2xl object-cover border-2 border-zinc-100" />
                <div className="flex-1">
                  <h3 className="font-black text-lg text-zinc-800">{item.name}</h3>
                  <p className="text-orange-600 font-black">{formatPrice(item.price)}</p>
                  <button onClick={() => setCart(p => ({...p, [item.id]: (p[item.id]||0)+1}))} className="mt-3 bg-zinc-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors w-full md:w-auto">إضافة +</button>
                </div>
              </div>
            ))}
            {menuItems.length === 0 && <p className="text-center col-span-full text-zinc-400 font-bold">لا توجد عناصر في المنيو حالياً</p>}
          </div>

          {Object.keys(cart).length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[90]">
              <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-orange-600 text-white p-5 rounded-2xl shadow-[0_10px_40px_-10px_rgba(234,88,12,0.5)] flex justify-between items-center font-black transition-transform hover:scale-105 active:scale-95">
                <span>تأكيد الطلب</span>
                <span>{formatPrice(Object.entries(cart).reduce((t, [id, q]) => t + (menuItems.find(m => m.id === id)?.price * q), 0))}</span>
              </button>
            </div>
          )}

          {isCheckoutOpen && (
            <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl" dir="rtl">
                <h2 className="text-2xl font-black mb-6 text-zinc-900">معلومات التوصيل</h2>
                <input className="w-full p-4 bg-zinc-100 rounded-xl mb-3 font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="الاسم" onChange={e => setCustomerInfo({...customerInfo, name:e.target.value})} />
                <input className="w-full p-4 bg-zinc-100 rounded-xl mb-3 font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="الهاتف" onChange={e => setCustomerInfo({...customerInfo, phone:e.target.value})} />
                <textarea className="w-full p-4 bg-zinc-100 rounded-xl mb-6 font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none h-24" placeholder="العنوان" onChange={e => setCustomerInfo({...customerInfo, address:e.target.value})} />
                <button onClick={handleCheckout} className="w-full py-4 bg-zinc-900 text-white rounded-xl font-black hover:bg-orange-600 transition-colors">إرسال الطلب</button>
                <button onClick={() => setIsCheckoutOpen(false)} className="w-full mt-3 py-3 text-zinc-400 font-bold hover:bg-zinc-100 rounded-xl transition-colors">إلغاء</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-5xl mx-auto p-6" dir="rtl">
          {!isUnlocked ? (
            <div className="flex flex-col items-center py-20">
              <div className="bg-white p-8 rounded-3xl shadow-sm border text-center">
                <h2 className="text-2xl font-black mb-6 text-zinc-800">تسجيل الدخول للإدارة</h2>
                <input type="password" placeholder="كلمة المرور" className="p-4 bg-zinc-100 border-none rounded-xl text-center text-xl mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500 font-black w-full" onChange={e => e.target.value === OWNER_PASSWORD && setIsUnlocked(true)} />
                <p className="text-xs text-zinc-400 font-bold">الرمز الافتراضي: 12345</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-zinc-900 text-white p-8 rounded-[2.5rem] mb-8 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${isSystemActive ? 'bg-green-600' : 'bg-zinc-800'} transition-colors`}>
                    <Printer size={30} className={isSystemActive && isAutoPrintEnabled ? 'animate-pulse' : ''} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black italic uppercase">نظام الطباعة الخفي</h2>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-tighter">الحالة: {isSystemActive ? 'نشط (جاهز لاستقبال الطلبات)' : 'متوقف'}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  {!isSystemActive ? (
                    <button onClick={() => {setIsSystemActive(true); setIsAutoPrintEnabled(true);}} className="bg-orange-600 px-8 py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-orange-500 transition-colors w-full"><Play size={16} fill="white" /> تشغيل النظام</button>
                  ) : (
                    <button onClick={() => setIsAutoPrintEnabled(!isAutoPrintEnabled)} className={`px-8 py-4 rounded-xl font-black text-xs w-full transition-colors shadow-inner ${isAutoPrintEnabled ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>الطباعة التلقائية: {isAutoPrintEnabled ? 'مفعلة' : 'معطلة'}</button>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                {orders.map(order => (
                  <div key={order.id} className={`bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row justify-between gap-6 transition-opacity ${order.status === 'completed' ? 'opacity-50 hover:opacity-100' : ''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black italic uppercase">#{order.id.slice(0,5)}</span>
                        <h4 className="text-xl font-black text-zinc-800">{order.customer?.name || "بدون اسم"}</h4>
                      </div>
                      <p className="text-sm font-bold text-zinc-500 mb-4 bg-zinc-50 p-3 rounded-xl inline-block">{order.customer?.phone || "بدون رقم"} <br/><span className="text-zinc-400">{order.customer?.address || "بدون عنوان"}</span></p>
                      <div className="space-y-2">
                        {order.items?.map((it, i) => <div key={i} className="text-sm font-bold bg-zinc-50 px-3 py-2 rounded-lg flex items-center gap-2 w-max"><span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-md">{it.quantity}x</span> {it.name}</div>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between gap-4 border-t md:border-t-0 md:border-r border-zinc-100 pt-4 md:pt-0 md:pr-6">
                      <div className="text-3xl font-black italic text-zinc-900">{formatPrice(order.totalPrice)}</div>
                      <div className="flex gap-2 flex-wrap justify-end w-full">
                        <button onClick={() => executeIframePrint(order.id, order)} className="p-4 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 hover:text-black transition-colors" title="طباعة يدوية"><Printer size={20} /></button>
                        {order.status === 'pending' && <button onClick={() => updateDoc(doc(getOrdersColl(), order.id), {status:'completed'})} className="bg-green-600 text-white px-6 py-4 rounded-xl font-black text-xs hover:bg-green-500 transition-colors shadow-sm">تم التوصيل</button>}
                        <button onClick={() => deleteDoc(doc(getOrdersColl(), order.id))} className="p-4 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors"><Trash2 size={20} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && <p className="text-center text-zinc-400 font-bold py-10">لا توجد طلبات حالياً.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}