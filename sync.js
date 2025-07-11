
// sync.js

// Check if Cordova/SQLite is available

// ✅ Sync unsynced flashcards' media to Cloudinary, and store persistent URLs in Firestore
async function syncUnsyncedFlashcardsToCloudinary() {
  const unsyncedCards = flashcards.filter(c => !c.synced);

  for (const card of unsyncedCards) {
    try {
      const updates = {};

      if (card.questionImageFile) {
        updates.questionImagePath = await uploadToCloudinary(card.questionImageFile, "image");
        updates.questionImage = updates.questionImagePath;
      }
      if (card.questionAudioFile) {
        updates.questionAudioPath = await uploadToCloudinary(card.questionAudioFile, "video");
        updates.questionAudio = updates.questionAudioPath;
      }
      if (card.questionVideoFile) {
        updates.questionVideoPath = await uploadToCloudinary(card.questionVideoFile, "video");
        updates.questionVideo = updates.questionVideoPath;
      }
      if (card.answerImageFile) {
        updates.answerImagePath = await uploadToCloudinary(card.answerImageFile, "image");
        updates.answerImage = updates.answerImagePath;
      }
      if (card.answerAudioFile) {
        updates.answerAudioPath = await uploadToCloudinary(card.answerAudioFile, "video");
        updates.answerAudio = updates.answerAudioPath;
      }
      if (card.answerVideoFile) {
        updates.answerVideoPath = await uploadToCloudinary(card.answerVideoFile, "video");
        updates.answerVideo = updates.answerVideoPath;
      }

      // Merge Cloudinary URLs into the card
      Object.assign(card, updates);
      card.synced = true;

      // Update in local DB
      updateFlashcardInDB(card);

      // Save to Firestore
      const userEmail = localStorage.getItem("userEmail");
      if (userEmail && typeof firebase !== "undefined") {
        const snapshot = await firebase.firestore().collection("users").where("email", "==", userEmail).get();
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          const flashRef = firebase.firestore().collection("users").doc(userDoc.id).collection("flashcards");
          await flashRef.doc(card.question).set(card);
          console.log("✅ Synced flashcard to Firebase:", card.question);
        }
      }

    } catch (err) {
      console.error("❌ Failed to sync flashcard:", card.question, err);
    }
  }
}

// Trigger sync when back online
window.addEventListener("online", () => {
  syncUnsyncedFlashcardsToCloudinary();
});



// Get unsynced flashcards (localStorage or SQLite)
function getUnsyncedFlashcards(callback) {
    if (typeof cordova !== "undefined" && sqliteDB) {
        sqliteDB.transaction(function (tx) {
            tx.executeSql("SELECT * FROM flashcards WHERE synced = 0", [], function (tx, result) {
                const unsynced = [];
                for (let i = 0; i < result.rows.length; i++) {
                    unsynced.push(result.rows.item(i));
                }
                callback(unsynced);
            });
        }, (error) => {
            console.error("SQLite sync query error:", error.message);
            callback([]);
        });
    } else {
         const all = JSON.parse(localStorage.getItem("flashcards") || "[]");
         const unsynced = all.filter(card => !card.synced);
         callback(unsynced);
    }
}



// Sync from SQLite (Cordova)
async function syncSQLiteToFirebase(card) {
    try {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.error("No authenticated user. Cannot sync card.");
            return;
        }

        const userId = currentUser.uid;
        const userFlashcardsRef = firebase.firestore()
            .collection("users")
            .doc(userId)
            .collection("flashcards");

        const firebaseData = {
            question: card.question,
            answer: card.answer,
            category: card.category,
            reviews: card.reviews || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        await userFlashcardsRef.doc(card.question).set(firebaseData);
        markCardAsSynced(card.question);
        console.log(`✅ Synced flashcard "${card.question}" to Firebase.`);
    } catch (err) {
        console.error(`❌ Failed to sync card "${card.question}":`, err);
    }
}

// Mark a flashcard as synced
function markCardAsSynced(question) {
    if (isDevice) {
        sqliteDB.transaction(tx => {
            tx.executeSql("UPDATE flashcards SET synced = 1 WHERE question = ?", [question]);
        });
    } else {
        let flashcards = JSON.parse(localStorage.getItem("flashcards") || "[]");
        flashcards = flashcards.map(card =>
            card.question === question ? { ...card, synced: true } : card
        );
        localStorage.setItem("flashcards", JSON.stringify(flashcards));
    }
}


// Main sync trigger (every 10 seconds)
function triggerSync() {
    getUnsyncedFlashcards(async (cards) => {
        for (const card of cards) {
            await syncSQLiteToFirebase(card);
        }
    });
}

// Automatic sync trigger
setInterval(() => {
    if (navigator.onLine) {
        triggerSync();
    }
}, 15000);

