// --- DOM Elements ---
const introSection = document.getElementById('intro-section');
const introTitle = document.getElementById('introTitle');
const introMessage = document.getElementById('introMessage');

const todoAppSection = document.getElementById('todo-app-section');

const newTaskInput = document.getElementById('newTaskInput');
const addTaskButton = document.getElementById('addTaskButton');
const taskList = document.getElementById('taskList');

const reflectiveModal = document.getElementById('reflective-modal');
const reflectiveQuestionText = document.getElementById('reflectiveQuestionText');
const reflectiveAnswerInput = document.getElementById('reflectiveAnswerInput');
const nextReflectiveQuestionButton = document.getElementById('nextReflectiveQuestionButton');


// --- Global Variables ---
let currentMessageIndex = 0;
const comicIntroMessages = [
    "What imaginary thing will you not do today?",
    "Enter your next beautiful lie here...",
    "What's your next 'Monday motivation' fantasy?",
    "Type the thing you'll do 'when you have time'",
    "Another task to screenshot for Instagram stories?",
    "What will you add then immediately ignore?",
    "Congratulations, you've successfully navigated the preliminary illusion of productivity. Now for the actual illusions! 🎉✨🥳"
];

let tasks = [];
let currentTaskToAdd = null;

// Modified: reflectiveConversationHistory now only stores question and answer, no likelihood_score
let reflectiveConversationHistory = []; // Stores {question: "...", answer: "..."} pairs
const MAX_REFLECTIVE_QUESTIONS = 6;


// --- Functions for Flow Control and UI Management ---

function showSection(sectionToShow) {
    [introSection, todoAppSection, reflectiveModal].forEach(sec => {
        sec.classList.add('hidden');
        sec.style.display = 'none';
    });

    sectionToShow.classList.remove('hidden');
    if (sectionToShow === reflectiveModal) {
        sectionToShow.style.display = 'flex';
    } else {
        sectionToShow.style.display = '';
    }
}

function startAutomaticIntroMessageCycle() {
    console.log("startAutomaticIntroMessageCycle called.");
    showSection(introSection);
    introMessage.textContent = comicIntroMessages[currentMessageIndex];
    console.log("Displayed initial message:", comicIntroMessages[currentMessageIndex], "Index:", currentMessageIndex);
    currentMessageIndex++;

    const messageDisplayInterval = 2000;

    function displayNextMessageInSequence() {
        console.log("displayNextMessageInSequence called. Current index before check:", currentMessageIndex);
        if (currentMessageIndex < comicIntroMessages.length) {
            introMessage.textContent = comicIntroMessages[currentMessageIndex];
            console.log("Displayed message:", comicIntroMessages[currentMessageIndex], "Index:", currentMessageIndex);
            currentMessageIndex++;
            setTimeout(displayNextMessageInSequence, messageDisplayInterval);
        } else {
            console.log("All intro messages displayed. Initiating final transition.");
            introTitle.classList.add('hidden');
            
            setTimeout(() => {
                console.log("Final transition timeout triggered.");
                showSection(todoAppSection);
                renderTasks();
            }, 1500);
        }
    }
    setTimeout(displayNextMessageInSequence, messageDisplayInterval);
}


// --- To-Do List Core Functions ---

