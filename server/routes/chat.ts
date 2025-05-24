import express from 'express';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq, and, ne, asc, desc } from 'drizzle-orm';
import { authenticateUser } from '../middleware/auth';
import { isAdmin } from '../utils/role-utils';

const router = express.Router();

// Get available recipients for messages
// Normal users can only message admins
// Admins can message any user or user groups
router.get('/recipients', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.user?.id.toString();
    const isUserAdmin = isAdmin(req.user?.role);
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // For admins, return all users plus special recipient types
    if (isUserAdmin) {
      // Get all users except the current admin
      const allUsers = await db.select({
        id: users.id,
        name: users.fullName
      })
      .from(users)
      .where(ne(users.id, parseInt(currentUserId)))
      .orderBy(asc(users.fullName));
      
      // Format user IDs as strings for consistency
      const formattedUsers = allUsers.map(user => ({
        id: user.id.toString(),
        name: user.name || `User ${user.id}`
      }));
      
      // Add special recipient types
      const specialRecipients = [
        { id: 'all', name: 'All Users' },
        { id: 'registered', name: 'Paid Users' },
        { id: 'badge_holders', name: 'All Badge Holders' }
      ];
      
      return res.json([...specialRecipients, ...formattedUsers]);
    } else {
      // For regular users, they can only message admins
      return res.json([
        { id: 'admin', name: 'Admin Team' }
      ]);
    }
  } catch (error) {
    console.error('Error fetching recipients:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;