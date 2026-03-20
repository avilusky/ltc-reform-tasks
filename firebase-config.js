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

// Initialize Firestore
const db = firebase.firestore();

// Firestore collections
const COLLECTIONS = {
    subProjects: 'subProjects',
    tasks: 'tasks'
};

// Connection status indicator
function updateSyncStatus(connected) {
    const el = document.getElementById('sync-status');
    if (el) {
        el.textContent = connected ? '🟢 מחובר' : '🔴 לא מחובר';
    }
}

// Listen to Firestore snapshot to detect connection
db.collection(COLLECTIONS.tasks).limit(1).onSnapshot(
    () => updateSyncStatus(true),
    () => updateSyncStatus(false)
);

console.log('Firebase initialized successfully');
