import React, { createContext, useState, useEffect, useContext } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase-config'; // Adjust import path as needed

const SettingsContext = createContext();

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

export const SettingsProvider = ({ children, appId }) => {
    const [companySettings, setCompanySettings] = useState({
        companyName: 'My Company Ltd',
        companyTIN: 'C000000000',
        companyAddress: 'Accra, Ghana',
        companyPhone: '+233 00 000 0000',
        companyEmail: 'info@mycompany.com',
        currency: 'GHS'
    });

    const [globalRates, setGlobalRates] = useState({
        vatRate: 15,
        nhilRate: 2.5,
        getFundRate: 2.5,
        covidRate: 1,
        momoRate: 1
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);

    const loadSettings = async (currentAppId) => {
        if (!currentAppId) return;

        try {
            setLoading(true);

            // Load Company Settings
            try {
                const settingsRef = doc(db, `artifacts/${currentAppId}/public/data/settings/company`);
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCompanySettings(settingsSnap.data());
                }
            } catch (err) {
                console.error('Error loading company settings:', err);
            }

            // Load Global Rates
            try {
                const ratesRef = doc(db, `artifacts/${currentAppId}/public/data/settings/rates`);
                const ratesSnap = await getDoc(ratesRef);
                if (ratesSnap.exists()) {
                    setGlobalRates(ratesSnap.data());
                }
            } catch (err) {
                console.error('Error loading global rates:', err);
            }

        } catch (err) {
            console.error('Error loading settings:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser && appId) {
                loadSettings(appId);
            } else if (!currentUser) {
                // Optional: Reset settings or handle logged out state if needed
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [appId]);

    // Function to refresh settings (can be called after updates)
    const refreshSettings = () => {
        if (user && appId) {
            loadSettings(appId);
        }
    };

    const value = {
        companySettings,
        globalRates,
        loading,
        error,
        refreshSettings
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

export default SettingsContext;
