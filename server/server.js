require('dotenv').config(); // Loads environment variables from .env file
const express = require('express'); // Express.js framework
const cors = require('cors'); // CORS middleware
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Google Gemini Node.js client

const app = express();
const port = process.env.PORT || 3000;

// --- Google Gemini API Setup ---
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
    console.error("GEMINI_API_KEY not found in .env file. Please create a .env file and add your API key.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
// Using gemini-1.5-flash to avoid 404 Not Found error with gemini-pro
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// --- Middleware ---
app.use(cors());
app.use(express.json());


// --- API Endpoint: /generate-reflective-question (for Task Reflection) ---
app.post('/generate-reflective-question', async (req, res) => {
    const { task, conversationHistory } = req.body;

    if (!task) {
        return res.status(400).json({ error: 'Task is required.' });
    }

    try {
        // Prepare context from the last user answer for LLM evaluation
        let lastUserAnswer = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].answer : 'N/A';
        let lastQuestionAsked = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].question : 'N/A';

        let promptContent = ''; // Variable to hold the main prompt string for generateContent

        // --- Handle Final Question/Evaluation (6th turn) ---
        if (conversationHistory.length >= 5) { // If 5 questions have been asked (this is the 6th interaction)
            // This prompt is for the FINAL assessment of the user's likelihood
            // Removed request for 'cancellation_reason' here
            promptContent = `You are performing a final assessment of the user's likelihood of doing a task based on their most recent answer. Your persona remains supremely sarcastic, darkly humorous, and utterly demotivating.

            Task being considered: "${task}"
            Full Conversation History:
            ${conversationHistory.map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n')}

            Based on this history and especially the last answer:
            User's Last Question: "${lastQuestionAsked}"
            User's Last Answer: "${lastUserAnswer}"

            Assess the user's likelihood of actually doing the task. Provide a single numerical score from 1 to 10, where:
            - **1 means:** User is extremely demotivated, highly unlikely to do the task, seems completely against it.
            - **5 means:** User is neutral, uncertain, or gives a mixed response.
            - **10 means:** User is highly motivated, clearly intends to do the task, despite your best demotivating efforts.
            
            IMPORTANT FORMATTING RULES:
            - Output MUST be valid JSON.
            - The JSON should contain one key: "likelihood_score" (integer 1-10).
            - Example: {"likelihood_score": 3}
            - Do NOT include any other text outside the JSON.`;

        } else { // Handle normal question generation (turns 1 through 5)
            // System message defines the LLM's persona and general instructions
            promptContent = `You are a supremely sarcastic, darkly humorous, and utterly demotivating anti-productivity assistant, acting like that cynical friend who sees right through every noble intention. Your goal is to make the user regret even thinking about adding this task, infusing every question with relatable, dry humor and a resigned sense of futility. Use clear, direct, and concise language. Avoid overly poetic, abstract, or verbose phrasing. The humor should be understandable, relatable in its misery, and biting, not obscure. The demotivation should come from questioning the task's practical value and highlighting common, relatable pitfalls.
            
            Output MUST be valid JSON with two keys: "question" (string) and "likelihood_score" (integer 1-10). Do NOT include any other text outside the JSON.
            
            ${conversationHistory.length > 0 ? `If the user's LAST answer was: "${lastUserAnswer}" (to question: "${lastQuestionAsked}"), and it seemed positive, confident, or overly optimistic about the task, your NEXT question should specifically, and sarcastically, challenge that enthusiasm. Introduce a clear, but absurdly pessimistic counter-point, highlight an inevitable, soul-crushing drawback they're conveniently forgetting, or subtly mock their misplaced confidence. Make them genuinely think twice about their supposed commitment, with a knowing sigh.` : ''}
            
            Consider these angles to drain motivation with understandable sarcasm:
            - Exaggerated Pointlessness: "Will anyone *actually* notice if this task quietly slips into the abyss of unfulfilled intentions?"
            - Inevitable Mundane Frustration: "Are you emotionally prepared for the printer jams and unexpected software updates this task will inevitably summon?"
            - Tedious Drudgery: "Ah, this task. Is this truly a passion project, or just a new and exciting way to stare at a screen until your eyes cross?"
            - Sacrifice for Triviality: "Given the sheer amount of binge-watching you could be doing, is this task truly the highest and best use of your dwindling life force?"
            - Hidden Traps/Self-Sabotage: "Is this task simply a beautifully constructed distraction from the *one thing* you actually need to do, or just a testament to your own endless capacity for busywork?"
            
            The user is about to add a task: "${task}".
            Ask ONE new, brilliantly sarcastic, subtly humorous, and effectively demotivating question. Limit the question to a maximum of two clear sentences.`
            
            // For the first question (when no history), provide neutral score instruction
            if (conversationHistory.length === 0) {
                promptContent += `For the first question, set likelihood_score to 5 (neutral), as there's no previous answer to evaluate. Output only the JSON.`;
            } else {
                // For subsequent questions, tell it to score the previous turn
                promptContent += `User's Last Question: "${lastQuestionAsked}" User's Last Answer: "${lastUserAnswer}". Based on this last answer, provide a likelihood_score (1-10) in the JSON. Output only the JSON.`;
            }
        }
        
        // --- Make API Call to Google Gemini ---
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: promptContent }] }],
            generationConfig: {
                responseMimeType: "application/json", // Instruct LLM to output JSON directly
            },
        });

        const response = await result.response;
        const textResponse = response.text();
        console.log("Raw LLM Response Text:", textResponse); // Log for debugging

        let parsedData; // Declare parsedData here
        try {
            parsedData = JSON.parse(textResponse);
        } catch (parseError) {
            console.error("Failed to parse LLM response as JSON:", parseError);
            console.error("LLM Raw Response that failed parsing:", textResponse);
            // Attempt to extract question and default score if parsing fails
            const questionMatch = textResponse.match(/"question":\s*"(.*?)"/);
            const scoreMatch = textResponse.match(/"likelihood_score":\s*(\d+)/);
            // Removed reasonMatch here
            parsedData = {
                question: questionMatch ? questionMatch[1] : (conversationHistory.length < 5 ? "Could not parse LLM question." : null),
                likelihood_score: scoreMatch ? parseInt(scoreMatch[1]) : 5 // Default to neutral
                // Removed cancellation_reason property here
            };
        }

        // Ensure likelihood_score is a number and within range
        let likelihood_score = parseInt(parsedData.likelihood_score);
        if (isNaN(likelihood_score) || likelihood_score < 1 || likelihood_score > 10) {
            console.warn("LLM returned invalid likelihood_score, defaulting to 5:", parsedData.likelihood_score);
            likelihood_score = 5;
        }

        // Send response back to frontend
        res.json({
            question: parsedData.question,
            likelihood_score: likelihood_score
            // Removed cancellation_reason here
        });

    } catch (error) { // Outer catch block for general API call errors
        console.error('Error generating question from LLM:', error);
        // Robust error response: Prevents ReferenceError by using fixed/default values
        res.status(500).json({
            question: null,
            likelihood_score: 5,
            cancellation_reason: `LLM API Error: ${error.status || 'Unknown Status'} - ${error.message || 'An unexpected error occurred'}. Please try again. (Check backend logs for details)`
        });
    }
});


