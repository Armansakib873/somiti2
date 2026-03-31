// ===== FIREBASE REALTIME DATABASE SYNC =====
// This file handles all Firebase connectivity for the Somiti app.
// It uses Firebase Realtime Database as the single source of truth.
// localStorage is used as a local cache / offline fallback.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyACRVW8V_MWB3cU9aYydsDjoJMUCmO8T_M",
  authDomain: "somiti2.firebaseapp.com",
  databaseURL: "https://somiti2-default-rtdb.firebaseio.com",
  projectId: "somiti2",
  storageBucket: "somiti2.firebasestorage.app",
  messagingSenderId: "289064840559",
  appId: "1:289064840559:web:e84b3928e1086279cf4c9a"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const DATA_REF = "appData";
const APP_STORAGE_KEY = "somobayFundDataV4"; // Must match app.js

let _firebaseReady = false;
let _pendingSave = null;

/**
 * Load data from Firebase. Falls back to localStorage if offline.
 * Calls onLoaded(data) once data is available.
 * Also sets up a real-time listener so all devices stay in sync.
 */
window.firebaseLoadData = function(onLoaded) {
  const dbRef = ref(db, DATA_REF);

  // First, try to get data once (handles initial load)
  get(dbRef).then((snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      // Cache locally
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data));
      onLoaded(data);
    } else {
      // No data in Firebase yet — check localStorage
      const stored = localStorage.getItem(APP_STORAGE_KEY);
      if (stored) {
        const localData = JSON.parse(stored);
        // Push local data up to Firebase so it becomes the source of truth
        set(dbRef, localData).then(() => {
          console.log("Local data pushed to Firebase.");
        });
        onLoaded(localData);
      } else {
        onLoaded(null); // No data anywhere
      }
    }
    _firebaseReady = true;

    // Flush any pending save that happened before Firebase was ready
    if (_pendingSave !== null) {
      set(ref(db, DATA_REF), _pendingSave);
      _pendingSave = null;
    }

    // Set up real-time listener for cross-device sync
    onValue(dbRef, (snap) => {
      if (!snap.exists()) return;
      const remoteData = snap.val();
      const localStr = localStorage.getItem(APP_STORAGE_KEY);
      const localData = localStr ? JSON.parse(localStr) : null;

      // Merge: keep local transactions/depositHistory if remote is missing them
      if (remoteData && localData) {
        if (!remoteData.transactions && localData.transactions && localData.transactions.length > 0) {
          remoteData.transactions = localData.transactions;
        }
        if (!remoteData.depositHistory && localData.depositHistory && localData.depositHistory.length > 0) {
          remoteData.depositHistory = localData.depositHistory;
        }
      }

      // Only update UI if remote data differs from local cache
      if (JSON.stringify(remoteData) !== JSON.stringify(localData)) {
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(remoteData));
        // Update appState and refresh UI (defined in app.js)
        if (typeof appState !== "undefined") {
          appState = remoteData;
          if (typeof refreshUI === "function") refreshUI();
        }
      }
    });

  }).catch((error) => {
    console.warn("Firebase read failed, using localStorage:", error);
    _firebaseReady = false;
    const stored = localStorage.getItem(APP_STORAGE_KEY);
    onLoaded(stored ? JSON.parse(stored) : null);
  });
};

/**
 * Save data to Firebase Realtime Database AND localStorage.
 */
window.firebaseSaveData = function(data) {
  // Always save to localStorage immediately (offline support)
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data));

  if (_firebaseReady) {
    set(ref(db, DATA_REF), data).catch((err) => {
      console.warn("Firebase write failed:", err);
    });
  } else {
    // Queue the save for when Firebase is ready
    _pendingSave = data;
  }
};
