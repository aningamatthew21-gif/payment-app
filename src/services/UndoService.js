import { collection, addDoc, updateDoc, doc, getDoc, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';

/**
 * Undo Service
 * Handles undo/rollback functionality for payment finalization operations
 * Captures original state and provides rollback capabilities
 */
class UndoService {
  /**
   * Create an undo log entry for a batch operation
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} undoData - Data to be stored for undo
   * @returns {Promise<string>} Undo log entry ID
   */
  static async createUndoLogEntry(db, appId, undoData) {
    try {
      console.log('[UndoService] Creating undo log entry for batch:', undoData.batchId);
      
      const undoLogEntry = {
        ...undoData,
        createdAt: serverTimestamp(),
        status: 'pending',
        canUndo: true
      };
      
      // Try primary collection first
      let docRef;
      try {
        docRef = await addDoc(collection(db, `artifacts/${appId}/undoLog`), undoLogEntry);
        console.log('[UndoService] Undo log entry created in primary collection:', docRef.id);
      } catch (error) {
        if (error.code === 'permission-denied') {
          // Fallback to public data path
          docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/undoLog`), undoLogEntry);
          console.log('[UndoService] Undo log entry created in fallback collection:', docRef.id);
        } else {
          throw error;
        }
      }
      
      return docRef.id;
      
    } catch (error) {
      console.error('[UndoService] Error creating undo log entry:', error);
      throw new Error(`Failed to create undo log entry: ${error.message}`);
    }
  }
  
  /**
   * Update an existing undo log entry
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} undoLogId - Undo log entry ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<void>}
   */
  static async updateUndoLogEntry(db, appId, undoLogId, updates) {
    try {
      console.log('[UndoService] Updating undo log entry:', undoLogId);
      
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };
      
      // Try primary collection first
      try {
        const docRef = doc(db, `artifacts/${appId}/undoLog`, undoLogId);
        await updateDoc(docRef, updateData);
        console.log('[UndoService] Undo log entry updated in primary collection');
      } catch (error) {
        if (error.code === 'permission-denied') {
          // Fallback to public data path
          const docRef = doc(db, `artifacts/${appId}/public/data/undoLog`, undoLogId);
          await updateDoc(docRef, updateData);
          console.log('[UndoService] Undo log entry updated in fallback collection');
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      console.error('[UndoService] Error updating undo log entry:', error);
      throw new Error(`Failed to update undo log entry: ${error.message}`);
    }
  }
  
  /**
   * Get undo log entry by ID
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} undoLogId - Undo log entry ID
   * @returns {Promise<Object>} Undo log entry data
   */
  static async getUndoLogEntry(db, appId, undoLogId) {
    try {
      console.log('[UndoService] Getting undo log entry:', undoLogId);
      
      // Try primary collection first
      try {
        const docRef = doc(db, `artifacts/${appId}/undoLog`, undoLogId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() };
        }
      } catch (error) {
        if (error.code === 'permission-denied') {
          // Fallback to public data path
          const docRef = doc(db, `artifacts/${appId}/public/data/undoLog`, undoLogId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
          }
        } else {
          throw error;
        }
      }
      
      throw new Error('Undo log entry not found');
      
    } catch (error) {
      console.error('[UndoService] Error getting undo log entry:', error);
      throw new Error(`Failed to get undo log entry: ${error.message}`);
    }
  }
  
  /**
   * Get recent undo log entries
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {number} limit - Maximum number of entries to return
   * @returns {Promise<Array>} Array of undo log entries
   */
  static async getRecentUndoLogEntries(db, appId, limitCount = 10) {
    try {
      console.log('[UndoService] Getting recent undo log entries, limit:', limitCount);
      
      // Try primary collection first
      try {
        const q = query(
          collection(db, `artifacts/${appId}/undoLog`),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
        
        const snapshot = await getDocs(q);
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`[UndoService] Retrieved ${entries.length} entries from primary collection`);
        return entries;
        
      } catch (error) {
        if (error.code === 'permission-denied') {
          // Fallback to public data path
          const q = query(
            collection(db, `artifacts/${appId}/public/data/undoLog`),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
          
          const snapshot = await getDocs(q);
          const entries = [];
          snapshot.forEach(doc => {
            entries.push({ id: doc.id, ...doc.data() });
          });
          
          console.log(`[UndoService] Retrieved ${entries.length} entries from fallback collection`);
          return entries;
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      console.error('[UndoService] Error getting recent undo log entries:', error);
      throw new Error(`Failed to get recent undo log entries: ${error.message}`);
    }
  }
  
  /**
   * Mark an undo log entry as completed
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} undoLogId - Undo log entry ID
   * @param {Object} completionData - Additional completion data
   * @returns {Promise<void>}
   */
  static async markUndoLogCompleted(db, appId, undoLogId, completionData = {}) {
    try {
      console.log('[UndoService] Marking undo log entry as completed:', undoLogId);
      
      const updateData = {
        status: 'completed',
        completedAt: serverTimestamp(),
        canUndo: false,
        ...completionData
      };
      
      await this.updateUndoLogEntry(db, appId, undoLogId, updateData);
      console.log('[UndoService] Undo log entry marked as completed');
      
    } catch (error) {
      console.error('[UndoService] Error marking undo log entry as completed:', error);
      throw new Error(`Failed to mark undo log entry as completed: ${error.message}`);
    }
  }
  
  /**
   * Mark an undo log entry as undone
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} undoLogId - Undo log entry ID
   * @param {Object} undoData - Undo operation data
   * @returns {Promise<void>}
   */
  static async markUndoLogUndone(db, appId, undoLogId, undoData = {}) {
    try {
      console.log('[UndoService] Marking undo log entry as undone:', undoLogId);
      
      const updateData = {
        status: 'undone',
        undoneAt: serverTimestamp(),
        canUndo: false,
        undoOperation: undoData
      };
      
      await this.updateUndoLogEntry(db, appId, undoLogId, updateData);
      console.log('[UndoService] Undo log entry marked as undone');
      
    } catch (error) {
      console.error('[UndoService] Error marking undo log entry as undone:', error);
      throw new Error(`Failed to mark undo log entry as undone: ${error.message}`);
    }
  }
  
  /**
   * Check if an undo log entry can be undone
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} undoLogId - Undo log entry ID
   * @returns {Promise<boolean>} Whether the entry can be undone
   */
  static async canUndo(db, appId, undoLogId) {
    try {
      const entry = await this.getUndoLogEntry(db, appId, undoLogId);
      return entry.canUndo === true && entry.status === 'completed';
    } catch (error) {
      console.error('[UndoService] Error checking if can undo:', error);
      return false;
    }
  }
  
  /**
   * Clean up old undo log entries
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {number} daysToKeep - Number of days to keep entries
   * @returns {Promise<number>} Number of entries cleaned up
   */
  static async cleanupOldUndoLogEntries(db, appId, daysToKeep = 30) {
    try {
      console.log(`[UndoService] Cleaning up undo log entries older than ${daysToKeep} days`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      // This is a simplified cleanup - in production you might want to use a Cloud Function
      // or scheduled job for this operation
      console.log('[UndoService] Cleanup completed (simplified implementation)');
      return 0;
      
    } catch (error) {
      console.error('[UndoService] Error cleaning up old undo log entries:', error);
      throw new Error(`Failed to cleanup old undo log entries: ${error.message}`);
    }
  }
  
  /**
   * Get undo statistics
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} Undo statistics
   */
  static async getUndoStatistics(db, appId) {
    try {
      console.log('[UndoService] Getting undo statistics');
      
      const recentEntries = await this.getRecentUndoLogEntries(db, appId, 100);
      
      const stats = {
        totalEntries: recentEntries.length,
        pendingEntries: 0,
        completedEntries: 0,
        undoneEntries: 0,
        canUndoCount: 0,
        averageBatchSize: 0
      };
      
      let totalBatchSize = 0;
      
      recentEntries.forEach(entry => {
        switch (entry.status) {
          case 'pending':
            stats.pendingEntries++;
            break;
          case 'completed':
            stats.completedEntries++;
            if (entry.canUndo) stats.canUndoCount++;
            break;
          case 'undone':
            stats.undoneEntries++;
            break;
        }
        
        if (entry.payments && Array.isArray(entry.payments)) {
          totalBatchSize += entry.payments.length;
        }
      });
      
      if (stats.completedEntries > 0) {
        stats.averageBatchSize = Math.round(totalBatchSize / stats.completedEntries);
      }
      
      return stats;
      
    } catch (error) {
      console.error('[UndoService] Error getting undo statistics:', error);
      throw new Error(`Failed to get undo statistics: ${error.message}`);
    }
  }
}

export { UndoService };