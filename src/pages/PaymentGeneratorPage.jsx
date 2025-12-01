import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, FileText } from 'lucide-react';
import PaymentGenerator from '../components/PaymentGenerator';
import { PaymentProvider } from '../contexts/PaymentProvider';

const PaymentGeneratorPage = ({ db, userId, appId, onBack, selectedPayments, initialSheetName }) => {
    const [sheets, setSheets] = useState([]);
    const [availablePayments, setAvailablePayments] = useState([]);
    const [selectedSheetId, setSelectedSheetId] = useState(initialSheetName || '');

    // Load weekly sheets
    useEffect(() => {
        if (!db || !userId || !appId) return;

        const loadWeeklySheets = async () => {
            try {
                const sheetsRef = collection(db, `artifacts/${appId}/public/data/weeklySheets`);
                const querySnapshot = await getDocs(sheetsRef);
                const loadedSheets = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.id,
                    weekEnding: doc.data().weekEnding || 'N/A'
                }));
                setSheets(loadedSheets);
            } catch (error) {
                console.error('Error loading weekly sheets:', error);
            }
        };

        loadWeeklySheets();
    }, [db, userId, appId]);

    // Initialize available payments if passed from props
    useEffect(() => {
        if (selectedPayments && selectedPayments.length > 0) {
            setAvailablePayments(selectedPayments);
        }
    }, [selectedPayments]);

    const handleLoadPayments = async (sheetId) => {
        if (!sheetId || !db || !userId) return;

        try {
            console.log('Loading payments for sheet:', sheetId);
            const paymentsRef = collection(db, `artifacts/${appId}/public/data/weeklySheets/${sheetId}/payments`);
            const q = query(paymentsRef);
            const querySnapshot = await getDocs(q);
            const paymentsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log('Loaded payments:', paymentsData);
            setAvailablePayments(paymentsData);
            setSelectedSheetId(sheetId);
        } catch (e) {
            console.error("Error loading payments: ", e);
            alert("Failed to load payments for this sheet.");
        }
    };

    return (
        <PaymentProvider>
            <div className="p-4 font-sans text-gray-800">
                <div className="max-w-7xl mx-auto space-y-6">
                    <header className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-500">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center space-x-2">
                                <button
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                                    onClick={onBack}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <h1 className="text-2xl font-bold">Payment Schedule Generator</h1>
                            </div>
                        </div>
                    </header>

                    <PaymentGenerator
                        db={db}
                        userId={userId}
                        appId={appId}
                        weeklySheetId={selectedSheetId}
                        sheetName={selectedSheetId} // Pass sheetName explicitly
                        availablePayments={availablePayments}
                        setAvailablePayments={setAvailablePayments}
                        sheets={sheets}
                        onSheetSelect={setSelectedSheetId}
                        onLoadPayments={handleLoadPayments}
                    />
                </div>
            </div>
        </PaymentProvider>
    );
};

export default PaymentGeneratorPage;
