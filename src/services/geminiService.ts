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

const EXPENSE_CATEGORIES = ['דיור', 'מזון וסופר', 'רכב ותחבורה', 'חשבונות', 'ילדים', 'בילויים ומסעדות', 'בריאות', 'ביטוחים', 'קניות והלבשה', 'חיסכון והשקעות', 'חופשות', 'שונות'];

export interface ParsedTransaction {
  amount?: string;
  category?: string;
  subCategory?: string;
  date?: string;
  paymentMethod?: string;
}

export const parseTransactionFromSMS = async (smsText: string): Promise<ParsedTransaction> => {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_GEMINI_API_KEY?.trim();

  if (!apiKey) throw new Error('Missing VITE_GEMINI_API_KEY');

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().split('T')[0];

  const prompt = `נתח את ה-SMS הבא מבנק או כרטיס אשראי ישראלי וחלץ את פרטי העסקה.
החזר JSON בלבד, ללא מרכאות קוד (\`\`\`), בפורמט הבא:
{"amount":"<מספר בלבד>","category":"<קטגוריה>","subCategory":"<שם בית עסק>","date":"<YYYY-MM-DD>","paymentMethod":"<credit|cash>"}
קטגוריות אפשריות: ${EXPENSE_CATEGORIES.join(', ')}
אם התאריך לא ברור, השתמש בתאריך היום: ${today}
אם אמצעי התשלום לא ברור, ברירת מחדל: credit
SMS לניתוח:
${smsText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const raw = (response.text ?? '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(raw) as ParsedTransaction;
};

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