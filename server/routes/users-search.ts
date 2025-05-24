import express from 'express';
import { requireAdmin } from '../auth';
import { storage } from '../storage';
import { logger } from '../utils/logger';

const router = express.Router();

// Ensure all routes require admin authentication
router.use(requireAdmin);

// Search users by term (username, email, name)
router.get('/search', async (req, res) => {
  try {
    const { term } = req.query;
    
    if (!term || typeof term !== 'string' || term.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters'
      });
    }
    
    // Search for users by username, email, or fullName
    const searchTerm = term.toLowerCase();
    const users = await storage.getUsers();
    
    // Filter users based on the search term
    const filteredUsers = users.filter(user => {
      return (
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        (user.fullName && user.fullName.toLowerCase().includes(searchTerm))
      );
    }).map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus
    }));
    
    // Limit the results to prevent large responses
    const limitedResults = filteredUsers.slice(0, 10);
    
    return res.json({
      success: true,
      users: limitedResults
    });
  } catch (error) {
    logger.error('Error searching users:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

export default router;