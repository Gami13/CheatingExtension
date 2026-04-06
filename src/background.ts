import { CONFIG } from "./config";

const tabAnswers: { [tabId: number]: string } = {};

// Clean up answered cached when a tab is closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabAnswers[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    delete tabAnswers[tabId];
  }
});

async function fetchGeminiAnswer(questionText: string, apiKey: string): Promise<string | null> {
  const url = `${CONFIG.GEMINI.API_URL}${CONFIG.GEMINI.MODEL}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: CONFIG.GEMINI.SYSTEM_PROMPT }],
      },
      contents: [{ parts: [{ text: questionText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            answer: {
              type: "STRING",
              description: "The exact short text to type as the answer.",
            },
          },
          required: ["answer"],
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API Error Payload:", data);
    throw new Error(`API Error ${response.status}: ${data.error?.message || response.statusText}`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    return parsed.answer?.trim() || null;
  } catch (e) {
    console.error("Failed to parse JSON response:", rawText);
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAnswer") {
    const tabId = sender.tab?.id;
    if (tabId && tabAnswers[tabId]) {
      sendResponse({ answer: tabAnswers[tabId] });
    } else {
      sendResponse({ answer: null });
    }
    return false;
  }

  if (request.action === "fetchAnswer") {
    const questionText = request.questionText;
    const tabId = sender.tab?.id;

    if (!tabId) {
      sendResponse({ answer: null, error: "No tab id found." });
      return false;
    }

    // Reset current cache for this tab before fetching
    delete tabAnswers[tabId];

    chrome.storage.local.get(["geminiApiKey"], async (result) => {
      const apiKey = result.geminiApiKey as string;
      if (!apiKey) {
        sendResponse({ answer: null, error: "API key not configured." });
        return;
      }

      try {
        const answer = await fetchGeminiAnswer(questionText, apiKey);
        if (answer) {
          tabAnswers[tabId] = answer;
          sendResponse({ answer, error: null });
        } else {
          sendResponse({ answer: null, error: "Empty response from API." });
        }
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        sendResponse({
          answer: null,
          error: error.message || "Error communicating with API.",
        });
      }
    });

    // Return true indicates we will respond asynchronously
    return true;
  }
});
