// Procurement Types Service - PERMANENTLY INTEGRATED
// This service provides CRUD operations for procurement types that are now permanently integrated

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

export class ProcurementTypesService {

  /**
   * Create a new procurement type with WHT rate
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} data - Procurement type data
   * @returns {Promise<string>} - Created procurement type ID
   */
  static async createProcurementType(db, appId, data) {
    try {
      console.log('[ProcurementTypesService] Creating procurement type:', data);

      // Validate required fields
      if (!data.name || !data.whtRate) {
        throw new Error('Procurement type name and WHT rate are required');
      }

      // Validate WHT rate (0-100%)
      if (data.whtRate < 0 || data.whtRate > 100) {
        throw new Error('WHT rate must be between 0 and 100');
      }

      // Check if procurement type name already exists
      const existingType = await this.getProcurementTypeByName(db, appId, data.name);
      if (existingType) {
        throw new Error(`Procurement type "${data.name}" already exists`);
      }

      const procurementType = {
        name: data.name.trim().toUpperCase(),
        whtRate: Number(data.whtRate) / 100, // Convert percentage to decimal
        description: data.description || '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: data.createdBy || 'system'
      };

      const docRef = await addDoc(
        collection(db, `artifacts/${appId}/public/data/procurementTypes`),
        procurementType
      );

      console.log('[ProcurementTypesService] ✓ Procurement type created:', docRef.id);
      return docRef.id;

    } catch (error) {
      console.error('[ProcurementTypesService] Error creating procurement type:', error);
      throw error;
    }
  }

  /**
   * Get all procurement types
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Array>} - Array of procurement types
   */
  static async getProcurementTypes(db, appId) {
    try {
      console.log('[ProcurementTypesService] Getting all procurement types');

      const q = query(
        collection(db, `artifacts/${appId}/public/data/procurementTypes`),
        where('isActive', '==', true),
        orderBy('name', 'asc')
      );

      const snapshot = await getDocs(q);
      const procurementTypes = [];

      snapshot.forEach(doc => {
        procurementTypes.push({
          id: doc.id,
          ...doc.data(),
          whtRatePercentage: (doc.data().whtRate * 100).toFixed(1) // Convert back to percentage for display
        });
      });

      console.log('[ProcurementTypesService] ✓ Retrieved procurement types:', procurementTypes.length);
      return procurementTypes;

    } catch (error) {
      console.error('[ProcurementTypesService] Error getting procurement types:', error);
      return [];
    }
  }

  /**
   * Get procurement type by name
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} name - Procurement type name
   * @returns {Promise<Object|null>} - Procurement type or null
   */
  static async getProcurementTypeByName(db, appId, name) {
    try {
      const q = query(
        collection(db, `artifacts/${appId}/public/data/procurementTypes`),
        where('name', '==', name.trim().toUpperCase()),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
        whtRatePercentage: (doc.data().whtRate * 100).toFixed(1)
      };

    } catch (error) {
      console.error('[ProcurementTypesService] Error getting procurement type by name:', error);
      return null;
    }
  }

  /**
   * Get procurement type by ID
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} id - Procurement type ID
   * @returns {Promise<Object|null>} - Procurement type or null
   */
  static async getProcurementTypeById(db, appId, id) {
    try {
      const docRef = doc(db, `artifacts/${appId}/public/data/procurementTypes`, id);
      const docSnap = await getDocs(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        whtRatePercentage: (data.whtRate * 100).toFixed(1)
      };

    } catch (error) {
      console.error('[ProcurementTypesService] Error getting procurement type by ID:', error);
      return null;
    }
  }

  /**
   * Update procurement type
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} id - Procurement type ID
   * @param {Object} data - Updated data
   * @returns {Promise<void>}
   */
  static async updateProcurementType(db, appId, id, data) {
    try {
      console.log('[ProcurementTypesService] Updating procurement type:', id, data);

      // Validate WHT rate if provided
      if (data.whtRate !== undefined) {
        if (data.whtRate < 0 || data.whtRate > 100) {
          throw new Error('WHT rate must be between 0 and 100');
        }
        data.whtRate = Number(data.whtRate) / 100; // Convert percentage to decimal
      }

      // Check name uniqueness if name is being updated
      if (data.name) {
        const existingType = await this.getProcurementTypeByName(db, appId, data.name);
        if (existingType && existingType.id !== id) {
          throw new Error(`Procurement type "${data.name}" already exists`);
        }
        data.name = data.name.trim().toUpperCase();
      }

      const updateData = {
        ...data,
        updatedAt: serverTimestamp()
      };

      const docRef = doc(db, `artifacts/${appId}/public/data/procurementTypes`, id);
      await updateDoc(docRef, updateData);

      console.log('[ProcurementTypesService] ✓ Procurement type updated:', id);

    } catch (error) {
      console.error('[ProcurementTypesService] Error updating procurement type:', error);
      throw error;
    }
  }

