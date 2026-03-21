// ============================================
// firebase-config.js - Firebase Configuration
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyD6EmjKlgMeaGPR6-m3nBMOrQLBqVi-m18",
    authDomain: "ltc-refurm-tasks.firebaseapp.com",
    projectId: "ltc-refurm-tasks",
    storageBucket: "ltc-refurm-tasks.firebasestorage.app",
    messagingSenderId: "994324767968",
    appId: "1:994324767968:web:c0897b4f1cbe44a08e9c85",
    measurementId: "G-G3CTSHJB3B"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore with offline persistence (reduces reads dramatically)
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Persistence not available in this browser');
    }
});

// Firestore collections
const COLLECTIONS = {
    subProjects: 'subProjects',
    tasks: 'tasks',
    stakeholders: 'stakeholders'
};

// Connection status indicator (called from store.js listeners)
function updateSyncStatus(connected) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.textContent = connected ? '🟢 מחובר' : '🔴 לא מחובר';
    }
}

console.log('Firebase initialized successfully');
