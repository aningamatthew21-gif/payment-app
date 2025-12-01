// Budget Real-Time Service
// Provides optimized real-time updates for budget management with selective listening and caching

import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit 
} from 'firebase/firestore';

/**
 * Budget Real-Time Service
 * Manages optimized real-time listeners for budget data with caching and selective updates
 */
export class BudgetRealTimeService {
  
  // Cache for budget data
  static budgetCache = new Map();
  static listeners = new Map();
  static isInitialized = false;
  static initializationCount = 0; // Track how many times the service has been initialized
  static subscribers = new Map();

  /**
   * Initialize the real-time service
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<void>}
   */
  static async initialize(db, appId) {
    this.initializationCount++;
    
    if (this.isInitialized) {
      console.log(`[BudgetRealTimeService] Already initialized (count: ${this.initializationCount})`);
      return;
    }

    try {
      console.log(`[BudgetRealTimeService] Initializing real-time service (count: ${this.initializationCount})...`);
      
      // Clear existing cache and listeners only if this is the first initialization
      if (this.initializationCount === 1) {
        this.budgetCache.clear();
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners.clear();
        this.subscribers.clear();
      }

      // Set up main budget lines listener with optimization
      await this.setupBudgetLinesListener(db, appId);
      
      this.isInitialized = true;
      console.log(`[BudgetRealTimeService] Real-time service initialized successfully (count: ${this.initializationCount})`);
      
    } catch (error) {
      this.initializationCount--; // Decrement on error
      console.error('[BudgetRealTimeService] Error initializing real-time service:', error);
      throw error;
    }
  }

  /**
   * Set up optimized budget lines listener
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<void>}
   */
  static async setupBudgetLinesListener(db, appId) {
    try {
      const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      
      // ✅ OPTIMIZED: Only listen to active budget lines with ordering
      const budgetQuery = query(
        budgetRef,
        where('isActive', '!=', false), // Only active budget lines
        orderBy('name'), // Order by name for consistent updates
        limit(100) // Limit to prevent performance issues
      );

      console.log('[BudgetRealTimeService] Setting up optimized budget lines listener...');

      const unsubscribe = onSnapshot(budgetQuery, (snapshot) => {
        console.log('[BudgetRealTimeService] Budget lines update received:', snapshot.docs.length, 'budget lines');
        
        const changes = {
          added: [],
          modified: [],
          removed: []
        };

        snapshot.docChanges().forEach((change) => {
          const budgetLine = {
            id: change.doc.id,
            ...change.doc.data()
          };

          switch (change.type) {
            case 'added':
              changes.added.push(budgetLine);
              this.budgetCache.set(change.doc.id, budgetLine);
              break;
            case 'modified':
              changes.modified.push(budgetLine);
              this.budgetCache.set(change.doc.id, budgetLine);
              break;
            case 'removed':
              changes.removed.push(change.doc.id);
              this.budgetCache.delete(change.doc.id);
              break;
          }
        });

        // Emit change event for subscribers
        this.emitBudgetChange('budgetLines', changes);
        
        console.log('[BudgetRealTimeService] Budget changes processed:', {
          added: changes.added.length,
          modified: changes.modified.length,
          removed: changes.removed.length
        });

      }, (error) => {
        console.error('[BudgetRealTimeService] Budget lines listener error:', error);
        this.emitBudgetChange('error', { error });
      });

      // Store listener for cleanup
      this.listeners.set('budgetLines', unsubscribe);

    } catch (error) {
      console.error('[BudgetRealTimeService] Error setting up budget lines listener:', error);
      throw error;
    }
  }

