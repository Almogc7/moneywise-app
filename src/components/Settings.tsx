import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ExternalLink, Copy, FileDown, FileText } from 'lucide-react';
import { syncWithSheet } from '../services/sheetService';
import type { Transaction } from '../types';

interface Props {
  sheetUrl: string;
  onSave: (url: string) => void;
  onSync: () => void;
  isCloudMode: boolean;
  transactions?: Transaction[];
  currentMonth?: string;
}

const APPS_SCRIPT_CODE = `
// --- העתק קוד זה לעורך הסקריפטים של גוגל ---
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); // Wait up to 10s for other users

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = e.postData ? JSON.parse(e.postData.contents) : { action: 'get' };
    var action = payload.action;

    if (action === 'setup') {
      setupSheet(ss);
      return response({ status: 'success', message: 'Sheet configured successfully' });
    }

    if (action === 'sync') {
      updateData(ss, payload.transactions, payload.goals);
      // Fall through to return updated data
    }

    // Default: Get all data
    var tSheet = ss.getSheetByName('Transactions');
    var gSheet = ss.getSheetByName('Goals');
    
    if (!tSheet || !gSheet) {
      return response({ status: 'error', message: 'Sheet not setup. Run setup first.' });
    }

    var transactions = getData(tSheet);
    var goals = getData(gSheet);

    return response({ status: 'success', data: { transactions: transactions, goals: goals } });

  } catch (err) {
    return response({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getData(sheet) {
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift(); // Remove header
  if (!headers) return [];
  
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });
    return obj;
  });
}

function updateData(ss, transactions, goals) {
  // Simple overwrite approach for this demo - ideal would be delta updates
  // For safety, we clear content but keep formatting
  if (transactions) {
    var tSheet = ss.getSheetByName('Transactions');
    if(tSheet.getLastRow() > 1) {
       tSheet.getRange(2, 1, tSheet.getLastRow()-1, tSheet.getLastColumn()).clearContent();
    }
    if (transactions.length > 0) {
      var tRows = transactions.map(function(t) {
        return [
          t.id, 
          t.date, 
          t.type, 
          t.category, 
          t.subCategory, 
          t.amount, 
          t.member, 
          t.paymentMethod || '', 
          t.cardType || '', // New field
          t.isFixed || false, 
          t.notes || ''
        ];
      });
      tSheet.getRange(2, 1, tRows.length, tRows[0].length).setValues(tRows);
    }
  }

  if (goals) {
    var gSheet = ss.getSheetByName('Goals');
    if(gSheet.getLastRow() > 1) {
       gSheet.getRange(2, 1, gSheet.getLastRow()-1, gSheet.getLastColumn()).clearContent();
    }
    if (goals.length > 0) {
      var gRows = goals.map(function(g) {
        return [g.id, g.name, g.targetAmount, g.currentAmount, g.deadline];
      });
      gSheet.getRange(2, 1, gRows.length, gRows[0].length).setValues(gRows);
    }
  }
}

function setupSheet(ss) {
  var tSheet = ss.getSheetByName('Transactions');
  if (!tSheet) {
    tSheet = ss.insertSheet('Transactions');
    // Updated header row with cardType
    tSheet.appendRow(['id', 'date', 'type', 'category', 'subCategory', 'amount', 'member', 'paymentMethod', 'cardType', 'isFixed', 'notes']);
    tSheet.setFrozenRows(1);
    
    // Format Header
    tSheet.getRange("A1:K1").setFontWeight("bold").setBackground("#f3f4f6");
    
    // Validation: Type
    var typeRule = SpreadsheetApp.newDataValidation().requireValueInList(['income', 'expense']).build();
    tSheet.getRange("C2:C1000").setDataValidation(typeRule);

    // Validation: Member
    var memRule = SpreadsheetApp.newDataValidation().requireValueInList(['almog', 'amit', 'joint']).build();
    tSheet.getRange("G2:G1000").setDataValidation(memRule);
  }

  var gSheet = ss.getSheetByName('Goals');
  if (!gSheet) {
    gSheet = ss.insertSheet('Goals');
    gSheet.appendRow(['id', 'name', 'targetAmount', 'currentAmount', 'deadline']);
    gSheet.setFrozenRows(1);
    gSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#f3f4f6");
  }

  // Add Dashboard Sheet
  var dSheet = ss.getSheetByName('Dashboard_Summary');
  if (!dSheet) {
    dSheet = ss.insertSheet('Dashboard_Summary');
    dSheet.getRange("A1").setValue("Income");
    dSheet.getRange("B1").setValue("Outcome");
    dSheet.getRange("C1").setValue("יתרה");
    
    dSheet.getRange("A2").setFormula('=SUMIF(Transactions!C:C, "income", Transactions!F:F)');
    dSheet.getRange("B2").setFormula('=SUMIF(Transactions!C:C, "expense", Transactions!F:F)');
    dSheet.getRange("C2").setFormula("=A2-B2");


    // Protect Dashboard
    var protection = dSheet.protect().setDescription('Dashboard Protection');
    protection.setWarningOnly(true);
  }
}
// --- סוף קוד ---
`;