function renderTasks() {
    taskList.innerHTML = '';
    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} data-index="${index}" />
            <span style="${task.completed ? 'text-decoration: line-through;' : ''}">${task.text}</span>
            <button data-index="${index}" class="delete-task-button">Delete</button>
        `;
        taskList.appendChild(li);

        const checkbox = li.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', toggleTaskCompletion);

        const deleteButton = li.querySelector('.delete-task-button');
        deleteButton.addEventListener('click', deleteTask);
    });
}

function toggleTaskCompletion(event) {
    const index = event.target.dataset.index;
    tasks[index].completed = event.target.checked;
    renderTasks();
}

function deleteTask(event) {
    const index = event.target.dataset.index;
    tasks.splice(index, 1);
    renderTasks();
}

function addTaskToList(taskText) {
    if (taskText.trim() !== '') {
        tasks.push({ text: taskText.trim(), completed: false });
        renderTasks();
        newTaskInput.value = '';
    }
}


// --- Reflective Questioning Logic (LLM-Powered and Decision-Making) ---

async function startReflectiveQuestioning(taskText) {
    currentTaskToAdd = taskText;
    reflectiveConversationHistory = [];
    showSection(reflectiveModal);

    nextReflectiveQuestionButton.disabled = true;
    reflectiveAnswerInput.disabled = true;
    reflectiveQuestionText.textContent = "Thinking of the perfect question...";
    reflectiveAnswerInput.value = '';

    await fetchAndDisplayNextReflectiveQuestion();
}

async function fetchAndDisplayNextReflectiveQuestion() {
    // This check is now integrated within the backend's response logic
    // makeFinalTaskDecision is called only when data.question is null

    try {
        nextReflectiveQuestionButton.disabled = true;
        reflectiveAnswerInput.disabled = true;
        reflectiveQuestionText.textContent = "Fetching next question...";

        const response = await fetch('http://localhost:3000/generate-reflective-question', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: currentTaskToAdd,
                conversationHistory: reflectiveConversationHistory
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json(); // Data now contains {question: ..., likelihood_score: ...}

        // Removed: Updating likelihood_score in history here (as it's not stored in history for this version)

        if (data.question) {
            reflectiveQuestionText.textContent = data.question;
            reflectiveAnswerInput.value = '';
            reflectiveAnswerInput.disabled = false;
            nextReflectiveQuestionButton.disabled = false;
            reflectiveAnswerInput.focus();
        } else { // If 'data.question' is null, it means the backend sent the final score
            console.log("Backend indicated no more questions (final score received).");
            // Pass the final likelihood_score to makeFinalTaskDecision
            makeFinalTaskDecision(data.likelihood_score); // <--- Pass only the score
        }

    } catch (error) {
        console.error('Error fetching reflective question:', error);
        reflectiveQuestionText.textContent = "Could not generate a question. Please try again or check backend server logs.";
        nextReflectiveQuestionButton.disabled = false;
        reflectiveAnswerInput.disabled = false;
    }
}

// Modified: makeFinalTaskDecision now accepts averageScore directly
function makeFinalTaskDecision(finalLikelihoodScore) { // <--- Accepts only the final score
    showSection(todoAppSection);
    reflectiveModal.classList.add('hidden');
    reflectiveModal.style.display = 'none';

    // In this version, we use only the final score from the LLM for decision
    const averageScore = finalLikelihoodScore; // Simpler decision: use the final score as the average
    
    console.log("Final Likelihood Score from LLM:", averageScore); // Log for debugging


    const DEMOTIVATION_THRESHOLD = 4.0; // Your existing threshold

    if (averageScore <= DEMOTIVATION_THRESHOLD) {
        alert(`Based on your profound reflections (Final Score: ${averageScore.toFixed(1)}), the universe has decided "${currentTaskToAdd}" is NOT worth your precious time. Task not added. You're welcome.`);
    } else {
        addTaskToList(currentTaskToAdd);
        alert(`Despite your best efforts to question it (Final Score: ${averageScore.toFixed(1)}), "${currentTaskToAdd}" seems like it might actually happen. Task added. Good luck.`);
    }

    currentTaskToAdd = null;
    reflectiveConversationHistory = []; // Reset as always
}


// --- Event Listeners ---

// Listener for the "Add Task" button in the main app
addTaskButton.addEventListener('click', () => {
    const taskText = newTaskInput.value.trim();
    if (taskText) {
        startReflectiveQuestioning(taskText);
    } else {
        alert("Please enter a task!");
    }
});

// Listener for the "Next" button in the reflective modal
nextReflectiveQuestionButton.addEventListener('click', async () => {
    const currentQuestion = reflectiveQuestionText.textContent;
    const answer = reflectiveAnswerInput.value.trim();

    if (answer) {
        // In this version, we only push question and answer, no score placeholder
        reflectiveConversationHistory.push({
            question: currentQuestion,
            answer: answer
        });

        await fetchAndDisplayNextReflectiveQuestion();

    } else {
        alert("Please provide an answer to reflect!");
    }
});

// Listener for Enter key in the reflective answer input
reflectiveAnswerInput.addEventListener('keypress', async (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        nextReflectiveQuestionButton.click();
    }
});


// --- Initial Setup ---
startAutomaticIntroMessageCycle();