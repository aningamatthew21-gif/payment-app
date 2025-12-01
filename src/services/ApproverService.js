
import { collection, getDocs } from 'firebase/firestore';

/**
 * Fetches the list of users who can act as approvers from Firestore.
 * @param {object} db - The Firestore database instance.
 * @param {string} appId - The application ID for the Firestore path.
 * @returns {Promise<Array>} A promise that resolves to an array of approver objects.
 */
export const getApprovers = async (db, appId) => {
  console.log('ApproverService: Initiating fetch for approvers.');

  if (!db || !appId) {
    console.error('ApproverService: Firestore db instance or appId is not provided.');
    throw new Error('Firestore db instance or appId is required.');
  }

  try {
    // NOTE: The collection path 'users' is an assumption based on the PRD.
    // If your users are stored in a different collection, update this path.
    const usersCollectionRef = collection(db, `artifacts/${appId}/public/data/users`);
    console.log(`ApproverService: Fetching from collection: artifacts/${appId}/public/data/users`);

    const querySnapshot = await getDocs(usersCollectionRef);
    
    if (querySnapshot.empty) {
      console.warn('ApproverService: No users found in the collection.');
      return [];
    }

    const approvers = querySnapshot.docs.map(doc => {
      const data = doc.data();
      console.log(`ApproverService: Found user: ${data.name} (ID: ${doc.id})`);
      return {
        id: doc.id,
        name: data.name || 'Unnamed User',
        role: data.role || 'No Role Assigned',
      };
    });

    console.log(`ApproverService: Successfully fetched ${approvers.length} users.`);
    return approvers;

  } catch (error) {
    console.error('ApproverService: Error fetching approvers:', error);
    // Re-throw the error to be handled by the calling component
    throw error;
  }
};
