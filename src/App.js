import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc
} from "firebase/firestore";
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from "firebase/auth";

// --- FIREBASE SETUP ---
const firebaseConfig = typeof window !== 'undefined' && window.__firebase_config 
  ? JSON.parse(window.__firebase_config) 
  : {
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

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id 
  : 'karbala-burger-basic-v1';

const OWNER_PASSWORD = "123"; // Simple password for testing

export default function App() {
  const [view, setView] = useState("customer"); 
  const [user, setUser] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Owner State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", desc: "", category: "Burgers" });
  
  // Customer State
  const [cart, setCart] = useState({});

  // --- INITIALIZE & FETCH DATA ---
  useEffect(() => {
    let unsubMenu = () => {};

    const initAuth = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.__initial_auth_token : null;
        if (token) await signInWithCustomToken(auth, token);
        else await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth error", e);
      }
    };

    initAuth();

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch menu items ONLY after auth is confirmed
        const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
        unsubMenu = onSnapshot(menuRef, (snap) => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setMenuItems(items);
          setIsLoading(false);
        }, (err) => {
          console.error("Menu fetch error", err);
          setIsLoading(false);
        });
      }
    });

    return () => {
      unsubAuth();
      unsubMenu();
    };
  }, []);

  // --- OWNER FUNCTIONS ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (passInput === OWNER_PASSWORD) setIsUnlocked(true);
    else alert("Wrong password! (Hint: it's 123)");
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    
    const id = "item_" + Date.now();
    const itemData = {
      ...newItem,
      id,
      price: parseInt(newItem.price) || 0
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), itemData);
      setNewItem({ name: "", price: "", desc: "", category: "Burgers" }); // Reset form
    } catch (err) {
      console.error("Error adding item", err);
    }
  };

  const handleDeleteItem = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id));
    } catch (err) {
      console.error("Error deleting item", err);
    }
  };

  // --- CUSTOMER FUNCTIONS ---
  const addToCart = (id) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  
  const cartTotal = Object.entries(cart).reduce((total, [id, qty]) => {
    const item = menuItems.find(m => m.id === id);
    return item ? total + (item.price * qty) : total;
  }, 0);

  // --- RENDER CUSTOMER VIEW ---
  if (view === "customer") {
    return (
      <div className="min-h-screen bg-orange-50 p-4 md:p-8 font-sans">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm">
          <h1 className="text-2xl font-black text-orange-600">AL KARBALA BURGER</h1>
          <button onClick={() => setView("owner")} className="text-sm font-bold text-gray-500 hover:text-orange-600">
            Owner Login &rarr;
          </button>
        </div>

        {/* Menu Display */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 font-bold animate-pulse">
            Loading Menu...
          </div>
        ) : menuItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
            <h2 className="text-xl font-bold text-gray-600">The menu is empty right now.</h2>
            <p className="text-gray-400 mt-2">The owner hasn't added any items yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white p-6 rounded-3xl shadow-sm flex flex-col justify-between border border-orange-100 hover:shadow-md transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-800">{item.name}</h3>
                    <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-lg">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mb-4">{item.desc}</p>
                </div>
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                  <span className="text-lg font-black text-orange-600">{item.price.toLocaleString()} IQD</span>
                  <button 
                    onClick={() => addToCart(item.id)}
                    className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-600 active:scale-95 transition-all"
                  >
                    Add to Cart {cart[item.id] > 0 && `(${cart[item.id]})`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating Cart Total */}
        {cartTotal > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-8 py-4 rounded-full shadow-2xl font-bold flex gap-4 items-center">
            <span>Total: {cartTotal.toLocaleString()} IQD</span>
            <button className="bg-orange-500 px-4 py-2 rounded-full text-sm hover:bg-orange-400">Order Now</button>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER OWNER VIEW ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm">
          <h1 className="text-2xl font-black text-gray-800">Kitchen Dashboard</h1>
          <button onClick={() => setView("customer")} className="text-sm font-bold text-gray-500 hover:text-gray-800">
            &larr; Back to Menu
          </button>
        </div>

        {!isUnlocked ? (
          /* Login Form */
          <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-sm max-w-sm mx-auto text-center">
            <h2 className="text-xl font-bold mb-4">Owner Access</h2>
            <input 
              type="password" 
              value={passInput} 
              onChange={e => setPassInput(e.target.value)}
              placeholder="Password (123)"
              className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl mb-4 text-center"
            />
            <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl">Unlock</button>
          </form>
        ) : (
          /* Admin Panel */
          <div className="space-y-8">
            {/* Add New Item Form */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-6 text-gray-800">Add New Item to Menu</h2>
              <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  placeholder="Item Name (e.g., Double Burger)" 
                  value={newItem.name} 
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  className="bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:border-orange-500"
                  required
                />
                <input 
                  type="number"
                  placeholder="Price in IQD (e.g., 5000)" 
                  value={newItem.price} 
                  onChange={e => setNewItem({...newItem, price: e.target.value})}
                  className="bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:border-orange-500"
                  required
                />
                <select 
                  value={newItem.category}
                  onChange={e => setNewItem({...newItem, category: e.target.value})}
                  className="bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none md:col-span-2"
                >
                  <option value="Burgers">Burgers</option>
                  <option value="Drinks">Drinks</option>
                  <option value="Sides">Sides</option>
                  <option value="Mandi">Mandi</option>
                </select>
                <textarea 
                  placeholder="Short Description..." 
                  value={newItem.desc} 
                  onChange={e => setNewItem({...newItem, desc: e.target.value})}
                  className="bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none md:col-span-2 resize-none h-24"
                />
                <button type="submit" className="bg-orange-600 text-white font-bold py-4 rounded-xl md:col-span-2 hover:bg-orange-700">
                  Post to Live Menu
                </button>
              </form>
            </div>

            {/* Manage Existing Items */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-6 text-gray-800">Manage Live Items ({menuItems.length})</h2>
              {menuItems.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No items on the menu yet.</p>
              ) : (
                <div className="space-y-3">
                  {menuItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div>
                        <p className="font-bold text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.price.toLocaleString()} IQD • {item.category}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-500 bg-red-50 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-500 hover:text-white transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}