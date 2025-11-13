/*// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);*/
import './App.css';
import React, { Fragment, useState, useCallback, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import { useHapticFeedback } from '@vkruglikov/react-telegram-web-app';
import { viewport, init, isTMA, initData } from "@telegram-apps/sdk";
import { RotatingLines } from "react-loader-spinner";

// Import Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";

// Firebase configuration - REPLACE WITH YOUR CONFIG
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

async function initTg() {
    if (await isTMA()) {
        init(); // init tg app
    }
}

(async () => {
    await initTg();
})();

function App() {
    const [telegramDataSent, setTelegramDataSent] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [telegramData, setTelegramData] = useState(null);

    const { unityProvider, sendMessage, addEventListener, removeEventListener, loadingProgression, isLoaded } = useUnityContext({
        loaderUrl: "Assets/WEBGL.loader.js",
        dataUrl: "Assets/WEBGL.data.unityweb",
        frameworkUrl: "Assets/WEBGL.framework.js.unityweb",
        codeUrl: "Assets/WEBGL.wasm.unityweb",
    });

    const [impactOccurred, notificationOccurred, selectionChanged] = useHapticFeedback();

    function hapticSoft() {
        notificationOccurred('success');
    }

    function hapticMedium() {
        notificationOccurred('error');
    }

    const handleHapticSoft = useCallback(() => {
        hapticSoft();
    }, []);

    const handleHapticMedium = useCallback(() => {
        hapticMedium();
    }, []);

    // Authenticate with Firebase and check user existence
    const authenticateWithFirebase = useCallback(async (telegramUserData) => {
        try {
            console.log("Authenticating with Firebase...");

            // Sign in anonymously
            const userCredential = await signInAnonymously(auth);
            const user = userCredential.user;

            console.log("Firebase authentication successful:", user.uid);

            // Store telegram data in Firestore user document
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            let userData = {
                userId: user.uid,
                username: "",
                discriminator: "",
                isApproved: false
            };

            if (userSnap.exists()) {
                // User exists, get their data
                const existingData = userSnap.data();
                userData.username = existingData.username || "";
                userData.discriminator = existingData.discriminator || "";
                userData.isApproved = existingData.isApproved || false;

                console.log("Existing user found:", userData);
            } else {
                // New user - just mark them as authenticated, username will be created later
                console.log("New user - needs to create username");
            }

            // Send authenticated user data to Unity
            sendMessage("RegistrationUITelegram", "OnAuthenticationComplete", JSON.stringify(userData));

            // Determine what panel to show
            if (userData.username && userData.username !== "") {
                if (userData.isApproved) {
                    // Existing approved user - go to main menu
                    sendMessage("RegistrationUITelegram", "LoadMainMenuFromReact", "");
                } else {
                    // Has username but not approved - show code panel
                    sendMessage("RegistrationUITelegram", "ShowCodePanel", "");
                }
            } else {
                // New user - show username panel
                sendMessage("RegistrationUITelegram", "ShowUsernamePanel", "");
            }

            setCurrentUser(user);
        } catch (error) {
            console.error("Firebase authentication error:", error);
        }
    }, [sendMessage]);

    // Create username in Firebase
    const createUsernameInFirebase = useCallback(async (username) => {
        if (!currentUser || !telegramData) {
            console.error("No authenticated user or telegram data");
            sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", "Not authenticated");
            return;
        }

        try {
            // Validate username
            if (!username || username.trim().length < 3 || username.trim().length > 16) {
                sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", "Username must be 3-16 characters");
                return;
            }

            const cleanUsername = username.trim();

            // Query existing usernames to find the next available discriminator
            const usersRef = collection(db, "users");
            const q = query(
                usersRef,
                where("username", "==", cleanUsername),
                orderBy("discriminator", "desc"),
                limit(1)
            );

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

            // Create user document
            const userRef = doc(db, "users", currentUser.uid);
            const userData = {
                username: cleanUsername,
                discriminator: discriminator,
                fullUsername: fullUsername,
                authProvider: "telegram",
                telegramId: telegramData.id.toString(),
                telegramUsername: telegramData.username || "",
                telegramFirstName: telegramData.first_name || "",
                isApproved: false,
                createdAt: serverTimestamp(),
                registrationDate: registrationDate
            };

            await setDoc(userRef, userData);

            // Create username lookup document
            const usernameRef = doc(db, "usernames", fullUsername);
            await setDoc(usernameRef, {
                userId: currentUser.uid
            });

            console.log("Username created successfully:", fullUsername);

            // Send username data to Unity
            const usernameData = {
                username: cleanUsername,
                discriminator: discriminator
            };
            sendMessage("RegistrationUITelegram", "OnUsernameCreated", JSON.stringify(usernameData));

        } catch (error) {
            console.error("Error creating username:", error);
            sendMessage("RegistrationUITelegram", "OnUsernameCreationFailedFromReact", `Failed to create username: ${error.message}`);
        }
    }, [currentUser, telegramData, sendMessage]);

    // Verify access code in Firebase
    const verifyAccessCodeInFirebase = useCallback(async (code) => {
        if (!currentUser) {
            console.error("No authenticated user");
            sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Not authenticated");
            return;
        }

        try {
            if (!code || code.trim().length === 0) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Code cannot be empty");
                return;
            }

            const cleanCode = code.trim();

            // Get the Codes document from SpecificData collection
            const codesRef = doc(db, "SpecificData", "Codes");
            const codesSnap = await getDoc(codesRef);

            if (!codesSnap.exists()) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Code verification system unavailable");
                console.error("SpecificData/Codes document does not exist");
                return;
            }

            const codesData = codesSnap.data();

            // Check if the entered code exists
            if (!(cleanCode in codesData)) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "Invalid access code");
                return;
            }

            // Check if the code has been used
            const isUsed = codesData[cleanCode];
            if (isUsed) {
                sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", "This code has already been used");
                return;
            }

            // Code is valid and unused - Mark it as used
            await updateDoc(codesRef, {
                [cleanCode]: true
            });

            // Update user document with approval
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                isApproved: true,
                accessCode: cleanCode,
                approvedAt: serverTimestamp()
            });

            console.log("Access code verified successfully");

            // Notify Unity
            sendMessage("RegistrationUITelegram", "OnCodeVerified", "");

        } catch (error) {
            console.error("Error verifying access code:", error);
            sendMessage("RegistrationUITelegram", "OnCodeVerificationFailedFromReact", `Verification failed: ${error.message}`);
        }
    }, [currentUser, sendMessage]);

    // Expose functions to Unity
    useEffect(() => {
        // Make functions globally available for Unity to call
        window.createUsername = createUsernameInFirebase;
        window.verifyAccessCode = verifyAccessCodeInFirebase;

        return () => {
            delete window.createUsername;
            delete window.verifyAccessCode;
        };
    }, [createUsernameInFirebase, verifyAccessCodeInFirebase]);

    // Send Telegram data to Unity when game is loaded
    useEffect(() => {
        async function sendTelegramDataToUnity() {
            if (isLoaded && !telegramDataSent) {
                const isInTelegram = await isTMA();

                if (isInTelegram) {
                    try {
                        const initDataObj = initData();

                        if (initDataObj && initDataObj.user) {
                            const telegramUser = initDataObj.user;

                            const telegramUserData = {
                                id: telegramUser.id,
                                username: telegramUser.username || "",
                                first_name: telegramUser.firstName || "",
                                last_name: telegramUser.lastName || "",
                                photo_url: telegramUser.photoUrl || ""
                            };

                            console.log("Sending Telegram data to Unity:", telegramUserData);

                            // Send telegram data to Unity first
                            sendMessage("RegistrationUITelegram", "ReceiveTelegramData", JSON.stringify(telegramUserData));

                            // Store telegram data for later use
                            setTelegramData(telegramUserData);

                            // Authenticate with Firebase
                            await authenticateWithFirebase(telegramUserData);

                            setTelegramDataSent(true);
                        } else {
                            console.log("No Telegram user data available");
                        }
                    } catch (error) {
                        console.error("Error getting Telegram data:", error);
                    }
                } else {
                    console.log("Not running in Telegram environment");
                }
            }
        }

        sendTelegramDataToUnity();
    }, [isLoaded, telegramDataSent, sendMessage, authenticateWithFirebase]);

    useEffect(() => {
        addEventListener("HapticSoft", handleHapticSoft);
        addEventListener("HapticMedium", handleHapticMedium);

        return () => {
            removeEventListener("HapticSoft", handleHapticSoft);
            removeEventListener("HapticMedium", handleHapticMedium);
        };
    }, [addEventListener, removeEventListener, handleHapticSoft, handleHapticMedium]);

    return (
        <Fragment>
            <div className="center">
                <Loader />
                {!isLoaded && (
                    <div className="loading-overlay">
                        <div className="loading-spinner"></div>
                        <p>Loading: {Math.round(loadingProgression * 100)}%</p>
                    </div>
                )}
            </div>

            <Unity
                style={{
                    width: "100vw",
                    height: "100vh",
                    position: "absolute",
                    top: 0,
                    left: 0,
                }}
                devicePixelRatio={window.devicePixelRatio}
                unityProvider={unityProvider}
            />
        </Fragment>
    );
}

export default App;