import './App.css';
import React, { Fragment, useState, useCallback, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import { RotatingLines } from "react-loader-spinner";

// Import Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";

// Firebase configuration
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

function Loader() {
    return (
        <RotatingLines
            strokeColor="green"
            strokeWidth="5"
            animationDuration="30"
            width="96"
            visible={true}
        />
    )
}

function App() {
    const [readyToShow, setReadyToShow] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [telegramData, setTelegramData] = useState(null);
    const [statusMessage, setStatusMessage] = useState("Initializing...");

    const { unityProvider, sendMessage, addEventListener, removeEventListener, loadingProgression, isLoaded } = useUnityContext({
        loaderUrl: "Assets/WEBGL.loader.js",
        dataUrl: "Assets/WEBGL.data.unityweb",
        frameworkUrl: "Assets/WEBGL.framework.js.unityweb",
        codeUrl: "Assets/WEBGL.wasm.unityweb",
    });

    // Get Telegram data directly from window.Telegram
    const getTelegramUserData = useCallback(() => {
        try {
            // Check if Telegram WebApp is available
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;

                // Expand the WebApp
                tg.expand();

                console.log("Telegram WebApp available:", tg);
                console.log("InitDataUnsafe:", tg.initDataUnsafe);

                if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                    const user = tg.initDataUnsafe.user;

                    const userData = {
                        id: user.id,
                        username: user.username || "",
                        first_name: user.first_name || "",
                        last_name: user.last_name || "",
                        photo_url: user.photo_url || ""
                    };

                    console.log("✅ Telegram user data retrieved:", userData);
                    return userData;
                }
            }

            console.log("⚠️ Telegram WebApp not available or no user data");
            return null;
        } catch (error) {
            console.error("Error getting Telegram data:", error);
            return null;
        }
    }, []);

    // Get user data from Firebase - called by Unity
    const getUserDataFromFirebase = useCallback(async () => {
        if (!telegramData) {
            console.error("❌ No Telegram data");
            sendMessage("RegistrationUITelegram", "OnGetUserDataFailed", "No Telegram data");
            return;
        }

        try {
            console.log("🔐 Getting user data from Firebase...");
            setStatusMessage("Loading user data...");

            // Sign in anonymously (required for Firebase)
            const userCredential = await signInAnonymously(auth);
            console.log("✅ Firebase auth successful");

            // Get user document by Telegram ID
            const telegramId = telegramData.id.toString();
            const userRef = doc(db, "users", telegramId);
            const userSnap = await getDoc(userRef);

            let userData = {
                userId: telegramId,
                telegramId: telegramId,
                telegramUsername: telegramData.username || "",
                telegramFirstName: telegramData.first_name || "",
                username: "",
                discriminator: "",
                isApproved: false
            };

            if (userSnap.exists()) {
                // User exists - load data
                const existingData = userSnap.data();
                userData.username = existingData.username || "";
                userData.discriminator = existingData.discriminator || "";
                userData.isApproved = existingData.isApproved || false;
                // Also load telegram data if it exists (might have been updated)
                userData.telegramUsername = existingData.telegramUsername || telegramData.username || "";
                userData.telegramFirstName = existingData.telegramFirstName || telegramData.first_name || "";
                console.log("✅ Existing user found:", userData);
            } else {
                // New user - create initial document
                console.log("ℹ️ New user - creating document");

                const initialUserData = {
                    authProvider: "telegram",
                    telegramUsername: telegramData.username || "",
                    telegramFirstName: telegramData.first_name || "",
                    telegramLastName: telegramData.last_name || "",
                    hasUsername: false,
                    isApproved: false,
                    createdAt: serverTimestamp()
                };

                await setDoc(userRef, initialUserData);
                console.log("✅ Initial user document created");
            }

            setCurrentUser({ uid: telegramId });

            // Send data back to Unity
            console.log("📤 Sending user data to Unity...");
            sendMessage("RegistrationUITelegram", "OnGetUserDataComplete", JSON.stringify(userData));

            setStatusMessage("Ready!");

        } catch (error) {
            console.error("❌ Error getting user data:", error);
            sendMessage("RegistrationUITelegram", "OnGetUserDataFailed", error.message);
            setStatusMessage(`Error: ${error.message}`);
        }
    }, [telegramData, sendMessage]);

    // Create username in Firebase
    const createUsernameInFirebase = useCallback(async (username) => {
        if (!currentUser || !telegramData) {
            console.error("❌ No authenticated user or telegram data");
            sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", "Not authenticated");
            return;
        }

        try {
            console.log("📝 Creating username:", username);

            if (!username || username.trim().length < 3 || username.trim().length > 16) {
                sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", "Username must be 3-16 characters");
                return;
            }

            const cleanUsername = username.trim();

            // Find next available discriminator
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", cleanUsername), orderBy("discriminator", "desc"), limit(1));
            const querySnapshot = await getDocs(q);

            let discriminator = "0001";
            if (!querySnapshot.empty) {
                const lastDoc = querySnapshot.docs[0];
                const lastDiscriminator = lastDoc.data().discriminator;
                const lastNumber = parseInt(lastDiscriminator);
                const nextNumber = lastNumber + 1;
                discriminator = nextNumber.toString().padStart(4, '0');
            }

            const fullUsername = `${cleanUsername}#${discriminator}`;
            const now = new Date();
            const registrationDate = now.toISOString().replace('T', ' ').substring(0, 19);

            // Use Telegram ID as document ID
            const telegramId = telegramData.id.toString();
            const userRef = doc(db, "users", telegramId);
            await setDoc(userRef, {
                username: cleanUsername,
                discriminator: discriminator,
                fullUsername: fullUsername,
                authProvider: "telegram",
                telegramUsername: telegramData.username || "",
                telegramFirstName: telegramData.first_name || "",
                isApproved: false,
                createdAt: serverTimestamp(),
                registrationDate: registrationDate
            }, { merge: true });  // Merge to keep existing fields

            // Create username lookup
            const usernameRef = doc(db, "usernames", fullUsername);
            await setDoc(usernameRef, { userId: telegramId });

            console.log("✅ Username created:", fullUsername);

            // Notify Unity
            sendMessage("TelegramAuthManager", "OnUsernameCreated", JSON.stringify({
                username: cleanUsername,
                discriminator: discriminator
            }));

        } catch (error) {
            console.error("❌ Error creating username:", error);
            sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", `Failed: ${error.message}`);
        }
    }, [currentUser, telegramData, sendMessage]);

    // Verify access code
    const verifyAccessCodeInFirebase = useCallback(async (code) => {
        if (!currentUser || !telegramData) {
            console.error("❌ No authenticated user or telegram data");
            sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Not authenticated");
            return;
        }

        try {
            console.log("🔑 Verifying code:", code);

            if (!code || code.trim().length === 0) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Code cannot be empty");
                return;
            }

            const cleanCode = code.trim();

            // Get codes document
            const codesRef = doc(db, "SpecificData", "Codes");
            const codesSnap = await getDoc(codesRef);

            if (!codesSnap.exists()) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Code system unavailable");
                return;
            }

            const codesData = codesSnap.data();

            if (!(cleanCode in codesData)) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Invalid code");
                return;
            }

            if (codesData[cleanCode]) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Code already used");
                return;
            }

            // Mark code as used
            await updateDoc(codesRef, { [cleanCode]: true });

            // Update user using Telegram ID
            const telegramId = telegramData.id.toString();
            const userRef = doc(db, "users", telegramId);
            await updateDoc(userRef, {
                isApproved: true,
                accessCode: cleanCode,
                approvedAt: serverTimestamp()
            });

            console.log("✅ Code verified");
            sendMessage("TelegramAuthManager", "OnCodeVerified", "");

        } catch (error) {
            console.error("❌ Error verifying code:", error);
            sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", `Failed: ${error.message}`);
        }
    }, [currentUser, telegramData, sendMessage]);

    // Expose functions to Unity
    useEffect(() => {
        window.getUserData = getUserDataFromFirebase;
        window.createUsername = createUsernameInFirebase;
        window.verifyAccessCode = verifyAccessCodeInFirebase;
        console.log("✅ Functions exposed to Unity");

        return () => {
            delete window.getUserData;
            delete window.createUsername;
            delete window.verifyAccessCode;
        };
    }, [getUserDataFromFirebase, createUsernameInFirebase, verifyAccessCodeInFirebase]);

    // Initialize on mount
    useEffect(() => {
        console.log("🚀 App initializing...");

        // Get Telegram data immediately
        const tgData = getTelegramUserData();

        if (tgData) {
            console.log("✅ Telegram data found:", tgData);
            setTelegramData(tgData);
            setStatusMessage("Telegram data received");
        } else {
            console.error("❌ No Telegram data available - app must run inside Telegram");
            setStatusMessage("Error: Must be opened in Telegram Mini App");
        }
    }, [getTelegramUserData]);

    // When Unity loads and we have data, send to Unity
    useEffect(() => {
        if (isLoaded && telegramData) {
            console.log("🎮 Unity loaded, sending Telegram data...");

            // Just send Telegram data to Unity - Unity will request user data when ready
            console.log("📤 Sending Telegram data to Unity...");
            sendMessage("RegistrationUITelegram", "ReceiveTelegramData", JSON.stringify(telegramData));

            setReadyToShow(true);
        }
    }, [isLoaded, telegramData, sendMessage]);

    // Haptic feedback handlers
    const handleHapticSoft = useCallback(() => {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        } catch (e) {}
    }, []);

    const handleHapticMedium = useCallback(() => {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            }
        } catch (e) {}
    }, []);

    useEffect(() => {
        addEventListener("HapticSoft", handleHapticSoft);
        addEventListener("HapticMedium", handleHapticMedium);

        return () => {
            removeEventListener("HapticSoft", handleHapticSoft);
            removeEventListener("HapticMedium", handleHapticMedium);
        };
    }, [addEventListener, removeEventListener, handleHapticSoft, handleHapticMedium]);

    const showGame = isLoaded && readyToShow;

    return (
        <Fragment>
            {!showGame && (
                <div style={{
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#1a1a1a",
                    color: "white"
                }}>
                    <Loader />
                    <p style={{ marginTop: "20px", fontSize: "18px", textAlign: "center", padding: "0 20px" }}>
                        {statusMessage}
                    </p>
                    <p style={{ marginTop: "10px", fontSize: "14px" }}>
                        Loading: {Math.round(loadingProgression * 100)}%
                    </p>
                </div>
            )}

            <div style={{ display: showGame ? "block" : "none" }}>
                <Unity
                    style={{
                        width: "100vw",
                        height: "100vh",
                        position: "absolute",
                        top: 0,
                        left: 0
                    }}
                    devicePixelRatio={window.devicePixelRatio}
                    unityProvider={unityProvider}
                />
            </div>
        </Fragment>
    );
}

export default App;