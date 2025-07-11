const userRole = localStorage.getItem("userRole") || "general";
document.addEventListener('deviceready', async () => {
    await loadFromDatabase();
    updateStreak();
    updateStreakCounter();
});

// Fallback if not Cordova (i.e., running in browser)
if (typeof cordova === 'undefined') {
   document.addEventListener('DOMContentLoaded', () => {
        // Delay ensures streak from Firestore is set in localStorage first
        setTimeout(() => {
            initializeApp(); // Now runs after auth.js updates localStorage
        }, 500); // 0.5 second delay
    });
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('add-card')?.addEventListener('click', addFlashcard);
    document.getElementById('search-bar')?.addEventListener('input', filterFlashcards);
});

let flashcards = [];
let streak = 0;
let lastAccessDate = null;
let actionPerformedToday = false;
const categorySuggestions = new Set(["General", "Math", "Math→Algebra", "Math→Geometry", "Science", "Science→Physics", "Science→Physics→Mechanics", "Science→Physics→Laws of Motion", "Computer Science", "Computer Science→Algorithms"]);

async function initializeApp() {
    await loadFromDatabase();
    checkAndUpdateStreak(); // Check streak on app start
    updateStreakCounter();
}

async function loadFromDatabase() {
    return new Promise((resolve) => {
    getFlashcardsFromDB((storedFlashcards) => {
      if (storedFlashcards && storedFlashcards.length > 0) {
        // Rebuild preview URLs
        for (const card of storedFlashcards) {
          if (!card.questionImagePath && card.questionImageFile) {
            card.questionImagePath = URL.createObjectURL(card.questionImageFile);
          }
          if (!card.questionAudioPath && card.questionAudioFile) {
            card.questionAudioPath = URL.createObjectURL(card.questionAudioFile);
          }
          if (!card.questionVideoPath && card.questionVideoFile) {
            card.questionVideoPath = URL.createObjectURL(card.questionVideoFile);
          }
          if (!card.answerImagePath && card.answerImageFile) {
            card.answerImagePath = URL.createObjectURL(card.answerImageFile);
          }
          if (!card.answerAudioPath && card.answerAudioFile) {
            card.answerAudioPath = URL.createObjectURL(card.answerAudioFile);
          }
          if (!card.answerVideoPath && card.answerVideoFile) {
            card.answerVideoPath = URL.createObjectURL(card.answerVideoFile);
          }
        }

        flashcards = storedFlashcards;
        displayFlashcards();
      } else {
        loadFromFirebase();
      }
    });

        getStreakFromDB((savedStreak, savedLastAccessDate) => {
           console.log("Checking streak from localStorage again:", localStorage.getItem("streak"), localStorage.getItem("lastAccessDate"));
           streak = savedStreak || 0;
           lastAccessDate = savedLastAccessDate ? new Date(savedLastAccessDate) : null;
           updateStreakCounter();
           resolve();
        });
    });
}

async function loadFromFirebase() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    const userId = user.uid;
    const subcollectionRef = db.collection("users").doc(userId).collection("flashcards");
    const snapshot = await subcollectionRef.get();

    flashcards = snapshot.docs.map(doc =>{
        const data = doc.data();
        return {
            ...data,
            synced: true,
            questionImagePath: data.questionImage || null,
            questionAudioPath: data.questionAudio || null,
            questionVideoPath: data.questionVideo || null,
            answerImagePath: data.answerImage || null,
            answerAudioPath: data.answerAudio || null,
            answerVideoPath: data.answerVideo || null
        };
    });
    flashcards.forEach(card => addFlashcardToDB(card));
    displayFlashcards();
}

function updateCategorySuggestions(newCategory) {
    if (!categorySuggestions.has(newCategory)) {
        categorySuggestions.add(newCategory);
        const datalist = document.getElementById("category-suggestions");
        const option = document.createElement("option");
        option.value = newCategory;
        datalist.appendChild(option);
    }
}

