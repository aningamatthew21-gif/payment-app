import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

// Mock Data for initial development/fallback
const MOCK_VENDORS = [
    {
        id: 'ven_001',
        name: 'ACME CORP LTD',
        email: 'finance@acmecorp.com',
        status: 'active',
        banking: {
            bankName: 'GT Bank',
            branchCode: '01',
            accountName: 'ACME CORP OPERATIONS',
            accountNumber: '144100223399'
        }
    },
    {
        id: 'ven_002',
        name: 'DHL LOGISTICS GHANA',
        email: 'billing@dhl.com.gh',
        status: 'active',
        banking: {
            bankName: 'Ecobank',
            branchCode: '05',
            accountName: 'DHL LOGISTICS',
            accountNumber: '0022114455'
        }
    },
    {
        id: 'ven_003',
        name: 'Z-CONSTRUCTION WORKS',
        email: 'accounts@z-const.com',
        status: 'inactive',
        banking: {
            bankName: 'Fidelity Bank',
            branchCode: '12',
            accountName: 'Z-CONSTRUCTION',
            accountNumber: '8885552211'
        }
    },
    {
        id: 'ven_004',
        name: 'OFFICE SUPPLIES DEPOT',
        email: 'sales@officesupplies.com',
        status: 'active',
        banking: {
            bankName: 'Stanbic Bank',
            branchCode: '03',
            accountName: 'OFFICE SUPPLIES DEPOT LTD',
            accountNumber: '9011223344'
        }
    },
    {
        id: 'ven_005',
        name: 'CLEANING SERVICES PRO',
        email: 'info@cleanpro.com',
        status: 'active',
        banking: {
            bankName: 'Absa Bank',
            branchCode: '08',
            accountName: 'CLEANING SERVICES PRO',
            accountNumber: '1122334455'
        }
    }
];

export const VendorService = {
    // Get all vendors (Mock + Firestore placeholder)
    getAllVendors: async (db, appId) => {
        try {
            // TODO: Connect to Firestore when ready
            // const vendorsRef = collection(db, `artifacts/${appId}/public/data/vendors`);
            // const q = query(vendorsRef, orderBy('name'));
            // const snapshot = await getDocs(q);
            // return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Return Mock Data for UI Build
            return new Promise(resolve => setTimeout(() => resolve(MOCK_VENDORS), 500));
        } catch (error) {
            console.error("Error fetching vendors:", error);
            return [];
        }
    },

    // Add a new vendor
    addVendor: async (db, appId, vendorData) => {
        try {
            console.log("Adding vendor:", vendorData);
            // const vendorsRef = collection(db, `artifacts/${appId}/public/data/vendors`);
            // const docRef = await addDoc(vendorsRef, vendorData);
            // return { id: docRef.id, ...vendorData };

            return { id: `ven_${Date.now()}`, ...vendorData };
        } catch (error) {
            console.error("Error adding vendor:", error);
            throw error;
        }
    },

    // Update a vendor
    updateVendor: async (db, appId, vendorId, updates) => {
        try {
            console.log("Updating vendor:", vendorId, updates);
            // const vendorRef = doc(db, `artifacts/${appId}/public/data/vendors`, vendorId);
            // await updateDoc(vendorRef, updates);
            return { id: vendorId, ...updates };
        } catch (error) {
            console.error("Error updating vendor:", error);
            throw error;
        }
    },

    // Generate Excel Template
    generateExcelTemplate: () => {
        const headers = ['Vendor Name', 'Contact Email', 'Bank Name', 'Branch Code', 'Account Name', 'Account Number', 'Status'];
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "vendor_import_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Parse Import File (Mock)
    parseImportFile: async (file) => {
        return new Promise((resolve) => {
            console.log("Parsing file:", file.name);
            // Mock parsed data
            setTimeout(() => {
                resolve([
                    {
                        name: 'NEW IMPORTED VENDOR',
                        email: 'new@vendor.com',
                        status: 'active',
                        banking: {
                            bankName: 'CalBank',
                            branchCode: '20',
                            accountName: 'NEW IMPORTED VENDOR',
                            accountNumber: '1234567890'
                        }
                    }
                ]);
            }, 1000);
        });
    }
};
