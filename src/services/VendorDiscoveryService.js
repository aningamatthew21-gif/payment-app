// VendorDiscoveryService - Handles automatic vendor discovery and validation management
// This service automatically identifies and adds new vendors from imported data and user input

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  orderBy,
  updateDoc
} from 'firebase/firestore';

class VendorDiscoveryService {
  constructor(db, appId) {
    this.db = db;
    this.appId = appId;
    this.validationCollection = `artifacts/${appId}/public/data/validation`;
  }

  /**
   * Discover new vendors from imported payment data
   * @param {Array} importedPayments - Array of payment objects with vendor field
   * @param {Array} existingVendors - Current validation data vendors array
   * @returns {Array} Array of new vendor names that need to be added
   */
  async discoverNewVendors(importedPayments, existingVendors) {
    try {
      console.log('[VendorDiscoveryService] Starting vendor discovery...');
      console.log('[VendorDiscoveryService] Existing vendors:', existingVendors.length);
      console.log('[VendorDiscoveryService] Imported payments:', importedPayments.length);

      // Create a set of existing vendor names for fast lookup
      const existingVendorNames = new Set(
        existingVendors.map(vendor => vendor.value.toLowerCase().trim())
      );

      // Scan imported payments for new vendors
      const newVendors = [];
      const vendorCounts = new Map(); // Track frequency of each vendor

      importedPayments.forEach((payment, index) => {
        if (payment.vendor && typeof payment.vendor === 'string') {
          const vendorName = payment.vendor.trim();
          
          if (vendorName && !existingVendorNames.has(vendorName.toLowerCase())) {
            // Count occurrences of this vendor
            vendorCounts.set(vendorName, (vendorCounts.get(vendorName) || 0) + 1);
            
            // Add to new vendors list if not already there
            if (!newVendors.includes(vendorName)) {
              newVendors.push(vendorName);
              console.log(`[VendorDiscoveryService] New vendor discovered: "${vendorName}"`);
            }
          }
        }
      });

      console.log('[VendorDiscoveryService] Discovery complete:', {
        newVendorsFound: newVendors.length,
        newVendors: newVendors,
        vendorFrequency: Object.fromEntries(vendorCounts)
      });

      return {
        newVendors,
        vendorCounts: Object.fromEntries(vendorCounts),
        totalNewVendors: newVendors.length
      };

    } catch (error) {
      console.error('[VendorDiscoveryService] Error during vendor discovery:', error);
      throw new Error(`Vendor discovery failed: ${error.message}`);
    }
  }