  /**
   * Delete procurement type (soft delete)
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} id - Procurement type ID
   * @returns {Promise<void>}
   */
  static async deleteProcurementType(db, appId, id) {
    try {
      console.log('[ProcurementTypesService] Deleting procurement type:', id);

      // Soft delete - mark as inactive instead of removing
      const docRef = doc(db, `artifacts/${appId}/public/data/procurementTypes`, id);
      await updateDoc(docRef, {
        isActive: false,
        updatedAt: serverTimestamp()
      });

      console.log('[ProcurementTypesService] ✓ Procurement type deleted (soft delete):', id);

    } catch (error) {
      console.error('[ProcurementTypesService] Error deleting procurement type:', error);
      throw error;
    }
  }

  /**
   * Get WHT rate for a procurement type
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number>} - WHT rate as decimal (e.g., 0.075 for 7.5%)
   */
  static async getWHTRate(db, appId, procurementType) {
    try {
      if (!procurementType) {
        return 0;
      }

      // 1. Try exact match first
      let typeData = await this.getProcurementTypeByName(db, appId, procurementType);
      if (typeData && typeData.isActive) {
        return typeData.whtRate;
      }

      // 2. Fuzzy Match Strategy (Singular/Plural) - SPECIFIC TO PROCUREMENT TYPES
      // If exact match failed, try to handle common singular/plural mismatches
      const upperType = procurementType.toUpperCase().trim();
      let fuzzyType = null;

      if (upperType.endsWith('S')) {
        // Try removing 'S' (e.g., SERVICES -> SERVICE)
        fuzzyType = upperType.slice(0, -1);
      } else {
        // Try adding 'S' (e.g., SERVICE -> SERVICES)
        fuzzyType = upperType + 'S';
      }

      console.log(`[ProcurementTypesService] Exact match failed for "${procurementType}". Trying fuzzy match: "${fuzzyType}"`);

      typeData = await this.getProcurementTypeByName(db, appId, fuzzyType);
      if (typeData && typeData.isActive) {
        console.log(`[ProcurementTypesService] Fuzzy match successful: "${procurementType}" -> "${fuzzyType}"`);
        return typeData.whtRate;
      }

      // Return 0 if procurement type not found or inactive
      console.warn(`[ProcurementTypesService] No WHT rate found for "${procurementType}" (including fuzzy match)`);
      return 0;

    } catch (error) {
      console.error('[ProcurementTypesService] Error getting WHT rate:', error);
      return 0;
    }
  }
  static async seedDefaultProcurementTypes(db, appId) {
    try {
      console.log('[ProcurementTypesService] Seeding default procurement types');

      const defaultTypes = [
        { name: 'SERVICES', whtRate: 7.5, description: 'Services procurement with 7.5% WHT' },
        { name: 'FLAT RATE', whtRate: 4.0, description: 'Flat rate procurement with 4% WHT' },
        { name: 'GOODS', whtRate: 3.0, description: 'Goods procurement with 3% WHT' },
        { name: 'WORKS', whtRate: 5.0, description: 'Works procurement with 5% WHT' }
      ];

      let createdCount = 0;
      let skippedCount = 0;

      for (const typeData of defaultTypes) {
        try {
          // Check if already exists
          const existingType = await this.getProcurementTypeByName(db, appId, typeData.name);
          if (existingType) {
            console.log(`[ProcurementTypesService] Skipping existing type: ${typeData.name}`);
            skippedCount++;
            continue;
          }

          // Create new type
          await this.createProcurementType(db, appId, {
            ...typeData,
            createdBy: 'system_seed'
          });
          createdCount++;

        } catch (error) {
          console.error(`[ProcurementTypesService] Error seeding type ${typeData.name}:`, error);
        }
      }

      console.log(`[ProcurementTypesService] ✓ Seeding completed: ${createdCount} created, ${skippedCount} skipped`);

      return {
        success: true,
        createdCount,
        skippedCount,
        totalProcessed: defaultTypes.length
      };

    } catch (error) {
      console.error('[ProcurementTypesService] Error seeding default types:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
