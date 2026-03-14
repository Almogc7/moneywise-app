import React, { useState } from 'react';
import { CheckCircle, ExternalLink, Copy, FileDown, FileText } from 'lucide-react';
import { syncWithSheet } from '../services/sheetService';
import type { Transaction } from '../types';

interface Props {
  onSync: () => void;
  transactions: Transaction[];
  currentMonth: string;
}

const APPS_SCRIPT_CODE = `
// --- העתק קוד זה לעורך הסקריפטים של גוגל ---
var SECRET = 'REPLACE_WITH_YOUR_SECRET';

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {

  var payload = e.postData ? JSON.parse(e.postData.contents) : { action: 'get' };

  if (payload.secret !== SECRET) {
    return response({ status: 'error', message: 'Unauthorized' });
  }

  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = payload.action;

    if (action === 'setup') {
      setupSheet(ss);
      return response({ status: 'success', message: 'Sheet configured successfully' });
    }

    if (action === 'sync') {
      updateData(ss, payload.transactions, payload.goals);
    }

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
  var headers = rows.shift();

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

  if (transactions) {

    var tSheet = ss.getSheetByName('Transactions');

    if (tSheet.getLastRow() > 1) {
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
          t.cardType || '',
          t.isFixed || false,
          t.notes || ''
        ];

      });

      tSheet.getRange(2, 1, tRows.length, tRows[0].length).setValues(tRows);

    }

  }

  if (goals) {

    var gSheet = ss.getSheetByName('Goals');

    if (gSheet.getLastRow() > 1) {
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

    tSheet.appendRow([
      'id',
      'date',
      'type',
      'category',
      'subCategory',
      'amount',
      'member',
      'paymentMethod',
      'cardType',
      'isFixed',
      'notes'
    ]);

    tSheet.setFrozenRows(1);

  }

  var gSheet = ss.getSheetByName('Goals');

  if (!gSheet) {

    gSheet = ss.insertSheet('Goals');

    gSheet.appendRow([
      'id',
      'name',
      'targetAmount',
      'currentAmount',
      'deadline'
    ]);

    gSheet.setFrozenRows(1);

  }

}
// --- סוף קוד ---
`;

export const Settings: React.FC<Props> = ({
  onSync,
  transactions,
  currentMonth
}) => {

  const [copied, setCopied] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleCopy = () => {

    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);

    setTimeout(() => setCopied(false), 2000);

  };

  const handleInitialSetup = async () => {

    setIsSettingUp(true);
    setSetupStatus('idle');

    const res = await syncWithSheet('setup');

    setIsSettingUp(false);

    if (res.status === 'success') {

      setSetupStatus('success');
      onSync();

    } else {

      alert('Setup failed: ' + res.message);
      setSetupStatus('error');

    }

  };

  const exportToCSV = (filter: 'month' | 'year') => {
    if (!transactions || transactions.length === 0) {
      alert('אין נתונים לייצוא');
      return;
    }

    let dataToExport = [...transactions];
    let filename = 'moneywise_report.csv';

    if (filter === 'month') {
      dataToExport = transactions.filter((t) => t.date.startsWith(currentMonth));
      filename = `moneywise_monthly_report_${currentMonth}.csv`;
    } else {
      const year = currentMonth.split('-')[0] || new Date().getFullYear().toString();
      dataToExport = transactions.filter((t) => t.date.startsWith(year));
      filename = `moneywise_yearly_report_${year}.csv`;
    }

    if (dataToExport.length === 0) {
      alert('לא נמצאו נתונים לתקופה שנבחרה');
      return;
    }

    const headers = ['Date', 'Type', 'Category', 'SubCategory', 'Amount', 'Member', 'PaymentMethod', 'CardType', 'IsFixed', 'Notes'];
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...dataToExport.map((t) => [
        t.date,
        t.type === 'income' ? 'הכנסה' : 'הוצאה',
        `"${t.category}"`,
        `"${t.subCategory}"`,
        t.amount,
        t.member === 'almog' ? 'אלמוג' : t.member === 'amit' ? 'עמית' : 'משותף',
        t.paymentMethod || '-',
        t.cardType || '-',
        t.isFixed ? 'כן' : 'לא',
        `"${(t.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">

      <div className="bg-white rounded-xl shadow-sm border p-6">

        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <FileDown className="text-emerald-600" />
          דוחות וייצוא
        </h2>

        <div className="flex flex-wrap gap-3">

          <button
            onClick={() => exportToCSV('month')}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <FileText size={18} />
            הפקת דוח חודשי
          </button>

          <button
            onClick={() => exportToCSV('year')}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <FileText size={18} />
            הפקת דוח שנתי
          </button>

        </div>

      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">

        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <ExternalLink className="text-blue-600" />
          חיבור ל-Google Sheets
        </h2>

        <div className="space-y-6">

          <div className="border rounded-lg p-5">

            <h3 className="font-bold mb-2">
              שלב 1: צור סקריפט
            </h3>

            <p className="text-sm mb-4">
              פתח Google Sheet → Extensions → Apps Script
              והדבק את הקוד הבא:
            </p>

            <div className="relative">

              <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto h-40">

                <code>{APPS_SCRIPT_CODE}</code>

              </pre>

              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-white/10 p-2 rounded"
              >

                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}

              </button>

            </div>

          </div>

          <div className="border rounded-lg p-5">

            <h3 className="font-bold mb-2">
              שלב 2: הגדרה
            </h3>

            <button
              onClick={handleInitialSetup}
              disabled={isSettingUp}
              className="text-indigo-600 hover:underline"
            >

              {isSettingUp ? 'מגדיר...' : 'לחץ להגדרת הגיליון'}

            </button>

            {setupStatus === 'success' && (
              <span className="text-green-600 text-xs ml-2">
                הוגדר בהצלחה
              </span>
            )}

          </div>

        </div>

      </div>

    </div>
  );

};