  /**
   * Set up selective listener for specific budget line
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID to listen to
   * @returns {Promise<void>}
   */
  static async setupBudgetLineListener(db, appId, budgetLineId) {
    try {
      const budgetRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetLineId);
      
      console.log(`[BudgetRealTimeService] Setting up selective listener for budget line: ${budgetLineId}`);

      const unsubscribe = onSnapshot(budgetRef, (doc) => {
        if (doc.exists()) {
          const budgetLine = {
            id: doc.id,
            ...doc.data()
          };

          this.budgetCache.set(doc.id, budgetLine);
          this.emitBudgetChange('budgetLine', { budgetLineId, budgetLine });
          
          console.log(`[BudgetRealTimeService] Budget line ${budgetLineId} updated:`, budgetLine);
        } else {
          this.budgetCache.delete(budgetLineId);
          this.emitBudgetChange('budgetLineRemoved', { budgetLineId });
          
          console.log(`[BudgetRealTimeService] Budget line ${budgetLineId} removed`);
        }
      }, (error) => {
        console.error(`[BudgetRealTimeService] Budget line ${budgetLineId} listener error:`, error);
        this.emitBudgetChange('error', { error, budgetLineId });
      });

      // Store listener for cleanup
      this.listeners.set(`budgetLine_${budgetLineId}`, unsubscribe);

    } catch (error) {
      console.error(`[BudgetRealTimeService] Error setting up budget line listener for ${budgetLineId}:`, error);
      throw error;
    }
  }

  /**
   * Set up listener for budget lines by department
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} deptCode - Department code to filter by
   * @returns {Promise<void>}
   */
  static async setupDepartmentBudgetListener(db, appId, deptCode) {
    try {
      const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      
      // ✅ OPTIMIZED: Filter by department with ordering
      const deptQuery = query(
        budgetRef,
        where('deptCode', '==', deptCode),
        where('isActive', '!=', false),
        orderBy('name')
      );

      console.log(`[BudgetRealTimeService] Setting up department budget listener for: ${deptCode}`);

      const unsubscribe = onSnapshot(deptQuery, (snapshot) => {
        console.log(`[BudgetRealTimeService] Department ${deptCode} update received:`, snapshot.docs.length, 'budget lines');
        
        const departmentBudgets = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Update cache for department budgets
        departmentBudgets.forEach(budget => {
          this.budgetCache.set(budget.id, budget);
        });

        this.emitBudgetChange('departmentBudgets', { deptCode, budgets: departmentBudgets });
        
        console.log(`[BudgetRealTimeService] Department ${deptCode} budgets updated:`, departmentBudgets.length);

      }, (error) => {
        console.error(`[BudgetRealTimeService] Department ${deptCode} listener error:`, error);
        this.emitBudgetChange('error', { error, deptCode });
      });

      // Store listener for cleanup
      this.listeners.set(`department_${deptCode}`, unsubscribe);

    } catch (error) {
      console.error(`[BudgetRealTimeService] Error setting up department budget listener for ${deptCode}:`, error);
      throw error;
    }
  }

  /**
   * Get cached budget data
   * @param {string} budgetLineId - Budget line ID
   * @returns {Object|null} Cached budget line data
   */
  static getCachedBudgetLine(budgetLineId) {
    return this.budgetCache.get(budgetLineId) || null;
  }

  /**
   * Get all cached budget lines
   * @returns {Array} Array of cached budget lines
   */
  static getAllCachedBudgetLines() {
    return Array.from(this.budgetCache.values());
  }

  /**
   * Get cached budget lines by department
   * @param {string} deptCode - Department code
   * @returns {Array} Array of cached budget lines for department
   */
  static getCachedBudgetLinesByDepartment(deptCode) {
    return Array.from(this.budgetCache.values())
      .filter(budget => budget.deptCode === deptCode);
  }

  /**
   * Subscribe to budget changes
   * @param {string} eventType - Type of event to listen for
   * @param {Function} callback - Callback function to execute
   * @returns {Function} Unsubscribe function
   */
  static subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType).add(callback);

    // Return unsubscribe function
    return () => {
      const eventSubscribers = this.subscribers.get(eventType);
      if (eventSubscribers) {
        eventSubscribers.delete(callback);
        if (eventSubscribers.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  /**
   * Emit budget change event
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   */
  static emitBudgetChange(eventType, data) {
    if (!this.subscribers.has(eventType)) {
      return;
    }

    this.subscribers.get(eventType).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[BudgetRealTimeService] Error in ${eventType} callback:`, error);
      }
    });
  }

  /**
   * Unsubscribe from specific budget line listener
   * @param {string} budgetLineId - Budget line ID
   */
  static unsubscribeFromBudgetLine(budgetLineId) {
    const listenerKey = `budgetLine_${budgetLineId}`;
    const unsubscribe = this.listeners.get(listenerKey);
    
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(listenerKey);
      console.log(`[BudgetRealTimeService] Unsubscribed from budget line: ${budgetLineId}`);
    }
  }

  /**
   * Unsubscribe from department budget listener
   * @param {string} deptCode - Department code
   */
  static unsubscribeFromDepartment(deptCode) {
    const listenerKey = `department_${deptCode}`;
    const unsubscribe = this.listeners.get(listenerKey);
    
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(listenerKey);
      console.log(`[BudgetRealTimeService] Unsubscribed from department: ${deptCode}`);
    }
  }

  /**
   * Cleanup all listeners and cache
   * @param {boolean} force - Force cleanup even if there are active initializations
   */
  static cleanup(force = false) {
    this.initializationCount--;
    
    console.log(`[BudgetRealTimeService] Cleanup requested (count: ${this.initializationCount}, force: ${force})`);
    
    // Only cleanup if this is the last initialization or if forced
    if (this.initializationCount > 0 && !force) {
      console.log('[BudgetRealTimeService] Skipping cleanup - other initializations still active');
      return;
    }
    
    console.log('[BudgetRealTimeService] Performing full cleanup...');
    
    // Unsubscribe from all listeners
    this.listeners.forEach((unsubscribe, key) => {
      try {
        unsubscribe();
        console.log(`[BudgetRealTimeService] Unsubscribed from: ${key}`);
      } catch (error) {
        console.error(`[BudgetRealTimeService] Error unsubscribing from ${key}:`, error);
      }
    });
    
    // Clear cache and listeners
    this.budgetCache.clear();
    this.listeners.clear();
    this.subscribers.clear();
    this.isInitialized = false;
    this.initializationCount = 0;
    
    console.log('[BudgetRealTimeService] Cleanup completed');
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  static getStatus() {
    return {
      isInitialized: this.isInitialized,
      initializationCount: this.initializationCount,
      cacheSize: this.budgetCache.size,
      activeListeners: this.listeners.size,
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }

  /**
   * Preload budget data for better performance
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<void>}
   */
  static async preloadBudgetData(db, appId) {
    try {
      console.log('[BudgetRealTimeService] Preloading budget data...');
      
      const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const { getDocs, query, where, orderBy, limit } = await import('firebase/firestore');
      
      const budgetQuery = query(
        budgetRef,
        where('isActive', '!=', false),
        orderBy('name'),
        limit(50) // Preload first 50 budget lines
      );

      const snapshot = await getDocs(budgetQuery);
      
      snapshot.docs.forEach(doc => {
        const budgetLine = {
          id: doc.id,
          ...doc.data()
        };
        this.budgetCache.set(doc.id, budgetLine);
      });

      console.log(`[BudgetRealTimeService] Preloaded ${snapshot.docs.length} budget lines`);
      
    } catch (error) {
      console.error('[BudgetRealTimeService] Error preloading budget data:', error);
      throw error;
    }
  }
}