async function addFlashcard() {
    const question = document.getElementById('question-input').value.trim();
    const answer = document.getElementById('answer-input').value.trim();
    const category = document.getElementById('category-input').value.trim() || "General";
    const qImg = document.getElementById("question-image").files[0];
    const qAudio = document.getElementById("question-audio").files[0];
    const qVideo = document.getElementById("question-video").files[0];
    const aImg = document.getElementById("answer-image").files[0];
    const aAudio = document.getElementById("answer-audio").files[0];
    const aVideo = document.getElementById("answer-video").files[0];

    const user = firebase.auth().currentUser;
    if (!user) {
        console.warn("No authenticated user found. Flashcard will not sync.");
        return;
    }
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
//  Updated addFlashcard to store media locally and sync later when online
    const questionImagePreview = qImg ? URL.createObjectURL(qImg) : null;
    const questionAudioPreview = qAudio ? URL.createObjectURL(qAudio) : null;
    const questionVideoPreview = qVideo ? URL.createObjectURL(qVideo) : null;
    const answerImagePreview = aImg ? URL.createObjectURL(aImg) : null;
    const answerAudioPreview = aAudio ? URL.createObjectURL(aAudio) : null;
    const answerVideoPreview = aVideo ? URL.createObjectURL(aVideo) : null;

   
    const newFlashcard = {
        id,
        question,
        answer,
        category,
        reviews: 0,
        synced: false, // key for background sync
         // In-memory only
         questionImageFile: qImg || null,
         questionAudioFile: qAudio || null,
         questionVideoFile: qVideo || null,
         answerImageFile: aImg || null,
         answerAudioFile: aAudio || null,
         answerVideoFile: aVideo || null,
 
        // Local previews (for offline display)
        questionImagePath: questionImagePreview,
        questionAudioPath: questionAudioPreview,
        questionVideoPath: questionVideoPreview,
        answerImagePath: answerImagePreview,
        answerAudioPath: answerAudioPreview,
        answerVideoPath: answerVideoPreview,

        // Store file objects for sync
       questionImageFile: qImg || null,
       questionAudioFile: qAudio || null,
       questionVideoFile: qVideo || null,
       answerImageFile: aImg || null,
       answerAudioFile: aAudio || null,
       answerVideoFile: aVideo || null

    };

    // Check if question and answer are not empty
    if (!question || !answer) {
        alert("Please enter both question and answer.");
        return;
    }
  
    flashcards.push(newFlashcard);
    addFlashcardToDB(newFlashcard);
    updateCategorySuggestions(category);
    displayFlashcards();
    clearInputs();
    console.log("addFlashcard() CALLED");
    trackDailyAccess(); // Track access when a card is created

    if (navigator.onLine) {
        if (typeof syncSQLiteToFirebase === 'function') {
            await syncSQLiteToFirebase(newFlashcard);
        } else {
            console.warn("syncSQLiteToFirebase is not defined");
        }
    }
}
    
   // Cloudinary upload function
async function uploadToCloudinary(file, type = "auto") {
  const CLOUD_NAME = "dfk8b8bar"; // 🔁 Replace this
  const UPLOAD_PRESET = "smartmemo-media"; // Your unsigned preset

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload to Cloudinary failed");

  const data = await response.json();
  return data.secure_url;
}


