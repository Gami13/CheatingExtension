import { CONFIG } from "./config";

interface CachedContent {
  answer: string;
  explanation: string;
}

const tabAnswers: { [tabId: number]: CachedContent } = {};

// Clean up answered cached when a tab is closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabAnswers[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    delete tabAnswers[tabId];
  }
});

async function fetchGeminiAnswer(questionText: string, apiKey: string): Promise<CachedContent | null> {
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
            explanation: {
              type: "STRING",
              description: "A detailed explanation of why the answer is correct.",
            },
          },
          required: ["answer", "explanation"],
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
    if (parsed.answer && parsed.explanation) {
      return {
        answer: parsed.answer.trim(),
        explanation: parsed.explanation.trim()
      };
    }
    return null;
  } catch (e) {
    console.error("Failed to parse JSON response:", rawText);
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAnswer") {
    const tabId = sender.tab?.id;
    if (tabId && tabAnswers[tabId]) {
      sendResponse({ answer: tabAnswers[tabId].answer, explanation: tabAnswers[tabId].explanation });
    } else {
      sendResponse({ answer: null, explanation: null });
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
        const content = await fetchGeminiAnswer(questionText, apiKey);
        if (content) {
          tabAnswers[tabId] = content;
          sendResponse({ answer: content.answer, explanation: content.explanation, error: null });
        } else {
          sendResponse({ answer: null, explanation: null, error: "Empty response from API." });
        }
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        sendResponse({
          answer: null,
          explanation: null,
          error: error.message || "Error communicating with API.",
        });
      }
    });

    // Return true indicates we will respond asynchronously
    return true;
  }
});
