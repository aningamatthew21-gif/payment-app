import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, db, query } from 'firebase/firestore';
//import { useAuth } from '../contexts/AuthContext';

const SheetSelector = ({ selectedSheetId, onChange }) => {
  const { db, appId } = useAuth();
  const [sheets, setSheets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db || !appId) return;
    setIsLoading(true);

    const col = collection(db, `artifacts/${appId}/public/weeklySheets`);
    const q = query(col, orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSheets(list);
      setIsLoading(false);
    }, () => setIsLoading(false));

    return () => unsub();
  }, [db, appId]);

  const handleSelect = (e) => {
    const id = e.target.value;
    const sheet = sheets.find(s => s.id === id) || null;
    onChange(sheet ? { id: sheet.id, name: sheet.name } : null);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-700">Weekly Sheet</label>
      <select
        value={selectedSheetId || ''}
        disabled={isLoading}
        onChange={handleSelect}
        className="px-3 py-2 border rounded-md text-sm min-w-[240px]"
      >
        <option value="">Select a sheet...</option>
        {sheets.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
};

export default SheetSelector;