export const Settings: React.FC<Props> = ({ sheetUrl, onSave, onSync, isCloudMode, transactions = [], currentMonth }) => {
  const [url, setUrl] = useState(sheetUrl);
  const [copied, setCopied] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    onSave(url);
  };

  const handleInitialSetup = async () => {
    if (!url) return;
    setIsSettingUp(true);
    setSetupStatus('idle');
    const res = await syncWithSheet(url, 'setup');
    setIsSettingUp(false);
    if (res.status === 'success') {
      setSetupStatus('success');
      onSync(); // Sync immediately after setup to pull any state
    } else {
      alert('Setup failed: ' + res.message);
      setSetupStatus('error');
    }
  };

  const exportToCSV = (filter: 'all' | 'month' | 'year') => {
    if (!transactions || transactions.length === 0) {
      alert('אין נתונים לייצוא');
      return;
    }

    let dataToExport = [...transactions];
    let filename = 'moneywise_all_data.csv';

    if (filter === 'month' && currentMonth) {
      dataToExport = transactions.filter(t => t.date.startsWith(currentMonth));
      filename = `moneywise_report_${currentMonth}.csv`;
    } else if (filter === 'year') {
      const currentYear = new Date().getFullYear().toString();
      dataToExport = transactions.filter(t => t.date.startsWith(currentYear));
      filename = `moneywise_report_${currentYear}.csv`;
    }

    // CSV Header
    const headers = ['Date', 'Type', 'Category', 'SubCategory', 'Amount', 'Member', 'PaymentMethod', 'CardType', 'IsFixed', 'Notes'];
    
    // Convert to CSV string with BOM for Hebrew support
    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...dataToExport.map(t => [
        t.date,
        t.type === 'income' ? 'הכנסה' : 'הוצאה',
        `"${t.category}"`, // Quote to handle commas in text
        `"${t.subCategory}"`,
        t.amount,
        t.member === 'almog' ? 'אלמוג' : (t.member === 'amit' ? 'עמית' : 'משותף'),
        t.paymentMethod || '-',
        t.cardType || '-',
        t.isFixed ? 'כן' : 'לא',
        `"${t.notes}"`
      ].join(','))
    ].join('\n');

    // Create download link
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in p-4">
      
      {/* Export Section */}
      <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
           <FileDown className="text-emerald-600" />
           דוחות וייצוא נתונים
        </h2>
        <p className="text-gray-600 mb-6 text-sm">
           הורד את הנתונים שלך לקובץ CSV (אקסל) לגיבוי או לניתוח חיצוני.
        </p>
        <div className="flex flex-wrap gap-4">
           <button 
             onClick={() => exportToCSV('month')}
             className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
           >
              <FileText size={18} />
              דוח חודש נוכחי ({currentMonth})
           </button>
           <button 
             onClick={() => exportToCSV('year')}
             className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-blue-500 hover:text-blue-700 transition-colors"
           >
              <FileText size={18} />
              דוח שנתי ({new Date().getFullYear()})
           </button>
           <button 
             onClick={() => exportToCSV('all')}
             className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-indigo-500 hover:text-indigo-700 transition-colors"
           >
              <FileDown size={18} />
              ייצוא מלא (גיבוי)
           </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ExternalLink className="text-blue-600" />
          חיבור ל-Google Sheets (סנכרון זוגי)
        </h2>
        
        <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded mb-6">
          <p className="text-sm text-blue-800">
            הגדרת חיבור זה תאפשר לך ולבן/בת הזוג שלך לעבוד על אותו קובץ בו-זמנית, לגבות את הנתונים ולצפות בהם ישירות דרך גוגל שיטס.
            <br/>
            <strong>שים לב:</strong> אם עדכנת גרסה, אנא העתק מחדש את הקוד למטה לעורך הסקריפטים.
          </p>
        </div>

        <div className="space-y-6">
          
          {/* Step 1 */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h3 className="font-bold text-gray-800 mb-2">שלב 1: צור גיליון וסקריפט</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>פתח גיליון Google Sheet חדש.</li>
              <li>תן לו שם (למשל "תקציב משפחתי").</li>
              <li>בתפריט העליון, לחץ על <strong>הרחבות (Extensions)</strong> &gt; <strong>Apps Script</strong>.</li>
              <li>מחק את כל הקוד שמופיע שם, והדבק את הקוד הבא:</li>
            </ol>
            
            <div className="relative mt-3">
              <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto h-40 dir-ltr text-left">
                <code>{APPS_SCRIPT_CODE}</code>
              </pre>
              <button 
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded transition-colors"
                title="העתק קוד"
              >
                {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h3 className="font-bold text-gray-800 mb-2">שלב 2: פריסה (Deploy)</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>לחץ על הכפתור הכחול <strong>Deploy</strong> (פריסה) &gt; <strong>New deployment</strong>.</li>
              <li>לחץ על גלגל השיניים ובחר <strong>Web app</strong>.</li>
              <li>בשדה Description כתוב "MoneyWise API".</li>
              <li>בשדה <strong>Who has access</strong> בחר <strong>Anyone</strong> (חשוב מאוד!).</li>
              <li>לחץ Deploy, אשר את הגישה (Review Permissions &gt; Advanced &gt; Go to Project (unsafe)).</li>
              <li>העתק את הכתובת שקיבלת (Web App URL).</li>
            </ol>
          </div>

          {/* Step 3 */}
          <div className="border border-gray-200 rounded-lg p-5">
            <h3 className="font-bold text-gray-800 mb-2">שלב 3: חיבור לאפליקציה</h3>
            <div className="flex flex-col md:flex-row gap-3 mt-3">
              <input 
                type="text" 
                placeholder="הדבק את ה-Web App URL כאן..." 
                className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button 
                onClick={handleSave}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 shadow-sm"
              >
                שמור חיבור
              </button>
            </div>
            {isCloudMode && (
               <div className="mt-4 flex items-center gap-3">
                  <button 
                    onClick={handleInitialSetup} 
                    disabled={isSettingUp}
                    className="text-indigo-600 font-medium text-sm hover:underline disabled:opacity-50"
                  >
                    {isSettingUp ? 'מגדיר גיליון...' : 'לחץ כאן להגדרת העמודות בגיליון (פעם ראשונה)'}
                  </button>
                  {setupStatus === 'success' && <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle size={12}/> הוגדר בהצלחה!</span>}
               </div>
            )}
          </div>

           {/* Step 4 */}
           <div className="border border-amber-100 bg-amber-50 rounded-lg p-5">
            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
               <AlertTriangle size={18}/>
               איך משתפים עם בן/בת הזוג?
            </h3>
            <ul className="list-disc list-inside space-y-2 text-sm text-amber-900">
              <li>בתוך הגיליון, לחץ על <strong>Share</strong> (שתף) והזמן את בן/בת הזוג כ-<strong>Editor</strong>.</li>
              <li>שלח להם את כתובת ה-Web App URL (משלב 2).</li>
              <li>הם צריכים לפתוח את האפליקציה במכשיר שלהם, להיכנס למסך זה, ולהדביק את אותה כתובת בדיוק.</li>
              <li>זהו! מעכשיו כל שינוי שמישהו עושה יופיע אצל השני.</li>
            </ul>
          </div>
          
        </div>
      </div>
    </div>
  );
};