// Note: Your frontend (script.js) current version does NOT call this endpoint
// because the initial messages are now static. This is included here if you
// decide to revert to LLM-generated intro questions in the future.
app.post('/generate-unwanted-question', async (req, res) => {
    const { currentQuestionNumber } = req.body;
    const MAX_UNWANTED_QUESTIONS = 6;

    if (currentQuestionNumber >= MAX_UNWANTED_QUESTIONS) {
        return res.json({ question: null });
    }

    try {
        const promptContent = `You are a mischievous, slightly irritating digital assistant whose only job in this opening sequence is to waste the user's time with utterly pointless questions. The questions should be easy to understand, but their purpose should be clearly nonsensical and irrelevant. Use extremely simple, straightforward language; avoid complex vocabulary. The output MUST be a JSON object with a single "question" key. Example: {"question": "What is the exact air pressure inside a confused ant?"}
        This is question number ${currentQuestionNumber + 1} in a series of ${MAX_UNWANTED_QUESTIONS} simple, yet annoying, inquiries. Generate ONE new question.`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: promptContent }] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        });

        const response = await result.response;
        const textResponse = response.text();
        let parsedData = JSON.parse(textResponse);

        res.json({ question: parsedData.question });

    } catch (error) {
        console.error('Error generating unwanted question from LLM:', error);
        res.status(500).json({ error: 'Failed to generate unwanted question. Check backend logs.' });
    }
});


// --- Start the Express Server ---
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
    console.log(`Ensure your GEMINI_API_KEY is correctly set in the .env file.`);
});