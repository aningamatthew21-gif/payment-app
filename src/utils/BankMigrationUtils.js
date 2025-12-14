/**
 * Bank Migration Utility
 * Removes old bank entries from validation collection
 * Run this once to clean up after migrating to Bank Management system
 */

import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

export const cleanupOldBanksFromValidation = async (db, appId) => {
    try {
        console.log('[BankMigration] Starting cleanup of old banks from validation collection...');

        const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
        const banksQuery = query(validationRef, where('field', '==', 'banks'));

        const snapshot = await getDocs(banksQuery);

        console.log(`[BankMigration] Found ${snapshot.docs.length} old bank entries to delete`);

        // Delete all old bank validation entries
        const deletePromises = snapshot.docs.map(docSnapshot => {
            console.log(`[BankMigration] Deleting bank: ${docSnapshot.data().value}`);
            return deleteDoc(doc(db, `artifacts/${appId}/public/data/validation`, docSnapshot.id));
        });

        await Promise.all(deletePromises);

        console.log('[BankMigration] Successfully deleted all old bank entries from validation collection');

        return {
            success: true,
            deletedCount: snapshot.docs.length,
            message: `Successfully removed ${snapshot.docs.length} old bank entries from validation collection`
        };
    } catch (error) {
        console.error('[BankMigration] Error cleaning up old banks:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

export const BankMigrationUtils = {
    cleanupOldBanksFromValidation
};

export default BankMigrationUtils;
