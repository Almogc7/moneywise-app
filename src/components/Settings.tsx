import React, { useState } from 'react';
import { CheckCircle, ExternalLink, Copy, FileDown, FileText } from 'lucide-react';
import { syncWithSheet } from '../services/sheetService';
import type { Transaction, BudgetLimit, CardAccountMapping } from '../types';
import { MEMBERS, PAYMENT_METHODS, CARD_TYPES } from '../types';
import { BudgetLimits } from './BudgetLimits';

interface Props {
  onSync: () => void;
  transactions: Transaction[];
  currentMonth: string;
  budgetLimits: BudgetLimit[];
  expensesByCategory: { name: string; value: number }[];
  onSaveBudgets: (limits: BudgetLimit[]) => void;
  cardMappings: CardAccountMapping[];
  onSaveCardMappings: (mappings: CardAccountMapping[]) => void;
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
  currentMonth,
  budgetLimits,
  expensesByCategory,
  onSaveBudgets,
  cardMappings,
  onSaveCardMappings
}) => {

  const [copied, setCopied] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [newMapping, setNewMapping] = useState<{
    suffix: string;
    member: CardAccountMapping['member'];
    paymentMethod: NonNullable<CardAccountMapping['paymentMethod']>;
    cardType: string;
    label: string;
  }>({
    suffix: '',
    member: 'joint',
    paymentMethod: 'credit',
    cardType: '',
    label: '',
  });

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

  const addCardMapping = () => {
    const suffix = newMapping.suffix.trim().replace(/\D/g, '').slice(-4);

    if (suffix.length !== 4) {
      alert('יש להזין 4 ספרות אחרונות של כרטיס.');
      return;
    }

    const safePaymentMethod = PAYMENT_METHODS.some((m) => m.id === newMapping.paymentMethod)
      ? newMapping.paymentMethod
      : 'credit';
    const safeCardType: CardAccountMapping['cardType'] = CARD_TYPES.some((c) => c.id === newMapping.cardType)
      ? (newMapping.cardType as CardAccountMapping['cardType'])
      : undefined;

    const mappingToSave: CardAccountMapping = {
      suffix,
      member: newMapping.member,
      paymentMethod: safePaymentMethod,
      cardType: safeCardType,
      label: newMapping.label?.trim() || undefined,
    };

    const updated: CardAccountMapping[] = [
      ...cardMappings.filter((m) => m.suffix !== suffix),
      mappingToSave,
    ];

    onSaveCardMappings(updated);
    setNewMapping({
      suffix: '',
      member: 'joint',
      paymentMethod: 'credit',
      cardType: '',
      label: '',
    });
  };

  const deleteCardMapping = (suffix: string) => {
    onSaveCardMappings(cardMappings.filter((m) => m.suffix !== suffix));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">

      <BudgetLimits
        budgetLimits={budgetLimits}
        expensesByCategory={expensesByCategory}
        onSave={onSaveBudgets}
      />

      <div className="bg-white rounded-xl shadow-sm border p-6">

        <h2 className="text-2xl font-bold mb-4">מיפוי כרטיסים לחשבון</h2>
        <p className="text-sm text-gray-500 mb-4">הגדרה זו תשמש את מילוי ה-SMS האוטומטי כדי לבחור שיוך/כרטיס בצורה חכמה.</p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
          <input
            value={newMapping.suffix}
            onChange={(e) => setNewMapping({ ...newMapping, suffix: e.target.value })}
            placeholder="4 ספרות אחרונות"
            className="p-2 border border-gray-200 rounded-lg text-sm"
          />

          <select
            value={newMapping.member}
            onChange={(e) => setNewMapping({ ...newMapping, member: e.target.value as CardAccountMapping['member'] })}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            {MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <select
            value={newMapping.paymentMethod || 'credit'}
            onChange={(e) => setNewMapping({ ...newMapping, paymentMethod: e.target.value as NonNullable<CardAccountMapping['paymentMethod']> })}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <select
            value={newMapping.cardType || ''}
            onChange={(e) => setNewMapping({ ...newMapping, cardType: e.target.value })}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">סוג כרטיס (אופציונלי)</option>
            {CARD_TYPES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          <button
            onClick={addCardMapping}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            שמור מיפוי
          </button>
        </div>

        <input
          value={newMapping.label || ''}
          onChange={(e) => setNewMapping({ ...newMapping, label: e.target.value })}
          placeholder="תיאור/כינוי (אופציונלי)"
          className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-4"
        />

        <div className="space-y-2">
          {cardMappings.length === 0 && <p className="text-sm text-gray-400">אין מיפויי כרטיסים עדיין.</p>}
          {cardMappings.map((m) => (
            <div key={m.suffix} className="flex items-center justify-between border rounded-lg p-3">
              <div className="text-sm text-gray-700">
                <strong>****{m.suffix}</strong>
                {' · '}
                {MEMBERS.find((x) => x.id === m.member)?.label || 'משותף'}
                {' · '}
                {PAYMENT_METHODS.find((x) => x.id === m.paymentMethod)?.label || 'כרטיס אשראי'}
                {m.cardType ? ` · ${CARD_TYPES.find((x) => x.id === m.cardType)?.label || m.cardType}` : ''}
                {m.label ? ` · ${m.label}` : ''}
              </div>
              <button
                onClick={() => deleteCardMapping(m.suffix)}
                className="text-sm text-red-600 hover:underline"
              >
                מחק
              </button>
            </div>
          ))}
        </div>

      </div>

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