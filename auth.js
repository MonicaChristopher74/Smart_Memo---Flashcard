// auth.js
// Firebase Auth Listener
firebase.auth().onAuthStateChanged(async user => {
    if (user) {
        const uid = user.uid;
        const db = firebase.firestore();
        const userDoc = await db.collection("users").doc(uid).get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            const role = userData.role || "general";
            const streak = userData.streak || 0;
            const lastAccessDate = userData.lastAccessDate || null;

            localStorage.setItem("userRole", role);
            localStorage.setItem("userEmail", user.email);
            if (streak !== undefined) {
                localStorage.setItem("streak", streak);
            }
            if (lastAccessDate) {
                localStorage.setItem("lastAccessDate", lastAccessDate);
            }

            if (typeof loadFromFirebase === "function") {
                await loadFromFirebase(); // defined in app.js
            }
            console.log("User data loaded from Firestore:", userData);
            console.log("User role:", role);

            if (window.location.pathname.includes("login.html") || window.location.pathname.includes("register.html")) {
                window.location.href = "index.html";
            }
        } else {
            // If user doc doesn't exist, default to general
            await db.collection("users").doc(uid).set({
                email: user.email,
                role: "general"
            });
            localStorage.setItem("userRole", "general");
            if (window.location.pathname.includes("login.html") || window.location.pathname.includes("register.html")) {
                // Delay to give time for localStorage to update
                setTimeout(() => {
                    window.location.href = "index.html";
                }, 500); // 0.5 second delay before redirect
            }
        }
    } else {
        localStorage.clear();
        if (!window.location.pathname.includes("login.html") && !window.location.pathname.includes("register.html")) {
            window.location.href = "login.html";
        }
    }
});

document.getElementById("logout-button")?.addEventListener("click", () => {
    firebase.auth().signOut().then(() => {
        // ✅ Only remove user-specific keys, not flashcards or media
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userRole");
        localStorage.removeItem("streak");
        console.log("User signed out. Local user data removed.");
        window.location.href = "login.html";
    });
});

// Normalize email input
function normalizeEmail(rawEmail) {
    return rawEmail.trim().toLowerCase();
}

// Sign Up with Firestore Role Assignment
function signUp(email, password) {
    email = normalizeEmail(email);

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            console.log("Signed up as:", user.email, "| UID:", user.uid);

            // ✅ Add default role to Firestore
            return firebase.firestore().collection("users").doc(user.uid).set({
                email: user.email,
                role: "General",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            alert("Signup successful! User data saved in Firestore.");
        })
        .catch((error) => {
            console.error("Signup Error:", error.message);
            if (error.code === "auth/email-already-in-use") {
                alert("This email is already registered. Please log in.");
            } else {
                alert("Signup failed: " + error.message);
            }
        });
}

// Login
function login(email, password) {
    email = normalizeEmail(email);

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("Logged in as:", userCredential.user.email, "| UID:", userCredential.user.uid);
            alert("Login successful!");
            window.location.href = "index.html";
        })
        .catch((error) => {
            console.error("Login Error:", error.message);
            if (error.code === "auth/user-not-found") {
                alert("No account found with this email. Please register.");
            } else if (error.code === "auth/wrong-password") {
                alert("Incorrect password.");
            } else {
                alert("Login failed: " + error.message);
            }
        });
}

// Forgot Password (still works unless you're using email link sign-in, which you're not)
function resetPassword(email) {
    email = normalizeEmail(email);

    if (!email) {
        alert("Enter your email to reset password.");
        return;
    }

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            alert("Password reset email sent.");
        })
        .catch((error) => {
            console.error("Reset Error:", error.message);
            alert("Reset failed: " + error.message);
        });
}

// Logout
function logout() {
    firebase.auth().signOut()
        .then(() => {
            console.log("User signed out.");
            alert("Logged out!");
            window.location.href = "login.html";
        })
        .catch((error) => {
            console.error("Logout Error:", error.message);
        });
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    const signupBtn = document.getElementById("signup-button");
    const loginBtn = document.getElementById("login-button");
    const forgotBtn = document.getElementById("forgot-password-button");
    const logoutBtn = document.getElementById("logout-button");

    if (signupBtn) {
        signupBtn.addEventListener("click", () => {
            const email = document.getElementById("email-input").value;
            const password = document.getElementById("password-input").value;
            signUp(email, password);
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            const email = document.getElementById("email-input").value;
            const password = document.getElementById("password-input").value;
            login(email, password);
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener("click", () => {
            const email = document.getElementById("email-input").value;
            resetPassword(email);
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            logout();
        });
    }
});
