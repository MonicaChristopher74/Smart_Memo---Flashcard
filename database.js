// database.js


const isDevice = typeof window.sqlitePlugin !== 'undefined';
window.isDbReady = false; // Flag to check if the database is ready

if (isDevice) {
    document.addEventListener('deviceready', () => {
        //Device is ready, initializing SQLite database...

        window.db = window.sqlitePlugin.openDatabase(
            { name: 'flashcards.db', location: 'default' },
            () => {
                console.log("Database opened successfully");
                window.isDbReady = true; // Set the flag to true when the database is ready
                // Create tables if they don't exist
                db.transaction(tx => {
                     // Create flashcards table
                     tx.executeSql('CREATE TABLE IF NOT EXISTS flashcards (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT, answer TEXT, category TEXT, reviews INTEGER, synced INTEGER DEFAULT 0, questionImagePath TEXT, questionAudioPath TEXT, questionVideoPath TEXT, answerImagePath TEXT, answerAudioPath TEXT, answerVideoPath TEXT)');
                    
                     //Create categories table
                     tx.executeSql('CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY)');
                    
                     // Create streak table
                     tx.executeSql('CREATE TABLE IF NOT EXISTS streak (id INTEGER PRIMARY KEY, streak INTEGER, lastAccessDate TEXT)');
                     
                     // Initialize streak table if empty
                     tx.executeSql('INSERT OR IGNORE INTO streak (id, streak, lastAccessDate) VALUES (1, 0, NULL)');
                });
            },
            error => console.error("Database open ERROR:", error.message)
        );
    });
} else {
    //Running in browser mode – using localStorage.
    if (!localStorage.getItem('flashcards')) {
        localStorage.setItem('flashcards', JSON.stringify([]));
    }
    if (!localStorage.getItem('streak')) {
        localStorage.setItem('streak', 0);
        localStorage.setItem('lastAccessDate', null);
    }
    if (!localStorage.getItem('categories')) {
        const defalultCategories = ["General", "Math", "Math→Algebra", "Math→Geometry", "Science", "Science→Physics", "Science→Physics→Mechanics", "Science→Physics→Laws of Motion", "Computer Science", "Computer Science→Algorithms"];
        localStorage.setItem('categories', JSON.stringify(defalultCategories));
    }
}

function addFlashcardToDB(flashcard) {
    flashcard.synced = false; // Set synced to false for new flashcards
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("INSERT INTO flashcards (question, answer, category, reviews, synced, questionImagePath, questionAudioPath, questionVideoPath, answerImagePath, answerAudioPath, answerVideoPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",   
                [flashcard.question, flashcard.answer, flashcard.category,  flashcard.reviews, 0,flashcard.questionImagePath, flashcard.questionAudioPath, flashcard.questionVideoPath, flashcard.answerImagePath, flashcard.answerAudioPath, flashcard.answerVideoPath]);
            tx.executeSql("INSERT OR IGNORE INTO categories (name) VALUES (?)", [flashcard.category]);
                //Flashcard added successfully
        }, error => console.error("Insert error:", error));
    } else {
        const flashcards = JSON.parse(localStorage.getItem('flashcards') || '[]');
        flashcard.synced=false;
        flashcards.push(flashcard);
        localStorage.setItem('flashcards', JSON.stringify(flashcards));

        let categories = JSON.parse(localStorage.getItem('categories') || '[]');
        if (!categories.includes(flashcard.category)) {
            categories.push(flashcard.category);
            localStorage.setItem('categories', JSON.stringify(categories));
        }
    }
}

function getFlashcardsFromDB(callback) {
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("SELECT * FROM flashcards", [], (tx, results) => {
                if (results.rows.length > 0) {
                    const row = results.rows.item(0);
                    console.log("Retrieved streak from SQLite:", row.streak, row.lastAccessDate);
                    callback(row.streak, row.lastAccessDate);
                } else {
                    console.log("No streak data found in SQLite.");
                    callback(0, null);
                }
            }, error => console.error("Error retrieving streak from SQLite:", error));
        });
    } else {
        const streak = parseInt(localStorage.getItem('streak') || '0', 10);
        const lastAccessDate = localStorage.getItem('lastAccessDate');
        console.log("Retrieved streak from localStorage:", streak, lastAccessDate);
        callback(streak, lastAccessDate);
    }
}

function getCategoriesFromDB(callback) {
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("SELECT name FROM categories", [], (tx, results) => {
                const categories = [];
                for (let i = 0; i < results.rows.length; i++) {
                    categories.push(results.rows.item(i).name);
                }
                callback(categories);
            });
        });
    } else {
        const categories = JSON.parse(localStorage.getItem('categories') || '[]');
        callback(categories);
    }
}


