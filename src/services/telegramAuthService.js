// telegramAuthService.js
// Place this file in src/services/telegramAuthService.js

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    serverTimestamp
} from 'firebase/firestore';

// Your Firebase config - REPLACE WITH YOUR ACTUAL CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyCSEXO8zsXHtF6_zcWMPZqHgjP1nokYftY",
    authDomain: "zorixshooter.firebaseapp.com",
    projectId: "zorixshooter",
    storageBucket: "zorixshooter.firebasestorage.app",
    messagingSenderId: "983540791855",
    appId: "1:983540791855:web:d76a065a07319957ebe4da",
    measurementId: "G-F1JQG1LN6F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

class TelegramAuthService {
    constructor() {
        this.currentUser = null;
        this.userData = null;
    }

    // Sign in with Telegram data
    async signInWithTelegram(telegramData) {
        try {
            console.log('Signing in with Telegram data:', telegramData);

            // Sign in anonymously
            const userCredential = await signInAnonymously(auth);
            this.currentUser = userCredential.user;

            console.log('Anonymous sign-in successful. User ID:', this.currentUser.uid);

            // Check if user exists in Firestore
            const userDoc = await this.checkUserExists(this.currentUser.uid);

            if (userDoc.exists) {
                // User exists, load their data
                this.userData = userDoc.data();
                console.log('Existing user found:', this.userData);

                return {
                    success: true,
                    isNewUser: false,
                    userData: this.userData
                };
            } else {
                // New user, store initial Telegram data
                this.userData = {
                    userId: this.currentUser.uid,
                    telegramId: telegramData.id.toString(),
                    telegramUsername: telegramData.username || '',
                    telegramFirstName: telegramData.first_name || '',
                    telegramLastName: telegramData.last_name || '',
                    authProvider: 'telegram',
                    hasUsername: false,
                    isApproved: false,
                    registrationDate: new Date().toISOString()
                };

                console.log('New user, initial data created');

                return {
                    success: true,
                    isNewUser: true,
                    userData: this.userData,
                    suggestedUsername: telegramData.username || telegramData.first_name || ''
                };
            }
        } catch (error) {
            console.error('Sign-in error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Check if user exists in Firestore
    async checkUserExists(userId) {
        try {
            const userRef = doc(db, 'users', userId);
            return await getDoc(userRef);
        } catch (error) {
            console.error('Error checking user:', error);
            throw error;
        }
    }

    // Create username with discriminator
    async createUsername(username) {
        try {
            // Validate username
            if (!username || username.length < 3 || username.length > 16) {
                return {
                    success: false,
                    error: 'Username must be 3-16 characters'
                };
            }

            // Find next available discriminator
            const usersRef = collection(db, 'users');
            const q = query(
                usersRef,
                where('username', '==', username),
                orderBy('discriminator', 'desc'),
                limit(1)
            );

            const snapshot = await getDocs(q);
            let discriminator = '0001';

            if (!snapshot.empty) {
                const lastDoc = snapshot.docs[0];
                const lastDiscriminator = lastDoc.data().discriminator;
                const lastNumber = parseInt(lastDiscriminator);
                discriminator = (lastNumber + 1).toString().padStart(4, '0');
            }

            const fullUsername = `${username}#${discriminator}`;

            // Create user document
            const userRef = doc(db, 'users', this.currentUser.uid);
            const userData = {
                username: username,
                discriminator: discriminator,
                fullUsername: fullUsername,
                userId: this.currentUser.uid,
                telegramId: this.userData.telegramId,
                telegramUsername: this.userData.telegramUsername,
                telegramFirstName: this.userData.telegramFirstName,
                telegramLastName: this.userData.telegramLastName || '',
                authProvider: 'telegram',
                hasUsername: true,
                isApproved: false,
                createdAt: serverTimestamp(),
                registrationDate: new Date().toISOString()
            };

            await setDoc(userRef, userData);

            // Create username lookup document
            const usernameRef = doc(db, 'usernames', fullUsername);
            await setDoc(usernameRef, {
                userId: this.currentUser.uid
            });

            this.userData = userData;

            console.log('Username created successfully:', fullUsername);

            return {
                success: true,
                username: username,
                discriminator: discriminator,
                fullUsername: fullUsername
            };
        } catch (error) {
            console.error('Error creating username:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Verify access code
    async verifyAccessCode(code) {
        try {
            if (!code || code.trim() === '') {
                return {
                    success: false,
                    error: 'Code cannot be empty'
                };
            }

            // Get codes document
            const codesRef = doc(db, 'SpecificData', 'Codes');
            const codesDoc = await getDoc(codesRef);

            if (!codesDoc.exists()) {
                return {
                    success: false,
                    error: 'Code verification system unavailable'
                };
            }

            const codesData = codesDoc.data();

            // Check if code exists
            if (!codesData.hasOwnProperty(code)) {
                return {
                    success: false,
                    error: 'Invalid access code'
                };
            }

            // Check if code is already used
            if (codesData[code] === true) {
                return {
                    success: false,
                    error: 'This code has already been used'
                };
            }

            // Mark code as used
            await updateDoc(codesRef, {
                [code]: true
            });

            // Update user document
            const userRef = doc(db, 'users', this.currentUser.uid);
            await updateDoc(userRef, {
                isApproved: true,
                accessCode: code,
                approvedAt: serverTimestamp()
            });

            this.userData.isApproved = true;

            console.log('Access code verified successfully');

            return {
                success: true
            };
        } catch (error) {
            console.error('Error verifying code:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get current user data
    getUserData() {
        return this.userData;
    }

    // Sign out
    async signOut() {
        try {
            await auth.signOut();
            this.currentUser = null;
            this.userData = null;
            return { success: true };
        } catch (error) {
            console.error('Sign-out error:', error);
            return { success: false, error: error.message };
        }
    }
}

export default new TelegramAuthService();