function checkAndUpdateStreak() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight for accurate day comparison

    if (lastAccessDate) {
        const lastAccess = new Date(lastAccessDate);
        lastAccess.setHours(0, 0, 0, 0); // Normalize to midnight for accurate day comparison

        const diffTime = today - lastAccess;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays > 1) {
            streak = 0; // Reset streak if no access for more than one day
        }
    }

    actionPerformedToday = false; // Reset daily action tracker
}
function displayFlashcards(filteredCards = flashcards) {
    const flashcardsContainer = document.querySelector('.flashcards-container');
    flashcardsContainer.innerHTML = '';
    
    filteredCards.forEach(card => {
        const flashcardElement = document.createElement('div');
        flashcardElement.classList.add('flashcard');

        let renderMedia = (url, type) => {
            if(!url) return '';
        if (type == 'image') return `<img src="${url}" style="max-width: 100%;">`;
        if (type == 'audio') return `<audio controls src="${url}"></audio>`;  
        if (type == 'video') return `<video controls src="${url}" style="max-width: 100%;"></video>`;
        };

        flashcardElement.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <h3>${card.question}</h3>
                     ${renderMedia(card.questionImagePath || card.questionImage, 'image')}
                     ${renderMedia(card.questionAudioPath || card.questionAudio, 'audio')}
                     ${renderMedia(card.questionVideoPath|| card.questionVideo, 'video')}
                    <small>Category: ${card.category}</small>
                </div>
                <div class="card-back">
                    <p>${card.answer}</p>
                    ${renderMedia(card.answerImagePath|| card.answerImage, 'image')}
                    ${renderMedia(card.answerAudioPath|| card.answerAudio, 'audio')}
                    ${renderMedia(card.answerVideoPath|| card.answerVideo, 'video')}
                    ${userRole!='general'?'<button class="edit-card">Edit</button>':''}
                    <button class="delete-card">Delete</button>
                </div>
            </div>
            <div class="review-badge">${card.reviews} reviews</div>
        `;

        flashcardElement.querySelector('.card-inner').addEventListener('click', () => {
            card.reviews++;
            updateFlashcardInDB(card.question, { reviews: card.reviews });
            displayFlashcards();
        });

        if(userRole !== 'general'){
          flashcardElement.querySelector('.edit-card').addEventListener('click', () => {
            document.getElementById('question-input').value = card.question;
            document.getElementById('answer-input').value = card.answer;
            document.getElementById('category-input').value = card.category;

            if (card.questionImagePath) {
               const img = document.createElement("img");
               img.src = card.questionImagePath;
               img.className = "flashcard-img";
               flashcardElement.appendChild(img);
            }

            if (card.questionAudioPath) {
                const audio = document.createElement("audio");
                audio.src = card.questionAudioPath;
                audio.controls = true;
                flashcardElement.appendChild(audio);
            }

            if (card.questionVideoPath) {
                const video = document.createElement("video");
                video.src = card.questionVideoPath;
                video.controls = true;
                video.className = "flashcard-media";
                flashcardElement.appendChild(video);
            }

            if (card.answerImagePath) {
               const img = document.createElement("img");
               img.src = card.answerImagePath;
               img.className = "flashcard-img";
               flashcardElement.appendChild(img);
            }

           if (card.answerAudioPath) {
              const audio = document.createElement("audio");
              audio.src = card.answerAudioPath;
              audio.controls = true;
              flashcardElement.appendChild(audio);
            }
            if (card.answerVideoPath) {
                const video = document.createElement("video");
                video.src = card.answerVideoPath;
                video.controls = true;
                video.className = "flashcard-media";
                flashcardElement.appendChild(video);
            }

            const index = flashcards.indexOf(card);
            flashcards.splice(index, 1);
            deleteFlashcardFromDB(card.question);
            displayFlashcards();
        });
    }

        flashcardElement.querySelector('.delete-card').addEventListener('click', () => {
            const index = flashcards.indexOf(card);
            flashcards.splice(index, 1);
            deleteFlashcardFromDB(card.question);
            displayFlashcards();
            updateStreak();
        });

        flashcardsContainer.appendChild(flashcardElement);
    });
}

function filterFlashcards() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const filteredCards = flashcards.filter(card =>
        card.question.toLowerCase().includes(query) ||
        card.answer.toLowerCase().includes(query) ||
        card.category.toLowerCase().includes(query)
    );
    displayFlashcards(filteredCards);
}

function clearInputs() {
    document.getElementById('question-input').value = '';
    document.getElementById('answer-input').value = '';
    document.getElementById('category-input').value = 'General';
    document.getElementById("question-image").value = '';
    document.getElementById("question-audio").value = '';
    document.getElementById("question-video").value = '';
    document.getElementById("answer-image").value = '';
    document.getElementById("answer-audio").value = '';
    document.getElementById("answer-video").value = '';
}

function startVoiceInput(type) {
    if (userRole === 'general') {
        alert("Voice input is not available for general users.");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function (event) {
        const result = event.results[0][0].transcript;
        if (type === 'question') {
            document.getElementById('question-input').value = result;
        } else {
            document.getElementById('answer-input').value = result;
        }
    };

    recognition.onerror = function (event) {
        alert("Voice recognition failed: " + event.error);
    };
}

function trackDailyAccess() {console.log("📌 trackDailyAccess() CALLED");

    const today = new Date();
    
    today.setHours(0, 0, 0, 0); // Normalize to midnight for accurate day comparison
    if (!actionPerformedToday) {
        if (lastAccessDate) {
            const lastAccess = new Date(lastAccessDate);
            lastAccess.setHours(0, 0, 0, 0); // Normalize to midnight for accurate day comparison

            const diffTime = today - lastAccess;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                streak++; // Increment streak if accessed on the next day
            } else if (diffDays > 1) {
                streak = 1; // Reset streak if more than one day has passed
            }
        } else {
            streak = 1; // First-time access
        }

        lastAccessDate = today;
        actionPerformedToday = true; // Mark that an action has been performed today
        updateStreakInDB(streak, lastAccessDate.toISOString());
        updateStreakCounter();
    }
    
}

function updateStreakCounter() {
    console.log("Updating streak counter display:", streak); // Debugging log
   const streakElement = document.getElementById("streak-count");
if (streakElement) {
    streakElement.innerText = `Streak: ${streak}`;
}

}

async function saveStreakToDatabase() {
    updateStreakInDB(streak, lastAccessDate.toISOString());
}
