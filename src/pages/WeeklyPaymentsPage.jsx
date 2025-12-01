import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { ArrowLeft, LogOut, Plus, Settings, FileText, Edit, Trash2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import ValidationManager from '../components/ValidationManager';
import DocumentGenerator from '../components/DocumentGenerator';

const WeeklyPaymentsPage = ({ db, userId, appId, onNavigate, onBack, onLogout }) => {
    const [weeklySheets, setWeeklySheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSheetName, setNewSheetName] = useState('');
    const [showValidationManager, setShowValidationManager] = useState(false);
    const [showDocumentGenerator, setShowDocumentGenerator] = useState(false);

    // Fetch weekly sheets from Firestore
    useEffect(() => {
        if (!db || !userId) return;
        const sheetsCollection = collection(db, `artifacts/${appId}/public/data/weeklySheets`);
        const unsubscribe = onSnapshot(sheetsCollection, (snapshot) => {
            const sheetData = snapshot.docs.map(doc => doc.id);
            setWeeklySheets(sheetData);
            setLoading(false);
        }, (error) => {
            console.error("Error loading weekly sheets:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, userId, appId]);

    const handleAddSheet = async () => {
        if (newSheetName && db && userId) {
            try {
                const sheetRef = doc(db, `artifacts/${appId}/public/data/weeklySheets`, newSheetName);
                await setDoc(sheetRef, { createdAt: new Date().toISOString() });
                setNewSheetName('');
            } catch (e) {
                console.error("Error adding document: ", e);
                alert("Failed to add new sheet.");
            }
        }
    };

    const handleEditSheet = async (oldName) => {
        const newName = prompt(`Enter new name for ${oldName}:`, oldName);
        if (newName && newName.trim() && newName !== oldName && db && userId) {
            try {
                // Get the old document data first
                const oldRef = doc(db, `artifacts/${appId}/public/data/weeklySheets`, oldName);
                const oldDoc = await getDoc(oldRef);

                if (!oldDoc.exists()) {
                    alert("Sheet not found!");
                    return;
                }

                // Create new document with the same data but new name
                const newRef = doc(db, `artifacts/${appId}/public/data/weeklySheets`, newName);
                await setDoc(newRef, {
                    ...oldDoc.data(),
                    name: newName,
                    updatedAt: new Date().toISOString()
                });

                // Delete the old document
                await deleteDoc(oldRef);

                console.log(`Sheet renamed from ${oldName} to ${newName}`);

                // Force refresh of the weekly sheets list
                const sheetsCollection = collection(db, `artifacts/${appId}/public/data/weeklySheets`);
                const querySnapshot = await getDocs(sheetsCollection);
                const sheetData = querySnapshot.docs.map(doc => doc.id);
                setWeeklySheets(sheetData);

            } catch (e) {
                console.error("Error editing document: ", e);
                alert("Failed to edit sheet name.");
            }
        }
    };

    const handleDeleteSheet = async (name) => {
        if (window.confirm(`Are you sure you want to delete the weekly sheet '${name}'? This action cannot be undone.`)) {
            if (!db || !userId) return;
            try {
                const sheetRef = doc(db, `artifacts/${appId}/public/data/weeklySheets`, name);

                // Check if document exists before deleting
                const sheetDoc = await getDoc(sheetRef);
                if (!sheetDoc.exists()) {
                    alert("Sheet not found!");
                    return;
                }

                // Delete the document
                await deleteDoc(sheetRef);
                console.log(`Sheet '${name}' deleted successfully`);

                // Force refresh of the weekly sheets list
                const sheetsCollection = collection(db, `artifacts/${appId}/public/data/weeklySheets`);
                const querySnapshot = await getDocs(sheetsCollection);
                const sheetData = querySnapshot.docs.map(doc => doc.id);
                setWeeklySheets(sheetData);

            } catch (e) {
                console.error("Error deleting document: ", e);
                alert(`Failed to delete sheet: ${e.message}`);
            }
        }
    };

    if (loading) {
        return <div className="p-4 text-center">Loading weekly sheets...</div>;
    }

    return (
        <Layout
            title="Weekly Payments"
            userId={userId}
            onBack={onBack}
            onLogout={onLogout}
        >
            <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col space-y-2">
                        <button
                            onClick={handleAddSheet}
                            className="w-full p-3 bg-purple-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-purple-600 transition-colors"
                        >
                            <Plus size={20} />
                            <span>Add Sheet</span>
                        </button>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="New sheet name"
                                value={newSheetName}
                                onChange={(e) => setNewSheetName(e.target.value)}
                                className="flex-1 p-2 border border-gray-300 rounded-md"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                        <button
                            onClick={() => setShowValidationManager(true)}
                            className="w-full p-3 bg-blue-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-blue-600 transition-colors"
                        >
                            <Settings size={20} />
                            <span>Validation</span>
                        </button>
                        <div className="text-xs text-gray-500 text-center">
                            Manage dropdown options
                        </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                        <button
                            onClick={() => setShowDocumentGenerator(true)}
                            className="w-full p-3 bg-green-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-green-600 transition-colors"
                        >
                            <FileText size={20} />
                            <span>Generate Documents</span>
                        </button>
                        <div className="text-xs text-gray-500 text-center">
                            Create PDF reports
                        </div>
                    </div>
                </div>

                <h3 className="text-xl font-bold pt-4">Available Weekly Sheets</h3>
                <div className="bg-gray-50 border border-gray-300 rounded-md overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px divide-y divide-gray-200">
                        {weeklySheets.map((sheet, index) => (
                            <div key={index} className="flex justify-between items-center w-full text-left p-3 hover:bg-blue-50 transition-colors">
                                <button
                                    onClick={() => {
                                        console.log('=== NAVIGATION DEBUG ===');
                                        console.log('Navigating to weeklyPaymentsDetail with sheet:', sheet);
                                        console.log('Sheet type:', typeof sheet);
                                        console.log('Sheet value:', sheet);
                                        onNavigate('weeklyPaymentsDetail', { sheetName: sheet });
                                    }}
                                    className="flex-1 text-left"
                                >
                                    {sheet}
                                </button>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleEditSheet(sheet)} className="text-indigo-600 hover:text-indigo-900">
                                        <Edit size={16} />
                                    </button>
                                    <button onClick={() => handleDeleteSheet(sheet)} className="text-red-600 hover:text-red-900">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <button
                    onClick={onBack}
                    className="mt-4 p-3 bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"
                >
                    Back to Dashboard
                </button>
            </div>

            {/* Validation Manager Modal */}
            {showValidationManager && (
                <ValidationManager
                    db={db}
                    userId={userId}
                    appId={appId}
                    onClose={() => setShowValidationManager(false)}
                />
            )}

            {/* Document Generator Modal */}
            {showDocumentGenerator && (
                <DocumentGenerator
                    isOpen={showDocumentGenerator}
                    onClose={() => setShowDocumentGenerator(false)}
                    sheetName="Weekly Payments"
                    payments={[]}
                    validationData={{}}
                />
            )}
        </Layout>
    );
};

export default WeeklyPaymentsPage;
