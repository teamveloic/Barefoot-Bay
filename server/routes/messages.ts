import express from 'express';
import multer from 'multer';
import { db } from '../db';
import { users } from '../../shared/schema';
import { messages, messageAttachments, messageRecipients } from '../../shared/schema-messages';
import { eq, and, or, desc, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { authenticateUser } from '../middleware/auth';
import { isAdmin } from '../utils/role-utils';
import * as fs from 'fs';
import * as path from 'path';
import { uploadAttachmentToObjectStorage, getAttachmentUrl } from '../attachment-storage-proxy';

const router = express.Router();
const upload = multer({ dest: 'temp_upload/' });

// Ensure temp upload directory exists
if (!fs.existsSync('temp_upload')) {
  fs.mkdirSync('temp_upload', { recursive: true });
}

// Create uploads/messages directory if it doesn't exist
const messagesUploadDir = path.join('uploads', 'messages');
if (!fs.existsSync(messagesUploadDir)) {
  fs.mkdirSync(messagesUploadDir, { recursive: true });
}

// Create uploads/attachments directory if it doesn't exist
const attachmentsUploadDir = path.join('uploads', 'attachments');
if (!fs.existsSync(attachmentsUploadDir)) {
  fs.mkdirSync(attachmentsUploadDir, { recursive: true });
}

// Get all messages for the current user
router.get('/', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const isUserAdmin = isAdmin(req.user?.role);
    
    // Get message IDs where this user is a recipient
    const receivedMessageIds = await db.select({
      messageId: messageRecipients.messageId
    })
    .from(messageRecipients)
    .where(eq(messageRecipients.recipientId, currentUserId));
    
    // Extract just the message IDs
    const messageIdsList = receivedMessageIds.map(m => m.messageId);
    
    // Get all messages sent by this user or where this user is a recipient
    const userMessages = await db.select()
      .from(messages)
      .where(
        or(
          eq(messages.senderId, currentUserId),
          inArray(messages.id, messageIdsList)
        )
      )
      .orderBy(desc(messages.createdAt));
    
    // Get info about read status for these messages
    let messageReadStatus = [];
    
    if (messageIdsList.length > 0) {
      messageReadStatus = await db.select()
        .from(messageRecipients)
        .where(
          and(
            inArray(messageRecipients.messageId, messageIdsList),
            eq(messageRecipients.recipientId, currentUserId)
          )
        );
    }
    
    // Create a map of message IDs to read status
    const readStatusMap = {};
    messageReadStatus.forEach(status => {
      readStatusMap[status.messageId] = status.readAt !== null;
    });
    
    // Get sender names for each message
    const senderIds = userMessages.map(msg => msg.senderId);
    const messageAttachmentsList = await db.select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, userMessages.map(m => m.id)));
    
    // Group attachments by message ID
    const attachmentsByMessage = {};
    messageAttachmentsList.forEach(attachment => {
      if (!attachmentsByMessage[attachment.messageId]) {
        attachmentsByMessage[attachment.messageId] = [];
      }
      attachmentsByMessage[attachment.messageId].push(attachment);
    });
    
    // Get sender information for all messages
    const senderInfo = await db.select()
      .from(users)
      .where(inArray(users.id, senderIds));
    
    // Create a map of user IDs to user names
    const userNameMap = {};
    senderInfo.forEach(user => {
      userNameMap[user.id] = user.fullName || user.username;
    });
    
    // Process all messages
    const messagesWithReadStatus = userMessages.map(message => {
      return {
        ...message,
        senderName: userNameMap[message.senderId] || 'Unknown',
        read: message.senderId === currentUserId || readStatusMap[message.id] || false,
        attachments: attachmentsByMessage[message.id] || []
      };
    });
    
    // Sort messages by date (newest first) and handle parent-child relationships
    const processedMessages = processMessageThreads(messagesWithReadStatus);
    
    return res.json(processedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to organize messages into threads
function processMessageThreads(messages) {
  console.log(`Processing ${messages.length} messages into threads`);
  
  // First, create a map of parent messages to their replies
  const messageThreads = {};
  const topLevelMessages = [];
  
  // Create a map of all messages by ID for easier lookup
  const messagesById = {};
  messages.forEach(message => {
    messagesById[message.id] = message;
  });
  
  // Identify parent and child messages
  messages.forEach(message => {
    // Use inReplyTo for camelCase (TypeScript) and in_reply_to for snake_case (database)
    const replyToId = message.inReplyTo || message.in_reply_to;
    
    if (replyToId) {
      // This is a reply message
      console.log(`Message ID ${message.id} is a reply to ${replyToId}`);
      
      if (!messageThreads[replyToId]) {
        messageThreads[replyToId] = [];
      }
      messageThreads[replyToId].push(message);
    } else {
      // This is a top-level message
      topLevelMessages.push(message);
    }
  });
  
  // Sort all replies by date (newest first)
  Object.keys(messageThreads).forEach(threadId => {
    messageThreads[threadId].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    console.log(`Thread ${threadId} has ${messageThreads[threadId].length} replies`);
  });
  
  // Add replies to their parent messages
  const result = topLevelMessages.map(message => {
    return {
      ...message,
      replies: messageThreads[message.id] || []
    };
  });
  
  // Sort parent messages by date (newest first)
  result.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  console.log(`Processed ${result.length} top-level messages with their replies`);
  return result;
}

// Get a specific message
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get the message details
    const message = await db.select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    
    if (message.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    const msg = message[0];
    
    // Check if user has access to this message (using messageRecipients for access check)
    const isRecipient = await db.select()
      .from(messageRecipients)
      .where(and(
        eq(messageRecipients.messageId, messageId),
        eq(messageRecipients.recipientId, currentUserId)
      ))
      .limit(1);
      
    if (msg.senderId !== currentUserId && isRecipient.length === 0 && !isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Mark message as read if user is a recipient
    if (isRecipient.length > 0 && isRecipient[0].readAt === null) {
      await db.update(messageRecipients)
        .set({ 
          readAt: new Date(),
          status: 'read'
        })
        .where(and(
          eq(messageRecipients.messageId, messageId),
          eq(messageRecipients.recipientId, currentUserId)
        ));
    }
    
    // Fetch attachments
    const attachments = await db.select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
    
    // Get sender info
    const sender = await db.select()
      .from(users)
      .where(eq(users.id, msg.senderId))
      .limit(1);
    
    // Determine recipient info
    let recipientInfo = { name: 'Unknown' };
    
    if (msg.messageType === 'user') {
      // For user type, we need to check the messageRecipients table
      const recipients = await db.select()
        .from(messageRecipients)
        .leftJoin(users, eq(messageRecipients.recipientId, users.id))
        .where(eq(messageRecipients.messageId, messageId))
        .limit(1);
      
      if (recipients.length > 0 && recipients[0].users) {
        recipientInfo = {
          id: recipients[0].users.id,
          name: recipients[0].users.fullName || recipients[0].users.username
        };
      }
    } else if (msg.messageType === 'admin') {
      recipientInfo = { name: 'Admin Team' };
    } else if (msg.messageType === 'all') {
      recipientInfo = { name: 'All Users' };
    } else if (msg.messageType === 'registered') {
      recipientInfo = { name: 'All Registered Users' };
    } else if (msg.messageType === 'badge_holders') {
      recipientInfo = { name: 'All Badge Holders' };
    }
    
    // Fetch message replies with better debugging
    console.log(`Fetching replies for message ID: ${messageId}`);
    const replies = await db.select()
      .from(messages)
      .where(eq(messages.in_reply_to, messageId));
    
    console.log(`Found ${replies.length} replies for message ID ${messageId}:`, replies);
    
    // Format replies with sender info and attachments
    const formattedReplies = await Promise.all(replies.map(async (reply) => {
      console.log(`Processing reply ID ${reply.id} to message ${messageId}`);
      
      // Get sender info for this reply
      const replySender = await db.select()
        .from(users)
        .where(eq(users.id, reply.senderId))
        .limit(1);
      
      const senderName = replySender.length > 0 
        ? (replySender[0].fullName || replySender[0].username) 
        : 'Unknown';
        
      console.log(`Reply ${reply.id} sender: ${senderName}`);
      
      // Get any attachments for this reply
      const replyAttachments = await db.select()
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, reply.id));
      
      // Create a properly formatted reply object with all fields needed by UI
      const formattedReply = {
        id: reply.id,
        senderId: reply.senderId,
        senderName: senderName,
        subject: reply.subject || msg.subject,
        content: reply.content,
        messageType: reply.messageType,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        timestamp: reply.createdAt,
        recipientName: 'You',
        read: true,
        in_reply_to: reply.in_reply_to,
        inReplyTo: reply.in_reply_to,
        attachments: replyAttachments || []
      };
      
      console.log(`Formatted reply:`, formattedReply);
      return formattedReply;
    }));
    
    // Return the message with additional details including replies
    return res.json({
      ...msg,
      attachments,
      sender: sender.length > 0 ? {
        id: sender[0].id,
        name: sender[0].fullName || sender[0].username
      } : { name: 'Unknown' },
      recipient: recipientInfo,
      replies: formattedReplies,
      // Add both versions for compatibility
      inReplyTo: msg.in_reply_to
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Reply to a message
router.post('/:id/reply', authenticateUser, upload.array('attachments'), async (req, res) => {
  try {
    console.log('📨 Processing reply to message ID:', req.params.id);
    
    // Validate message ID is a number
    const parentMessageId = parseInt(req.params.id, 10);
    if (isNaN(parentMessageId)) {
      console.error('Invalid parent message ID:', req.params.id);
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    
    console.log('Request body:', req.body);
    console.log('Attachments count:', req.files ? (req.files as Express.Multer.File[]).length : 0);
    
    const { content } = req.body;
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    // Verify that the parent message exists and user has access
    const parentMessage = await db.select()
      .from(messages)
      .where(eq(messages.id, parentMessageId))
      .limit(1);
    
    if (parentMessage.length === 0) {
      return res.status(404).json({ error: 'Parent message not found' });
    }
    
    // Check if user has access to reply to this message
    const isRecipient = await db.select()
      .from(messageRecipients)
      .where(and(
        eq(messageRecipients.messageId, parentMessageId),
        eq(messageRecipients.recipientId, currentUserId)
      ))
      .limit(1);
      
    const isSender = parentMessage[0].senderId === currentUserId;
    
    if (!isSender && isRecipient.length === 0 && !isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'You cannot reply to this message' });
    }
    
    // Determine the recipient of the reply
    let recipientId;
    let messageType = 'user';
    
    if (isSender) {
      // If current user is the sender of the parent, reply goes to the original recipient
      if (['admin', 'all', 'registered', 'badge_holders'].includes(parentMessage[0].messageType)) {
        // When replying to a message sent to a group, keep the same type
        messageType = parentMessage[0].messageType;
        recipientId = null;
      } else {
        // For user-to-user messages, find the recipient
        const originalRecipient = await db.select()
          .from(messageRecipients)
          .where(eq(messageRecipients.messageId, parentMessageId))
          .limit(1);
          
        if (originalRecipient.length > 0) {
          recipientId = originalRecipient[0].recipientId;
        }
      }
    } else {
      // If current user is a recipient, reply goes to the original sender
      recipientId = parentMessage[0].senderId;
    }
    
    // Create the reply
    const newMessage = await db.insert(messages)
      .values({
        subject: `Re: ${parentMessage[0].subject}`,
        content,
        senderId: currentUserId,
        messageType,
        inReplyTo: parentMessageId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    if (messageType === 'user' && recipientId) {
      // Add specific user as recipient
      await db.insert(messageRecipients)
        .values({
          messageId: newMessage[0].id,
          recipientId,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'delivered'
        });
    } else if (messageType === 'admin') {
      // Find all admin users
      const adminUsers = await db.select()
        .from(users)
        .where(eq(users.role, 'admin'));
      
      // Add each admin as a recipient (except the sender)
      for (const admin of adminUsers) {
        if (admin.id !== currentUserId) {
          await db.insert(messageRecipients)
            .values({
              messageId: newMessage[0].id,
              recipientId: admin.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              status: 'delivered'
            });
        }
      }
    }
    
    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      console.log(`📎 Processing ${req.files.length} attachment(s) for reply message`);
      const files = req.files as Express.Multer.File[];
      
      // Process each file
      for (const file of files) {
        try {
          console.log(`Processing attachment: ${file.originalname} (${file.size} bytes)`);
          
          // Generate a unique filename for storing the attachment
          const originalExt = path.extname(file.originalname);
          const uniqueFilename = `${uuidv4()}${originalExt}`;
          
          // Define the destination directory
          const destinationDir = 'uploads/attachments';
          
          // Ensure the directory exists
          if (!fs.existsSync(destinationDir)) {
            console.log(`Creating directory: ${destinationDir}`);
            fs.mkdirSync(destinationDir, { recursive: true });
          }
          
          // Determine the destination path for the file
          const destinationPath = path.join(destinationDir, uniqueFilename);
          
          console.log(`Copying file from ${file.path} to ${destinationPath}`);
          
          // Check source file exists
          if (!fs.existsSync(file.path)) {
            throw new Error(`Source file not found at path: ${file.path}`);
          }
          
          // Move the file from the temporary upload location to the destination
          fs.copyFileSync(file.path, destinationPath);
          
          // Verify the file was copied correctly
          if (!fs.existsSync(destinationPath)) {
            throw new Error(`Failed to copy file to destination: ${destinationPath}`);
          }
          
          // Use the getAttachmentUrl helper to generate the appropriate URL for the current environment
          // Import this function from attachment-storage-proxy.ts
          // CRITICAL FIX: Always generate a relative URL path that will work in any environment
          let objectStorageUrl = null;
          
          // Upload to object storage in production before generating URL
          if (process.env.NODE_ENV === 'production') {
            try {
              console.log(`Pre-uploading attachment to Object Storage: ${uniqueFilename}`);
              objectStorageUrl = await uploadAttachmentToObjectStorage(destinationPath, uniqueFilename);
              console.log(`Successfully uploaded to Object Storage, URL: ${objectStorageUrl}`);
            } catch (uploadError) {
              console.error(`Error pre-uploading to Object Storage: ${uploadError}`);
              // Continue with local URL if upload fails
            }
          }
          
          // Generate environment-appropriate URL using the helper
          const attachmentUrl = getAttachmentUrl(uniqueFilename, objectStorageUrl);
          
          // Detailed logging for debugging
          console.log(`[MessageAttachment] Generated URL: ${attachmentUrl}`);
          console.log(`[MessageAttachment] File details - Original name: ${file.originalname}, Stored as: ${uniqueFilename}`);
          console.log(`[MessageAttachment] File size: ${file.size} bytes, MIME type: ${file.mimetype}`);
          console.log(`[MessageAttachment] Environment: ${process.env.NODE_ENV}, Production: ${process.env.NODE_ENV === 'production'}`);
          console.log(`[MessageAttachment] Base URL path: ${req.protocol}://${req.get('host')}`);
          console.log(`[MessageAttachment] Final URL format: ${attachmentUrl}`);
          console.log(`[MessageAttachment] Expected access path in browser: ${req.protocol}://${req.get('host')}${attachmentUrl}`);
          
          // FIXED: We already uploaded above, don't duplicate the upload process
          // The objectStorageUrl has already been generated if we're in production
          // and it's already been passed to getAttachmentUrl
          
          // Save attachment info to the database
          await db.insert(messageAttachments)
            .values({
              id: uuidv4(), // Generate unique ID
              messageId: newMessage[0].id,
              filename: file.originalname,
              storedFilename: uniqueFilename,
              size: file.size.toString(),
              contentType: file.mimetype,
              url: attachmentUrl, // Store the appropriate URL for the environment
              createdAt: new Date()
            });
          
          console.log(`Attachment record created in database for: ${file.originalname}`);
          
          // Remove the temporary file
          try {
            fs.unlinkSync(file.path);
            console.log(`Temporary file removed: ${file.path}`);
          } catch (unlinkError) {
            console.warn(`Warning: Could not remove temporary file ${file.path}:`, unlinkError);
            // Non-critical error, can continue
          }
        } catch (fileError) {
          console.error(`Error handling file ${file.originalname}:`, fileError);
          // Continue processing other files even if one fails
        }
      }
    }
    
    // Get sender info to return with response
    const sender = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
    const senderName = sender.length > 0 ? (sender[0].fullName || sender[0].username) : 'Unknown';
    
    // Get attachments for response
    const attachments = await db.select().from(messageAttachments).where(eq(messageAttachments.messageId, newMessage[0].id));
    
    // Format response with all needed data
    const messageResponse = {
      ...newMessage[0],
      senderName,
      attachments,
      read: true, // Sender has read their own message
      inReplyTo: parentMessageId // Explicitly add inReplyTo to ensure proper threading
    };
    
    console.log('✅ Reply created successfully:', messageResponse);
    
    // Return the complete response
    return res.status(201).json({ 
      message: messageResponse,
      success: true
    });
  } catch (error) {
    console.error('Error creating reply:', error);
    
    // Clean up any temporary files that may have been uploaded
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }
    }
    
    return res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Create a new message
router.post('/', authenticateUser, upload.array('attachments'), async (req, res) => {
  try {
    const { recipient, subject, content, templateId } = req.body;
    const senderId = req.user?.id;
    
    if (!senderId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!subject || !content) {
      return res.status(400).json({ error: 'Subject and content are required' });
    }
    
    // Check if user is allowed to send to this recipient
    // Only admins can send to non-admin recipients
    if (!isAdmin(req.user?.role) && recipient !== 'admin') {
      return res.status(403).json({ error: 'You can only send messages to administrators' });
    }
    
    let recipientId = recipient;
    let recipientType = 'user';
    let targetedUserIds = null;
    
    // Check if this is a template-targeted message
    if (recipient && recipient.startsWith('template:')) {
      // This is a message using a template's dynamic targeting
      const targetQuery = recipient.substring(9); // remove 'template:' prefix
      
      try {
        // First, verify this is an admin user (only admins can use templates)
        if (!isAdmin(req.user?.role)) {
          return res.status(403).json({ error: 'Only administrators can use message templates' });
        }
        
        console.log(`Processing template-targeted message with query: ${targetQuery}`);
        
        // Fetch the target users based on the template query
        let targetedUsers = [];
        
        switch (targetQuery) {
          case 'sponsorship_expiring_7days':
            // Import the function from message-templates module
            const { getUsersWithExpiringSponsorship } = await import('./message-templates');
            targetedUsers = await getUsersWithExpiringSponsorship();
            recipientType = 'template_sponsorship_expiring';
            break;
            
          case 'badge_holders':
            const { getBadgeHolders } = await import('./message-templates');
            targetedUsers = await getBadgeHolders();
            recipientType = 'template_badge_holders';
            break;
            
          case 'new_paid_users':
            const { getNewPaidUsers } = await import('./message-templates');
            targetedUsers = await getNewPaidUsers();
            recipientType = 'template_new_paid_users';
            break;
            
          default:
            // Unknown template target type
            return res.status(400).json({ error: `Unknown template targeting type: ${targetQuery}` });
        }
        
        // Store the IDs of targeted users for later use
        targetedUserIds = targetedUsers.map(user => user.id);
        
        console.log(`Template targeting found ${targetedUserIds.length} recipient(s)`);
        
        // If no targeted users found, return an error
        if (targetedUserIds.length === 0) {
          return res.status(404).json({ error: 'No recipients match the template criteria' });
        }
        
        // We'll set recipientId to null since this is a dynamically targeted message
        recipientId = null;
      } catch (error) {
        console.error('Error processing template-targeted message:', error);
        return res.status(500).json({ error: 'Failed to process template-targeted message' });
      }
    }
    // Handle standard recipient types
    else if (['all', 'registered', 'badge_holders', 'admin'].includes(recipient)) {
      recipientType = recipient;
      recipientId = null;
    } else {
      // Check if sending to a non-admin when sender is not an admin
      if (!isAdmin(req.user?.role)) {
        // For non-admin senders, only allow sending to 'admin'
        recipientType = 'admin';
        recipientId = null;
      }
    }
    
    // Create the message based on actual database schema
    const result = await db.insert(messages)
      .values({
        // Don't include ID - it's a serial type that auto-increments
        subject,
        content,
        senderId, // Already a number
        messageType: recipientType,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
      
    // Use the result from the insert operation instead of querying again
    const newMessage = result[0];
    
    // Create message recipients based on recipient type
    if (recipientType.startsWith('template_')) {
      // Handle template-targeted messages using the targetedUserIds array
      if (targetedUserIds && targetedUserIds.length > 0) {
        console.log(`Adding ${targetedUserIds.length} targeted recipients for template message ${newMessage.id}`);
        
        // Add each targeted user as a recipient (excluding sender)
        for (const userId of targetedUserIds) {
          if (userId !== senderId) {
            await db.insert(messageRecipients)
              .values({
                messageId: newMessage.id,
                recipientId: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'delivered',
                targetRole: recipientType // Store the template targeting info
              });
          }
        }
      }
    } else if (recipientType === 'admin') {
      // Find all admin users
      const adminUsers = await db.select()
        .from(users)
        .where(eq(users.role, 'admin'));
      
      // Add each admin as a recipient
      for (const admin of adminUsers) {
        await db.insert(messageRecipients)
          .values({
            messageId: newMessage.id,
            recipientId: admin.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'delivered',
            targetRole: 'admin'
          });
      }
    } else if (recipientType === 'all') {
      // Find all users
      const allUsers = await db.select()
        .from(users);
      
      // Add each user as a recipient (excluding sender)
      for (const user of allUsers) {
        if (user.id !== senderId) {
          await db.insert(messageRecipients)
            .values({
              messageId: newMessage.id,
              recipientId: user.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              status: 'delivered',
              targetRole: 'all'
            });
        }
      }
    } else if (recipientType === 'registered') {
      // Find all registered users (paid members)
      const registeredUsers = await db.select()
        .from(users)
        .where(eq(users.role, 'paid'));
      
      // Add each registered user as a recipient (excluding sender)
      for (const user of registeredUsers) {
        if (user.id !== senderId) {
          await db.insert(messageRecipients)
            .values({
              messageId: newMessage.id,
              recipientId: user.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              status: 'delivered',
              targetRole: 'registered'
            });
        }
      }
    } else if (recipientType === 'badge_holders') {
      // Find all badge holders
      const badgeHolders = await db.select()
        .from(users)
        .where(eq(users.hasMembershipBadge, true));
      
      // Add each badge holder as a recipient (excluding sender)
      for (const user of badgeHolders) {
        if (user.id !== senderId) {
          await db.insert(messageRecipients)
            .values({
              messageId: newMessage.id,
              recipientId: user.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              status: 'delivered',
              targetRole: 'badge_holders'
            });
        }
      }
    } else if (recipientId) {
      // Add specific user as recipient
      const convertedRecipientId = typeof recipientId === 'string' ? parseInt(recipientId, 10) : recipientId;
      await db.insert(messageRecipients)
        .values({
          messageId: newMessage.id,
          recipientId: convertedRecipientId,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'delivered'
        });
    }

    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const files = req.files as Express.Multer.File[];
      
      // Process each file
      for (const file of files) {
        try {
          // Generate a unique filename for storing the attachment
          const originalExt = path.extname(file.originalname);
          const uniqueFilename = `${uuidv4()}${originalExt}`;
          
          // Define the destination directory
          const destinationDir = 'uploads/attachments';
          
          // Ensure the directory exists
          if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
          }
          
          // Determine the destination path for the file
          const destinationPath = path.join(destinationDir, uniqueFilename);
          
          // Move the file from the temporary upload location to the destination
          fs.copyFileSync(file.path, destinationPath);
          
          // Upload to Object Storage in production or use local path in development
          console.log(`[Attachment] Processing attachment for message ${newMessage.id}: ${uniqueFilename}`);
          console.log(`[Attachment] DIAGNOSTIC - NODE_ENV: ${process.env.NODE_ENV}`);
          console.log(`[Attachment] DIAGNOSTIC - Original filename: ${file.originalname}`);
          
          // In production, upload to Object Storage
          let objectStorageUrl = null;
          try {
            console.log(`[Attachment] DIAGNOSTIC - Calling uploadAttachmentToObjectStorage with path: ${destinationPath} and filename: ${uniqueFilename}`);
            objectStorageUrl = await uploadAttachmentToObjectStorage(destinationPath, uniqueFilename);
            if (objectStorageUrl) {
              console.log(`[Attachment] Uploaded to Object Storage: ${objectStorageUrl}`);
              console.log(`[Attachment] DIAGNOSTIC - Object Storage URL received: ${objectStorageUrl}`);
            } else {
              console.log(`[Attachment] DIAGNOSTIC - No Object Storage URL received (null/undefined)`);
            }
          } catch (uploadError) {
            console.error(`[Attachment] Error uploading to Object Storage:`, uploadError);
            console.log(`[Attachment] DIAGNOSTIC - Upload to Object Storage failed with error`);
            // Continue anyway, we'll use local file as fallback
          }
          
          // Generate appropriate URL based on environment and available Object Storage URL
          // This is the critical fix - pass the objectStorageUrl to ensure proper URL generation
          console.log(`[Attachment] DIAGNOSTIC - Calling getAttachmentUrl with filename: ${uniqueFilename} and objectStorageUrl: ${objectStorageUrl}`);
          const attachmentUrl = getAttachmentUrl(uniqueFilename, objectStorageUrl);
          
          // Log the actual URL being stored in the database for debugging
          console.log(`[Attachment] DIAGNOSTIC - Received attachmentUrl from getAttachmentUrl: ${attachmentUrl}`);
          console.log(`[Attachment] Storing attachment URL in database: ${attachmentUrl}`);
          
          // Save attachment info to the database with URL
          await db.insert(messageAttachments)
            .values({
              id: uuidv4(), // Generate unique ID for attachment
              messageId: newMessage.id,
              filename: file.originalname,
              storedFilename: uniqueFilename,
              size: file.size.toString(), // Use size instead of fileSize
              contentType: file.mimetype,
              url: attachmentUrl, // Use proper environment-specific URL
              createdAt: new Date()
            });
          
          // Remove the temporary file
          fs.unlinkSync(file.path);
        } catch (fileError) {
          console.error(`Error handling file ${file.originalname}:`, fileError);
          // Continue processing other files even if one fails
        }
      }
    }
    
    return res.status(201).json({ message: 'Message sent successfully', data: newMessage });
  } catch (error) {
    console.error('Error creating message:', error);
    
    // Clean up any temporary files that may have been uploaded
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }
    }
    
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark a message as read
router.put('/:id/read', authenticateUser, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the message exists
    const message = await db.select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
      
    if (message.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if the user is a recipient of this message
    const recipient = await db.select()
      .from(messageRecipients)
      .where(and(
        eq(messageRecipients.messageId, messageId),
        eq(messageRecipients.recipientId, currentUserId)
      ))
      .limit(1);
      
    if (recipient.length === 0) {
      return res.status(403).json({ error: 'You are not a recipient of this message' });
    }
    
    // Mark as read
    await db.update(messageRecipients)
      .set({ 
        readAt: new Date(),
        status: 'read'
      })
      .where(and(
        eq(messageRecipients.messageId, messageId),
        eq(messageRecipients.recipientId, currentUserId)
      ));
      
    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get replies for a specific message
router.get('/:id/replies', authenticateUser, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // First, verify the original message exists and user has access to it
    const originalMessage = await db.select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
      
    if (originalMessage.length === 0) {
      return res.status(404).json({ error: 'Original message not found' });
    }
    
    console.log(`Fetching replies for message ID: ${messageId}`);
    
    // Fetch all replies to this message
    const replies = await db.select()
      .from(messages)
      .where(eq(messages.in_reply_to, messageId))
      .orderBy(asc(messages.createdAt));
    
    console.log(`Found ${replies.length} replies for message ${messageId}`);
    
    // Format replies with sender info
    const formattedReplies = await Promise.all(replies.map(async (reply) => {
      // Get sender info
      const senderInfo = await db.select()
        .from(users)
        .where(eq(users.id, reply.senderId))
        .limit(1);
      
      const senderName = senderInfo.length > 0 
        ? (senderInfo[0].fullName || senderInfo[0].username) 
        : 'Unknown';
      
      // Get attachments
      const attachments = await db.select()
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, reply.id));
      
      return {
        id: reply.id,
        senderId: reply.senderId,
        senderName,
        subject: reply.subject,
        content: reply.content,
        messageType: reply.messageType,
        read: true,
        timestamp: reply.createdAt,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        inReplyTo: reply.in_reply_to,
        in_reply_to: reply.in_reply_to,
        attachments: attachments || []
      };
    }));
    
    return res.json(formattedReplies);
  } catch (error) {
    console.error('Error fetching message replies:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a message
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the message exists
    const message = await db.select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
      
    if (message.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if the user has permission to delete the message
    const isSender = message[0].senderId === currentUserId;
    const isUserAdmin = isAdmin(req.user?.role);
    
    if (!isSender && !isUserAdmin) {
      return res.status(403).json({ error: 'You are not allowed to delete this message' });
    }
    
    // If the message has replies, we don't want to delete it
    const replies = await db.select()
      .from(messages)
      .where(eq(messages.in_reply_to, messageId));
      
    if (replies.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete this message as it has replies',
        replies: replies.length
      });
    }
    
    // Get attachments to delete files from filesystem
    const attachments = await db.select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
      
    // Delete message recipients
    await db.delete(messageRecipients)
      .where(eq(messageRecipients.messageId, messageId));
      
    // Delete message attachments from database
    await db.delete(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
      
    // Delete message
    await db.delete(messages)
      .where(eq(messages.id, messageId));
      
    // Delete attachment files from filesystem
    for (const attachment of attachments) {
      if (attachment.storedFilename) {
        const filePath = path.join('uploads', 'attachments', attachment.storedFilename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread message counts for the current user
router.get('/unread/count', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Count unread messages
    const unreadCount = await db.select({
      count: sql`count(*)`
    })
    .from(messageRecipients)
    .where(and(
      eq(messageRecipients.recipientId, currentUserId),
      eq(messageRecipients.readAt, null)
    ));
    
    return res.json({ count: parseInt(unreadCount[0].count.toString(), 10) || 0 });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions for message management
function getUserNameById(userId) {
  return db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then(result => {
      if (result.length > 0) {
        return result[0].fullName || result[0].username;
      }
      return 'Unknown';
    })
    .catch(error => {
      console.error('Error fetching user name:', error);
      return 'Unknown';
    });
}

function markMessageAsRead(userId, messageId) {
  return db.update(messageRecipients)
    .set({ 
      readAt: new Date(),
      status: 'read'
    })
    .where(and(
      eq(messageRecipients.messageId, messageId),
      eq(messageRecipients.recipientId, userId)
    ))
    .catch(error => {
      console.error('Error marking message as read:', error);
    });
}

export default router;