// Firebase 設定檔
const firebaseConfig = {
  apiKey: "AIzaSyByb1W2q_apfngaC3k9wrabihzIa-ga2GE",
  authDomain: "schedule-arrange-e6ae7.firebaseapp.com",
  projectId: "schedule-arrange-e6ae7",
  storageBucket: "schedule-arrange-e6ae7.firebasestorage.app",
  messagingSenderId: "279314456298",
  appId: "1:279314456298:web:3155062073ce078a800193",
  measurementId: "G-LBZMDRC1PZ"
};

let db = null;
let isFirebaseConnected = false;

try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_")) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isFirebaseConnected = true;
    console.log("✅ Firebase Firestore 已連線 (專案: " + firebaseConfig.projectId + ")");
  } else {
    console.log("ℹ️ 尚未填入 Firebase API Key，目前使用 LocalStorage 本地儲存模式");
  }
} catch (e) {
  console.error("❌ Firebase 初始化失敗:", e);
}