function updateFlashcardInDB(question,firebaseData) {
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("UPDATE flashcards SET reviews = ?, synced = 1, questionImagePath = ?, questionAudioPath = ?, questionVideoPath = ?, answerImagePath = ?, answerAudioPath = ?, answerVideoPath = ? WHERE question = ?", [
                firebaseData.reviews || 0,
                firebaseData.questionImage || null,
                firebaseData.questionAudio || null,
                firebaseData.questionVideo || null,
                firebaseData.answerImage || null,
                firebaseData.answerAudio || null,
                firebaseData.answerVideo || null,
                question
            ]);
        });
    } else {
        let flashcards = JSON.parse(localStorage.getItem('flashcards') || '[]');
        flashcards = flashcards.map(card => {
            if(card.question === question){
                 card.synced = false;
                 Object.assign(card, firebaseData); 
            }
            return card;
        });
        localStorage.setItem('flashcards', JSON.stringify(flashcards));
    }
    }


function updateStreakInDB(streak, lastAccessDate) {
    console.log("Updating streak in database:", streak, lastAccessDate); // Debugging log
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("UPDATE streak SET streak = ?, lastAccessDate = ? WHERE id = 1",
                [streak, lastAccessDate],
                () => console.log("Streak updated in SQLite"),
                error => console.error("Error updating streak in SQLite:", error)
            );
        });
    } else {
        localStorage.setItem('streak', streak);
        localStorage.setItem('lastAccessDate', lastAccessDate);
    }
    // ✅ Sync streak to Firestore for logged-in users
    const currentUser = firebase.auth().currentUser;
    if (currentUser && typeof firebase !== 'undefined') {
       const userDocRef = firebase.firestore().collection("users").doc(currentUser.uid);
       userDocRef.update({
          streak,
          lastAccessDate
        }).then(() => console.log("✅ Streak synced to Firestore"))
       .catch(err => console.error("❌ Failed to update streak in Firestore:", err));
   }


    actionPerformedToday = true; // Mark that an action has been performed today

}

function getStreakFromDB(callback) {
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("SELECT * FROM streak WHERE id = 1", [], (tx, results) => {
                if (results.rows.length > 0) {
                    const row = results.rows.item(0);
                    console.log("Retrieved streak from SQLite:", row.streak, row.lastAccessDate); // Debugging log
                    callback(row.streak, row.lastAccessDate);
                } else {
                    console.log("No streak data found in SQLite."); // Debugging log
                    callback(0, null);
                }
            }, error => console.error("Error retrieving streak from SQLite:", error));
        });
    } else {
        const streak = parseInt(localStorage.getItem('streak') || '0', 10);
        const rawDate = localStorage.getItem('lastAccessDate');
        const lastAccessDate = rawDate && rawDate !== 'null' ? rawDate : null;
        callback(streak, lastAccessDate);
    }
}

function deleteFlashcardFromDB(question) {
    if (isDevice) {
        db.transaction(tx => {
            tx.executeSql("DELETE FROM flashcards WHERE question = ?", [question]);
            //Flashcard deleted successfully
            error => console.error("Delete error:", error);
        });
    } else {
        let flashcards = JSON.parse(localStorage.getItem('flashcards') || '[]');
        flashcards = flashcards.filter(card => card.question !== question);
        localStorage.setItem('flashcards', JSON.stringify(flashcards));
    }
    // 🔄 ALSO delete from Firestore
    const userEmail = localStorage.getItem("userEmail");
    if (userEmail && typeof firebase !== "undefined") {
        firebase.firestore().collection("users").where("email", "==", userEmail).get()
            .then(snapshot => {
                if (!snapshot.empty) {
                    const userId = snapshot.docs[0].id;
                    const userDocRef = firebase.firestore().collection("users").doc(userId);
                    return userDocRef.collection("flashcards").doc(question).delete();
                } else {
                    console.warn("User not found for Firestore delete.");
                }
            })
            .then(() => console.log("🗑️ Deleted flashcard from Firestore:", question))
            .catch(err => console.error("Failed to delete from Firestore:", err));
    }
}
window.addFlashcardToDB = addFlashcardToDB;
window.getFlashcardsFromDB = getFlashcardsFromDB;
window.getCategoriesFromDB = getCategoriesFromDB;
window.updateStreakInDB = updateStreakInDB;
window.getStreakFromDB = getStreakFromDB;
window.updateFlashcardInDB = updateFlashcardInDB;
window.deleteFlashcardFromDB = deleteFlashcardFromDB;