  /**
   * Automatically add new vendors to the validation database
   * @param {Array} newVendors - Array of vendor names to add
   * @returns {Object} Result of the auto-addition operation
   */
  async autoAddVendors(newVendors) {
    if (!this.db || !newVendors || newVendors.length === 0) {
      console.log('[VendorDiscoveryService] No vendors to add or missing database connection');
      return { success: false, message: 'No vendors to add or missing database connection' };
    }

    try {
      console.log('[VendorDiscoveryService] Starting auto-addition of vendors:', newVendors);
      
      const validationRef = collection(this.db, this.validationCollection);
      const addedVendors = [];
      const errors = [];

      // Add each new vendor to the validation database
      for (const vendorName of newVendors) {
        try {
          const vendorData = {
            field: 'vendors',
            value: vendorName.trim(),
            description: `Auto-discovered vendor from import/transaction`,
            isActive: true,
            source: 'auto_discovered',
            discoveredAt: new Date().toISOString(),
            usageCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const docRef = await addDoc(validationRef, vendorData);
          
          addedVendors.push({
            id: docRef.id,
            name: vendorName,
            data: vendorData
          });

          console.log(`[VendorDiscoveryService] Successfully added vendor: "${vendorName}" with ID: ${docRef.id}`);

        } catch (error) {
          console.error(`[VendorDiscoveryService] Failed to add vendor "${vendorName}":`, error);
          errors.push({
            vendor: vendorName,
            error: error.message
          });
        }
      }

      const result = {
        success: addedVendors.length > 0,
        addedVendors,
        errors,
        summary: {
          totalRequested: newVendors.length,
          successfullyAdded: addedVendors.length,
          failed: errors.length
        }
      };

      console.log('[VendorDiscoveryService] Auto-addition complete:', result.summary);
      return result;

    } catch (error) {
      console.error('[VendorDiscoveryService] Error during auto-addition:', error);
      throw new Error(`Auto-addition of vendors failed: ${error.message}`);
    }
  }

  /**
   * Check if a vendor name already exists in the validation system
   * @param {string} vendorName - Vendor name to check
   * @param {Array} existingVendors - Current validation data vendors array
   * @returns {Object} Validation result with vendor info if found
   */
  validateVendor(vendorName, existingVendors) {
    if (!vendorName || typeof vendorName !== 'string') {
      return { isValid: false, message: 'Invalid vendor name' };
    }

    const trimmedName = vendorName.trim();
    
    if (trimmedName.length === 0) {
      return { isValid: false, message: 'Vendor name cannot be empty' };
    }

    if (trimmedName.length > 100) {
      return { isValid: false, message: 'Vendor name too long (max 100 characters)' };
    }

    // Check if vendor already exists (case-insensitive)
    const existingVendor = existingVendors.find(vendor => 
      vendor.value.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingVendor) {
      return {
        isValid: true,
        isExisting: true,
        vendor: existingVendor,
        message: 'Vendor already exists in validation system'
      };
    }

    return {
      isValid: true,
      isExisting: false,
      vendor: null,
      message: 'New vendor - will be added to validation system'
    };
  }

  /**
   * Get vendor suggestions based on partial input
   * @param {string} partialName - Partial vendor name
   * @param {Array} existingVendors - Current validation data vendors array
   * @param {number} maxSuggestions - Maximum number of suggestions to return
   * @returns {Array} Array of vendor suggestions
   */
  getVendorSuggestions(partialName, existingVendors, maxSuggestions = 10) {
    if (!partialName || partialName.trim().length === 0) {
      return existingVendors.slice(0, maxSuggestions);
    }

    const searchTerm = partialName.toLowerCase().trim();
    
    // Filter vendors that match the partial name
    const suggestions = existingVendors
      .filter(vendor => 
        vendor.value.toLowerCase().includes(searchTerm) &&
        vendor.isActive !== false
      )
      .sort((a, b) => {
        // Prioritize exact matches and matches at the beginning
        const aStartsWith = a.value.toLowerCase().startsWith(searchTerm);
        const bStartsWith = b.value.toLowerCase().startsWith(searchTerm);
        
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        // Then sort by length (shorter names first)
        return a.value.length - b.value.length;
      })
      .slice(0, maxSuggestions);

    return suggestions;
  }

  /**
   * Update vendor usage count when vendor is used in a transaction
   * @param {string} vendorName - Vendor name to update
   * @returns {Promise<boolean>} Success status
   */
  async updateVendorUsage(vendorName) {
    if (!this.db || !vendorName) return false;

    try {
      const validationRef = collection(this.db, this.validationCollection);
      const vendorQuery = query(
        validationRef,
        where('field', '==', 'vendors'),
        where('value', '==', vendorName.trim())
      );

      const querySnapshot = await getDocs(vendorQuery);
      
      if (!querySnapshot.empty) {
        const vendorDoc = querySnapshot.docs[0];
        const currentData = vendorDoc.data();
        
        // Update usage count and last used timestamp
        await updateDoc(vendorDoc.ref, {
          usageCount: (currentData.usageCount || 0) + 1,
          lastUsedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        console.log(`[VendorDiscoveryService] Updated usage count for vendor: "${vendorName}"`);
        return true;
      }

      return false;

    } catch (error) {
      console.error(`[VendorDiscoveryService] Error updating vendor usage for "${vendorName}":`, error);
      return false;
    }
  }
}

export default VendorDiscoveryService;
