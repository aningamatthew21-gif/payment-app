import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from 'firebase/firestore';

/**
 * Audit Action Types
 * Defines all possible actions that can be logged in the system
 */
export const AUDIT_ACTIONS = {
    // Authentication
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',

    // Navigation
    VIEW_PAGE: 'VIEW_PAGE',

    // CRUD Operations
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',

    // Workflow Actions
    APPROVE: 'APPROVE',
    REJECT: 'REJECT',

    // Data Operations
    EXPORT_DATA: 'EXPORT_DATA',
    IMPORT_DATA: 'IMPORT_DATA',

    // System Events
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SYSTEM_WARNING: 'SYSTEM_WARNING'
};

/**
 * AuditService
 * Singleton service for logging all system actions to Firestore
 * Uses fire-and-forget pattern to ensure zero performance impact
 */
class AuditService {
    constructor(db, appId) {
        this.db = db;
        this.appId = appId;
        this.collectionPath = `artifacts/${appId}/systemAuditLogs`;
    }

    /**
     * Log an action to the audit trail
     * This method is non-blocking (fire-and-forget)
     * 
     * @param {string} actionType - From AUDIT_ACTIONS
     * @param {string} resource - What was touched (e.g., "BudgetLine", "Payment")
     * @param {object|string} details - The specific data changes or notes
     * @param {object} user - The user object (uid, email, displayName)
     * @param {object} metadata - Optional additional data (IP, sessionId, etc.)
     */
    async log(actionType, resource, details, user, metadata = {}) {
        try {
            if (!this.db || !this.appId) {
                console.warn('[AuditService] DB or AppId not initialized, skipping log');
                return;
            }

            // Build log entry
            const logEntry = {
                actionType,
                resource,
                details: typeof details === 'object' ? JSON.stringify(details) : String(details),
                userId: user?.uid || 'anonymous',
                userEmail: user?.email || 'Unknown',
                userName: user?.displayName || user?.email || 'Unknown User',
                timestamp: serverTimestamp(),
                userAgent: navigator?.userAgent || 'Unknown',
                ...metadata
            };

            // Fire and forget - don't await this to avoid blocking UI
            // The async nature means if this fails, the UI operation still succeeds
            addDoc(collection(this.db, this.collectionPath), logEntry).catch(error => {
                // Fail silently to not disrupt user experience
                console.warn('[AuditService] Failed to log action:', error);
            });

        } catch (error) {
            // Catch any synchronous errors (like JSON.stringify failures)
            console.warn('[AuditService] Error preparing log entry:', error);
        }
    }

    /**
     * Synchronous version of log that waits for completion
     * Use for critical operations where you need to ensure logging succeeded
     */
    async logSync(actionType, resource, details, user, metadata = {}) {
        try {
            if (!this.db || !this.appId) return;

            const logEntry = {
                actionType,
                resource,
                details: typeof details === 'object' ? JSON.stringify(details) : String(details),
                userId: user?.uid || 'anonymous',
                userEmail: user?.email || 'Unknown',
                userName: user?.displayName || user?.email || 'Unknown User',
                timestamp: serverTimestamp(),
                userAgent: navigator?.userAgent || 'Unknown',
                ...metadata
            };

            await addDoc(collection(this.db, this.collectionPath), logEntry);

        } catch (error) {
            console.error('[AuditService] Failed to log action (sync):', error);
            throw error;
        }
    }

    /**
     * Fetch logs for the Audit Trail UI
     * 
     * @param {object} filters - Optional filters { actionType, userId, startDate, endDate }
     * @param {number} limitCount - Maximum number of logs to fetch
     * @returns {Promise<Array>} Array of log entries
     */
    async getLogs(filters = {}, limitCount = 100) {
        try {
            const logsRef = collection(this.db, this.collectionPath);
            let q;

            // Build query based on filters
            if (filters.actionType && filters.actionType !== 'ALL') {
                q = query(
                    logsRef,
                    where('actionType', '==', filters.actionType),
                    orderBy('timestamp', 'desc'),
                    limit(limitCount)
                );
            } else if (filters.userId) {
                q = query(
                    logsRef,
                    where('userId', '==', filters.userId),
                    orderBy('timestamp', 'desc'),
                    limit(limitCount)
                );
            } else {
                q = query(
                    logsRef,
                    orderBy('timestamp', 'desc'),
                    limit(limitCount)
                );
            }

            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Convert Firestore timestamp to JS Date safely
                timestamp: doc.data().timestamp?.toDate?.() || new Date()
            }));

        } catch (error) {
            console.error('[AuditService] Failed to fetch logs:', error);
            throw error;
        }
    }

    /**
     * Search logs by text (searches in details, userEmail, resource)
     * Note: This is client-side filtering, not ideal for large datasets
     * Consider implementing server-side search with Algolia or similar for production
     */
    async searchLogs(searchText, limitCount = 100) {
        const allLogs = await this.getLogs({}, limitCount);

        const searchLower = searchText.toLowerCase();
        return allLogs.filter(log => {
            return (
                log.userEmail?.toLowerCase().includes(searchLower) ||
                log.resource?.toLowerCase().includes(searchLower) ||
                log.details?.toLowerCase().includes(searchLower) ||
                log.actionType?.toLowerCase().includes(searchLower)
            );
        });
    }

    /**
     * Get statistics about audit logs
     */
    async getStatistics() {
        try {
            const logs = await this.getLogs({}, 1000); // Get last 1000 logs for stats

            const stats = {
                totalLogs: logs.length,
                byAction: {},
                byUser: {},
                lastHour: 0,
                lastDay: 0
            };

            const now = new Date();
            const oneHourAgo = new Date(now - 60 * 60 * 1000);
            const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

            logs.forEach(log => {
                // Count by action type
                stats.byAction[log.actionType] = (stats.byAction[log.actionType] || 0) + 1;

                // Count by user
                stats.byUser[log.userEmail] = (stats.byUser[log.userEmail] || 0) + 1;

                // Count recent activity
                if (log.timestamp >= oneHourAgo) stats.lastHour++;
                if (log.timestamp >= oneDayAgo) stats.lastDay++;
            });

            return stats;

        } catch (error) {
            console.error('[AuditService] Failed to get statistics:', error);
            return null;
        }
    }
}

export default AuditService;
