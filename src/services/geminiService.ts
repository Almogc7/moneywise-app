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

const CATEGORY_ALIASES: Record<string, string> = {
  'סופר': 'מזון וסופר',
  'סופרמרקט': 'מזון וסופר',
  'מכולת': 'מזון וסופר',
  'דלק': 'רכב ותחבורה',
  'תחבורה': 'רכב ותחבורה',
  'דירה': 'דיור',
  'שכר דירה': 'דיור',
  'שכירות': 'דיור',
  'חשמל': 'חשבונות',
  'מים': 'חשבונות',
  'ארנונה': 'חשבונות',
  'טלפון': 'חשבונות',
  'סלולר': 'חשבונות',
  'מסעדה': 'בילויים ומסעדות',
  'מסעדות': 'בילויים ומסעדות',
  'בילוי': 'בילויים ומסעדות',
  'רפואה': 'בריאות',
  'רופא': 'בריאות',
  'ביטוח': 'ביטוחים',
  'בגדים': 'קניות והלבשה',
  'קניות': 'קניות והלבשה',
  'נופש': 'חופשות',
  'חופשה': 'חופשות',
};

const normalizeCategory = (input?: string) => {
  if (!input) return 'שונות';
  const clean = input.trim();

  if (EXPENSE_CATEGORIES.includes(clean)) {
    return clean;
  }

  const aliasHit = Object.entries(CATEGORY_ALIASES).find(([alias]) => clean.includes(alias));
  if (aliasHit) {
    return aliasHit[1];
  }

  const fuzzyHit = EXPENSE_CATEGORIES.find((cat) => cat.includes(clean) || clean.includes(cat));
  return fuzzyHit || 'שונות';
};

const normalizePaymentMethod = (input?: string) => {
  if (!input) return 'credit';
  const value = input.trim().toLowerCase();

  if (value.includes('credit') || value.includes('אשראי') || value.includes('card') || value.includes('כרטיס')) return 'credit';
  if (value.includes('cash') || value.includes('מזומן')) return 'cash';
  if (value.includes('transfer') || value.includes('העברה')) return 'transfer';
  if (value.includes('bit') || value.includes('ביט')) return 'bit';
  if (value.includes('check') || value.includes('cheque') || value.includes('צ') || value.includes('שיק')) return 'check';

  return 'credit';
};

const normalizeDate = (input?: string) => {
  if (!input) return new Date().toISOString().split('T')[0];

  const clean = input.trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dmyMatch = clean.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const yearRaw = dmyMatch[3];
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split('T')[0];
};

const extractJsonObject = (text: string) => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');

  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found in Gemini response');
  }

  return cleaned.slice(first, last + 1);
};

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
אם אינך בטוח בקטגוריה, החזר "שונות".
SMS לניתוח:
${smsText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const rawText = response.text ?? '';
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText) as ParsedTransaction;

  // Normalize AI output so it always matches app dropdown values.
  const normalizedAmount = parsed.amount?.toString().replace(/[^\d.\-]/g, '');

  return {
    amount: normalizedAmount || undefined,
    category: normalizeCategory(parsed.category),
    subCategory: parsed.subCategory?.trim() || '',
    date: normalizeDate(parsed.date),
    paymentMethod: normalizePaymentMethod(parsed.paymentMethod),
  };
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