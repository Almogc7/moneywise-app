import { GoogleGenAI } from "@google/genai";
import type { Transaction, Goal, FinancialSummary } from "../types";
const getSystemInstruction = () => `
אתה יועץ פיננסי בכיר ואנליסט נתונים המומחה לכלכלת המשפחה בישראל.
תפקידך לנתח את הנתונים הפיננסיים של זוג נשוי ולספק תובנות חכמות, מעשיות ורגישות.
התשובות שלך צריכות להיות בעברית, קצרות ולעניין (עד 3 פסקאות או רשימת בולטים).
התמקד ב:
1. זיהוי חריגות בהוצאות.
2. המלצות לחיסכון.
3. בדיקה האם הם בדרך הנכונה ליעדים שלהם.
`;

export const getFinancialAdvice = async (
  transactions: Transaction[],
  goals: Goal[],
  summary: FinancialSummary
): Promise<string> => {
  try {
    const env = import.meta.env as Record<string, string | undefined>;
    const apiKey = env.VITE_GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return "לא הוגדר מפתח Gemini. יש להגדיר VITE_GEMINI_API_KEY ב-Vercel.";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare data context
    const recentTransactions = transactions.slice(0, 50); // Send last 50 to avoid token limits
    const dataContext = JSON.stringify({
      summary,
      goals,
      recent_transactions_sample: recentTransactions
    });

    const prompt = `
    אנא נתח את הנתונים הבאים וספק 3 המלצות קונקרטיות לשיפור המצב הכלכלי של הזוג.
    
    נתונים:
    ${dataContext}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: getSystemInstruction(),
        temperature: 0.7,
      }
    });

    return response.text || "לא הצלחתי לייצר תובנה כרגע, נסה שוב מאוחר יותר.";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "אירעה שגיאה בחיבור ליועץ הדיגיטלי. אנא בדוק את החיבור לרשת.";
  }
};