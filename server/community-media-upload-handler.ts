/**
 * Community Media Upload Handler
 * 
 * Specialized handler for community media uploads through TinyMCE editor
 * Ensures media is stored in the COMMUNITY bucket in Object Storage and returns URLs in the format expected by TinyMCE
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Client } from '@replit/object-storage';
import { BUCKETS } from './object-storage-service';

// Configure temporary storage for community uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tmpdir = path.join(os.tmpdir(), 'community-uploads');
    fs.mkdirSync(tmpdir, { recursive: true });
    cb(null, tmpdir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'community-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const communityUpload = multer({ storage });

/**
 * Handle media uploads from TinyMCE editor for community pages
 * This function processes the uploaded file, stores it in Object Storage, and returns the URL
 */
export const handleCommunityMediaUpload = async (req, res) => {
  try {
    // Log the request information
    console.log('=== COMMUNITY MEDIA UPLOAD REQUEST RECEIVED ===');
    console.log(`Path: ${req.path}`);
    console.log(`Method: ${req.method}`);
    console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.log(`Body: ${JSON.stringify(req.body || {}, null, 2)}`);
    console.log(`Query: ${JSON.stringify(req.query || {}, null, 2)}`);
    console.log(`File: ${req.file ? 'Present' : 'Missing'}`);
    
    if (!req.file) {
      console.log('ERROR: No file was included in the upload request!');
      return res.status(400).json({
        message: 'No file uploaded',
        location: ''
      });
    }
    
    const file = req.file;
    console.log(`Processing community media upload: ${file.originalname} (${file.size} bytes)`);
    
    // Initialize Object Storage client
    const client = new Client();
    
    // Create the community media folder if it doesn't exist
    const communityMediaDir = path.join(process.cwd(), 'community-media');
    if (!fs.existsSync(communityMediaDir)) {
      fs.mkdirSync(communityMediaDir, { recursive: true });
    }
    
    // Generate a filename and path for the file
    const filename = `community-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    const filePath = path.join(communityMediaDir, filename);
    
    // Copy the file from the temporary location to the community media directory
    fs.copyFileSync(file.path, filePath);
    
    try {
      // Upload to Object Storage using the COMMUNITY bucket
      const objectKey = `community/${filename}`;
      const fileContent = fs.readFileSync(file.path);
      
      await client.putObject({
        bucket: BUCKETS.COMMUNITY,
        key: objectKey,
        body: fileContent
      });
      
      console.log(`Successfully uploaded community media to Object Storage: ${objectKey}`);
      
      // Return the response for TinyMCE in the format it expects
      const responseUrl = `/api/storage-proxy/direct-community/${filename}`;
      console.log(`Community media upload successful, returning URL: ${responseUrl}`);
      
      return res.json({
        location: responseUrl,
        // Also include url property as backup to ensure compatibility with our MediaUploader component
        url: responseUrl
      });
    } catch (error) {
      console.error(`Error uploading to Object Storage: ${error.message || error}`);
      
      // Fallback to filesystem URL if Object Storage upload fails
      const fallbackUrl = `/community-media/${filename}`;
      console.log(`Using filesystem fallback: ${fallbackUrl}`);
      
      return res.json({
        location: fallbackUrl,
        // Also include url property as backup to ensure compatibility with our MediaUploader component
        url: fallbackUrl
      });
    }
  } catch (error) {
    console.error(`Error in community media upload: ${error.message || error}`);
    return res.status(500).json({
      message: 'Server error during upload',
      location: '',
      url: ''  // Include empty url property for consistency
    });
  }
};