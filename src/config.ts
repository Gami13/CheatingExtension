export const CONFIG = {
  UI: {
    OVERLAY: {
      position: "fixed",
      bottom: "8px",
      top: "auto",
      left: "8px",
      right: "auto",
      fontSize: "10px",
      color: "#000",
      zIndex: "2147483647",
      fontFamily: "monospace",
      letterSpacing: "-0.5px",
      visibleOpacity: "0.075",
      hiddenOpacity: "0",
    },
  },
  KEYS: {
    STEALTH_TYPING: "AltRight",
  },
  DOM: {
    QUESTION_CONTAINER: ".question_essence",
    MULTIPLE_CHOICE_ANSWER: ".answer_body",
  },
  TIMING: {
    POLL_INTERVAL_MS: 1000,
    INITIAL_POLL_DELAY_MS: 5000,
  },
  GEMINI: {
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
    MODEL: "gemini-2.5-flash-lite",
    SYSTEM_PROMPT:
      "You are a precise tool that answers test questions. You MUST answer ALL parts of the question. If there are multiple blanks or sub-questions, answer every single one. For fill-in-the-blank questions, provide answers for ALL blanks numbered like '1. answer\n2. answer'. Never answer only the first part.",
  },
};
