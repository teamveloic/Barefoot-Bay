import { Router } from "express";
import { IStorage } from "../storage";
import { requireAuth } from "../auth";
import { z } from "zod";
import { 
  insertForumCategorySchema, 
  insertForumPostSchema, 
  insertForumCommentSchema, 
  insertForumDescriptionSchema 
} from "@shared/schema";

export function createForumRouter(storage: IStorage) {
  const router = Router();

  // Get all categories
  router.get("/categories", async (req, res) => {
    try {
      const categories = await storage.getForumCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching forum categories:", error);
      res.status(500).json({ message: "Failed to fetch forum categories" });
    }
  });

  // Get a specific category
  router.get("/categories/:id", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const category = await storage.getForumCategory(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      console.error("Error fetching forum category:", error);
      res.status(500).json({ message: "Failed to fetch forum category" });
    }
  });

  // Create a new category (admin only)
  router.post("/categories", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can create categories" });
      }

      const validatedData = insertForumCategorySchema.parse(req.body);
      const newCategory = await storage.createForumCategory(validatedData);
      res.status(201).json(newCategory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", errors: error.errors });
      }
      console.error("Error creating forum category:", error);
      res.status(500).json({ message: "Failed to create forum category" });
    }
  });

  // Update a category (admin only)
  router.patch("/categories/:id", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can update categories" });
      }

      const categoryId = parseInt(req.params.id, 10);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const validatedData = insertForumCategorySchema.partial().parse(req.body);
      const updatedCategory = await storage.updateForumCategory(categoryId, validatedData);
      
      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      res.json(updatedCategory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", errors: error.errors });
      }
      console.error("Error updating forum category:", error);
      res.status(500).json({ message: "Failed to update forum category" });
    }
  });

  // Delete a category (admin only)
  router.delete("/categories/:id", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can delete categories" });
      }

      const categoryId = parseInt(req.params.id, 10);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      await storage.deleteForumCategory(categoryId);
      
      res.json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
      console.error("Error deleting forum category:", error);
      res.status(500).json({ message: "Failed to delete forum category" });
    }
  });

  // Get all posts in a category
  router.get("/categories/:id/posts", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const posts = await storage.getForumPosts(categoryId);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts for category:", error);
      res.status(500).json({ message: "Failed to fetch posts for category" });
    }
  });

  // Get a specific post
  router.get("/posts/:id", async (req, res) => {
    try {
      const postId = parseInt(req.params.id, 10);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const post = await storage.getForumPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.json(post);
    } catch (error) {
      console.error("Error fetching forum post:", error);
      res.status(500).json({ message: "Failed to fetch forum post" });
    }
  });

  // Create a new post
  router.post("/categories/:id/posts", requireAuth, async (req, res) => {
    try {
      // Check if user is blocked
      if (req.user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been blocked. You cannot create new topics.",
          blockReason: req.user.blockReason || "Contact an administrator for more information."
        });
      }

      // Since we've removed the approval process, we no longer need to check isApproved
      // We only need to check if the user is an admin, moderator, or has appropriate role permissions

      const categoryId = parseInt(req.params.id, 10);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      // Check if category exists
      const category = await storage.getForumCategory(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Extract image URLs from content if present
      let mediaUrls = Array.isArray(req.body.mediaUrls) ? [...req.body.mediaUrls] : [];
      
      // Extract all image URLs from the content HTML
      if (req.body.content) {
        console.log("Scanning content for media URLs in new post...");
        const contentImgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = contentImgRegex.exec(req.body.content)) !== null) {
          const imgSrc = match[1];
          if (imgSrc && (
            imgSrc.startsWith('/uploads/') || 
            imgSrc.startsWith('/attached_assets/') || 
            imgSrc.startsWith('/forum-media/') ||
            imgSrc.startsWith('/content-media/')
          ) && !mediaUrls.includes(imgSrc)) {
            console.log(`Found image URL in content: ${imgSrc}`);
            mediaUrls.push(imgSrc);
          }
        }
      }

      const postData = {
        ...req.body,
        categoryId,
        userId: req.user.id, // Use userId to match the schema
        mediaUrls // Add the updated mediaUrls array
      };

      console.log("Creating post with mediaUrls:", mediaUrls);
      const validatedData = insertForumPostSchema.parse(postData);
      const newPost = await storage.createForumPost(validatedData);
      res.status(201).json(newPost);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid post data", errors: error.errors });
      }
      console.error("Error creating forum post:", error);
      res.status(500).json({ message: "Failed to create forum post" });
    }
  });

  // Update a post
  router.patch("/posts/:id", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.id, 10);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Enhanced debug logging for edit requests
      console.log("Edit forum post request received:", {
        postId,
        userId: req.user?.id,
        role: req.user?.role,
        isAuthenticated: req.isAuthenticated(),
        sessionID: req.sessionID,
        hasSession: !!req.session,
        headers: {
          origin: req.headers.origin,
          referer: req.headers.referer,
          cookie: req.headers.cookie ? "Present" : "None"
        }
      });

      // Get the post to check ownership
      const post = await storage.getForumPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is the author or admin
      if (post.userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "You don't have permission to update this post" });
      }

      // Create an array to track unique URLs
      const mediaUrlSet = new Set<string>();
      
      // Add media URLs from request body if they exist
      if (Array.isArray(req.body.mediaUrls)) {
        req.body.mediaUrls.forEach(url => mediaUrlSet.add(url));
      }
      
      // Add existing media URLs from the post
      if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
        post.mediaUrls.forEach(url => mediaUrlSet.add(url));
      }
      
      // Extract all image URLs from the content HTML
      if (req.body.content) {
        console.log("Scanning content for media URLs...");
        const contentImgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = contentImgRegex.exec(req.body.content)) !== null) {
          const imgSrc = match[1];
          if (imgSrc && (
            imgSrc.startsWith('/uploads/') || 
            imgSrc.startsWith('/attached_assets/') || 
            imgSrc.startsWith('/forum-media/') ||
            imgSrc.startsWith('/content-media/')
          )) {
            console.log(`Found image URL in content: ${imgSrc}`);
            mediaUrlSet.add(imgSrc);
          }
        }
      }
      
      // Convert set back to array
      const mediaUrls = Array.from(mediaUrlSet);

      // Ensure userId field is correctly populated
      // The schema expects userId but the client may be using authorId
      const updateData = {
        ...req.body,
        mediaUrls, // Add the updated mediaUrls array
        userId: post.userId // Ensure userId is preserved from the original post
      };
      
      // Debug logs to help diagnose issues
      console.log("Original post data:", JSON.stringify({
        id: post.id,
        title: post.title,
        userId: post.userId
      }));
      console.log("Updating post with data:", JSON.stringify({
        id: postId,
        title: updateData.title,
        mediaUrls: mediaUrls.length,
        categoryId: updateData.categoryId,
        userId: updateData.userId
      }));
      
      let updatedPost;
      try {
        const validatedData = insertForumPostSchema.partial().parse(updateData);
        console.log("Validation successful. Data:", JSON.stringify(validatedData));
        updatedPost = await storage.updateForumPost(postId, validatedData);
      } catch (validationError) {
        console.error("Validation error:", validationError);
        throw validationError;
      }
      
      res.json(updatedPost);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid post data", errors: error.errors });
      }
      console.error("Error updating forum post:", error);
      res.status(500).json({ message: "Failed to update forum post" });
    }
  });

  // Delete a post
  router.delete("/posts/:id", requireAuth, async (req, res) => {
    try {
      const postId = parseInt(req.params.id, 10);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Get the post to check ownership
      const post = await storage.getForumPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is the author or admin
      if (post.userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "You don't have permission to delete this post" });
      }

      await storage.deleteForumPost(postId);
      
      res.json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
      console.error("Error deleting forum post:", error);
      res.status(500).json({ message: "Failed to delete forum post" });
    }
  });

  // Get comments for a post
  router.get("/posts/:id/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.id, 10);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const comments = await storage.getForumComments(postId);
      
      // Ensure we always return an array, even if comments is undefined
      const commentsArray = Array.isArray(comments) ? comments : [];
      console.log(`Retrieved ${commentsArray.length} comments for post ${postId}`);
      
      res.json(commentsArray);
    } catch (error) {
      console.error("Error fetching comments for post:", error);
      res.status(500).json({ message: "Failed to fetch comments for post" });
    }
  });

  // Add a comment to a post
  router.post("/posts/:id/comments", requireAuth, async (req, res) => {
    try {
      // Check if user is blocked
      if (req.user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been blocked. You cannot leave comments.",
          blockReason: req.user.blockReason || "Contact an administrator for more information."
        });
      }

      // Since we've removed the approval process, we no longer need to check isApproved
      // We only need to check if the user is an admin, moderator, or has appropriate role permissions

      const postId = parseInt(req.params.id, 10);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Check if post exists
      const post = await storage.getForumPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Also strip any HTML tags from the content
      const commentData = {
        ...req.body,
        // Clean any HTML tags from the content if present
        content: req.body.content ? req.body.content.replace(/<\/?[^>]+(>|$)/g, "") : req.body.content,
        postId,
        authorId: req.user.id,  // Now using authorId to match the updated schema
      };

      console.log("Comment data for validation:", commentData);
      const validatedData = insertForumCommentSchema.parse(commentData);
      const newComment = await storage.createForumComment(validatedData);
      res.status(201).json(newComment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comment data", errors: error.errors });
      }
      console.error("Error creating forum comment:", error);
      res.status(500).json({ message: "Failed to create forum comment" });
    }
  });

  // Update a comment
  router.patch("/comments/:id", requireAuth, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }

      // Get the comment to check ownership
      const comment = await storage.getForumComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Check if user is the author or admin
      if (comment.authorId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "You don't have permission to update this comment" });
      }

      // Clean any HTML tags from the content before validation
      const cleanedData = { 
        ...req.body,
        content: req.body.content ? req.body.content.replace(/<\/?[^>]+(>|$)/g, "") : req.body.content 
      };
      const validatedData = insertForumCommentSchema.partial().parse(cleanedData);
      const updatedComment = await storage.updateForumComment(commentId, validatedData);
      
      res.json(updatedComment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comment data", errors: error.errors });
      }
      console.error("Error updating forum comment:", error);
      res.status(500).json({ message: "Failed to update forum comment" });
    }
  });

  // Delete a comment
  router.delete("/comments/:id", requireAuth, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }

      // Get the comment to check ownership
      const comment = await storage.getForumComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Check if user is the author, post author, or admin
      const post = await storage.getForumPost(comment.postId);
      if (comment.authorId !== req.user.id && post?.userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "You don't have permission to delete this comment" });
      }

      await storage.deleteForumComment(commentId);
      
      res.json({ success: true, message: "Comment deleted successfully" });
    } catch (error) {
      console.error("Error deleting forum comment:", error);
      res.status(500).json({ message: "Failed to delete forum comment" });
    }
  });

  // Delete all forum content (admin only)
  router.delete("/all", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can delete all forum content" });
      }

      const result = await storage.deleteAllForumContent();
      
      res.json({ 
        success: true, 
        message: "All forum content deleted successfully", 
        deletedCounts: result 
      });
    } catch (error) {
      console.error("Error deleting all forum content:", error);
      res.status(500).json({ message: "Failed to delete all forum content" });
    }
  });
  
  // Delete all forum comments only (admin only)
  router.delete("/comments/all", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can delete all forum comments" });
      }

      const result = await storage.deleteAllForumComments();
      
      res.json({ 
        success: true, 
        message: "All forum comments deleted successfully", 
        deletedCounts: result 
      });
    } catch (error) {
      console.error("Error deleting all forum comments:", error);
      res.status(500).json({ message: "Failed to delete all forum comments" });
    }
  });

  // Get the forum description
  router.get("/description", async (req, res) => {
    try {
      const description = await storage.getForumDescription();
      res.json(description || { content: "", id: 0 });
    } catch (error) {
      console.error("Error fetching forum description:", error);
      res.status(500).json({ message: "Failed to fetch forum description" });
    }
  });

  // Create or update the forum description (admin only)
  router.post("/description", requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only administrators can update forum description" });
      }

      const validatedData = insertForumDescriptionSchema.parse(req.body);
      
      // Try to get existing description first
      const existingDescription = await storage.getForumDescription();
      
      let result;
      if (existingDescription) {
        // Update existing description
        result = await storage.updateForumDescription(existingDescription.id, validatedData);
      } else {
        // Create new description
        result = await storage.createForumDescription(validatedData);
      }
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid description data", errors: error.errors });
      }
      console.error("Error creating/updating forum description:", error);
      res.status(500).json({ message: "Failed to create/update forum description" });
    }
  });

  return router;
}