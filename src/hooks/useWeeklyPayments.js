import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, db } from 'firebase/firestore';
// import { useAuth } from '../contexts/AuthContext';

/**
 * Streams payments for a weekly sheet.
 * Returns only payments with status === 'pending' by default.
 */
export default function useWeeklyPayments(weeklySheetId, { status = 'pending' } = {}) {
  // const { db, appId } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !appId || !weeklySheetId) return;
    setLoading(true);
    setError('');

    const col = collection(db, `artifacts/${appId}/public/weeklySheets/${weeklySheetId}/payments`);
    const q = status ? query(col, where('status', '==', status)) : query(col);

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          vendor: data.vendor || '',
          invoiceNo: data.invoiceNo || '',
          description: data.description || '',
          amount: Number(data.amount || 0),
          currency: data.currency || 'GHS',
          budgetLine: data.budgetLine || '',
          fxRate: Number(data.fxRate || 1),
          taxType: data.taxType || 'WHT',
          vatDecision: data.vatDecision || 'VATABLE',
          procurementType: data.procurementType || 'SERVICES',
          paymentMode: data.paymentMode || 'BANK_TRANSFER',
          // Provide back-reference so finalization can mark this payment as finalized
          sourceRefPath: `artifacts/${appId}/public/weeklySheets/${weeklySheetId}/payments/${d.id}`
        };
      });
      setPayments(rows);
      setLoading(false);
    }, (err) => {
      setError(err.message || 'Failed to load payments');
      setLoading(false);
    });

    return () => unsub();
  }, [db, appId, weeklySheetId, status]);

  return { payments, loading, error };
}