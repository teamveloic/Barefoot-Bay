import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { MediaUploader } from './media-uploader';
import { 
  ArrowLeftRight, 
  Copy, 
  Clipboard, 
  Check, 
  Bold, 
  Italic, 
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  Quote, 
  Link, 
  Image, 
  Minus,
  Code,
  Palette
} from 'lucide-react';

interface EditorContextData {
  section?: string;
  slug?: string;
}

interface MediaItem {
  url: string;
  altText?: string;
  mediaType: 'image' | 'video';
}

interface MediaStyles {
  width?: string;
  height?: string;
  align?: 'left' | 'center' | 'right';
  [key: string]: string | undefined;
}

interface WysiwygEditorProps {
  editorContent: string;
  setEditorContent: (content: string) => void;
  editorContext?: EditorContextData;
  onMediaGalleryInsert?: (mediaItems: MediaItem[], styles?: MediaStyles) => void;
}

/**
 * Forum-specific WYSIWYG editor with specialized handling for forum media
 * This component is based on wysiwyg-editor-direct but includes specific
 * configuration for forum content uploads
 */
export default function WysiwygEditorForum({ 
  editorContent, 
  setEditorContent,
  editorContext = { section: 'forum' }, // Default to forum section
  onMediaGalleryInsert
}: WysiwygEditorProps) {
  const [activeTab, setActiveTab] = useState<string>('visual');
  const [rawHtml, setRawHtml] = useState(editorContent);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [customColor, setCustomColor] = useState('#000000');
  const [recentColors, setRecentColors] = useState<string[]>(['#FF0000', '#0000FF', '#008000']);
  const [showVisualEditHint, setShowVisualEditHint] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  
  // Initialize editor content on mount and when editorContent changes externally
  useEffect(() => {
    // For textareas, we don't need to manually set the value or handle selection 
    // React will handle this correctly through the value prop
    // This effect is kept only for potential future enhancements
  }, [editorContent]);
  
  // Initialize the contentEditable div with content
  useEffect(() => {
    if (contentEditableRef.current && activeTab === 'visual') {
      // Only set innerHTML directly when the element doesn't have focus
      // This prevents cursor reset during typing
      if (document.activeElement !== contentEditableRef.current) {
        contentEditableRef.current.innerHTML = editorContent;
      }
    }
  }, [editorContent, activeTab]);
  
  // A separate effect to handle tab changes - always update content when switching tabs
  useEffect(() => {
    if (contentEditableRef.current) {
      // When switching to the visual tab, update the preview content
      contentEditableRef.current.innerHTML = editorContent;
    }
  }, [activeTab]);
  
  // Update the HTML content when raw HTML changes
  const applyRawHtmlChanges = () => {
    setEditorContent(rawHtml);
    // The useEffect will handle updating the editor with the new content
    setActiveTab('visual'); // Switch back to visual editor
  };
  
  // Sync HTML to editor when editing raw HTML
  const handleRawHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawHtml(e.target.value);
  };
  
  // Update content state when visual editor changes
  const handleEditorInput = () => {
    if (editorRef.current) {
      // For textarea, we don't need special selection handling
      // React handles this correctly with controlled components
      const value = editorRef.current.value;
      
      // Only update state if content actually changed
      if (value !== editorContent) {
        setEditorContent(value);
        setRawHtml(value);
      }
    }
  };
  
  // Copy raw HTML to clipboard
  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      setShowCopySuccess(true);
      setTimeout(() => setShowCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy HTML:', error);
    }
  };
  
  // Paste HTML from clipboard
  const pasteHtml = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setRawHtml(clipboardText);
      setEditorContent(clipboardText);
      // The useEffect will handle updating the editor with the new content
    } catch (error) {
      console.error('Failed to paste HTML:', error);
    }
  };
  
  // Reference to the contentEditable div is defined earlier
  
  // Formatting commands - can work with either textarea or contentEditable
  const execCommand = (command: string, value?: string) => {
    // Get the currently focused element
    const activeElement = document.activeElement;
    
    // Check if user is editing in the contentEditable preview
    if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
      // User is in the contentEditable div, use direct browser execCommand
      try {
        // Make sure we have focus in the contentEditable area
        activeElement.focus();
        
        // Execute command directly on the active div - native browser handling
        document.execCommand(command, false, value);
        
        // Update our state with the new HTML content
        const newHtml = (activeElement as HTMLElement).innerHTML;
        setEditorContent(newHtml);
        setRawHtml(newHtml);
      } catch (error) {
        console.error(`Error executing command ${command} in contentEditable:`, error);
      }
    } else {
      // Default to textarea handling
      if (!editorRef.current) return;
      
      const textarea = editorRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = editorContent.substring(start, end);
      
      let formattedText = '';
      
      // Handle different commands 
      switch(command) {
        case 'bold':
          formattedText = `<b>${selectedText}</b>`;
          break;
        case 'italic':
          formattedText = `<i>${selectedText}</i>`;
          break;
        case 'underline':
          formattedText = `<u>${selectedText}</u>`;
          break;
        case 'createLink':
          formattedText = `<a href="${value}">${selectedText || value}</a>`;
          break;
        case 'insertImage':
          formattedText = `<img src="${value}" alt="Image">`;
          break;
        case 'insertHorizontalRule':
          formattedText = '<hr>';
          break;
        case 'justifyLeft':
          formattedText = `<div style="text-align: left;">${selectedText}</div>`;
          break;
        case 'justifyCenter':
          formattedText = `<div style="text-align: center;">${selectedText}</div>`;
          break;
        case 'justifyRight':
          formattedText = `<div style="text-align: right;">${selectedText}</div>`;
          break;
        case 'insertUnorderedList':
          formattedText = '<ul>\n  <li>' + (selectedText || 'List item') + '</li>\n</ul>';
          break;
        case 'insertOrderedList':
          formattedText = '<ol>\n  <li>' + (selectedText || 'List item') + '</li>\n</ol>';
          break;
        case 'formatBlock':
          if (value) {
            formattedText = `<${value.replace(/[<>]/g, '')}>${selectedText}</${value.replace(/[<>]/g, '')}>`;
          } else {
            formattedText = selectedText;
          }
          break;
        case 'foreColor':
          formattedText = `<span style="color: ${value};">${selectedText}</span>`;
          break;
        default:
          // For unsupported commands, just return selected text
          formattedText = selectedText;
      }
      
      // Create the new text by combining the parts before and after the selection with the formatted text
      const newText = editorContent.substring(0, start) + formattedText + editorContent.substring(end);
      
      // Calculate new cursor position - generally right after the inserted formatted text
      const newPosition = start + formattedText.length;
      
      // Update the textarea content
      setEditorContent(newText);
      setRawHtml(newText);
      
      // After React re-renders, place the cursor at the right position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  };
  
  // Add heading
  const addHeading = (level: 1 | 2 | 3) => {
    execCommand('formatBlock', `<h${level}>`);
  };
  
  // Create link
  const createLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      execCommand('createLink', url);
    }
  };
  
  // Insert image
  const insertImage = () => {
    const url = prompt('Enter image URL:', 'https://');
    if (url) {
      execCommand('insertImage', url);
    }
  };
  
  // Insert horizontal rule
  const insertHorizontalRule = () => {
    execCommand('insertHorizontalRule');
  };
  
  // Insert unordered list
  const insertUnorderedList = () => {
    execCommand('insertUnorderedList');
  };
  
  // Insert ordered list
  const insertOrderedList = () => {
    execCommand('insertOrderedList');
  };
  
  // Insert quote
  const formatBlockQuote = () => {
    execCommand('formatBlock', '<blockquote>');
  };
  
  // Check if a string is a valid hex color
  const isValidHexColor = (hex: string): boolean => {
    return /^#([0-9A-F]{3}){1,2}$/i.test(hex);
  };

  // Apply text color - works with both named colors and hex values
  const applyColor = (color: string) => {
    // Use the color directly (could be a named color or a hex value)
    execCommand('foreColor', color);
    
    // Add to recent colors if it's not already there
    if (!recentColors.includes(color)) {
      // Convert named colors to hex
      let hexColor = color;
      if (color === 'red') hexColor = '#FF0000';
      if (color === 'blue') hexColor = '#0000FF';
      if (color === 'green') hexColor = '#008000';
      
      // Add to the beginning and keep only the last 5 colors
      setRecentColors(prev => [hexColor, ...prev.filter(c => c !== hexColor)].slice(0, 5));
    }
    
    // Focus back to editor after color applied
    editorRef.current?.focus();
  };
  
  return (
    <div className="border rounded-md overflow-hidden">
      <Tabs defaultValue="visual" value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between border-b px-3 py-2 bg-gray-50">
          <TabsList>
            <TabsTrigger value="visual">Visual Editor</TabsTrigger>
            <TabsTrigger value="html">HTML Source</TabsTrigger>
            <TabsTrigger value="preview">Preview Mode</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center space-x-2">
            {activeTab === 'html' && (
              <>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline" 
                  className="h-8" 
                  onClick={copyHtml}
                >
                  {showCopySuccess ? <Check size={16} className="mr-1" /> : <Copy size={16} className="mr-1" />}
                  {showCopySuccess ? 'Copied!' : 'Copy HTML'}
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline" 
                  className="h-8" 
                  onClick={pasteHtml}
                >
                  <Clipboard size={16} className="mr-1" /> Paste HTML
                </Button>
              </>
            )}
          </div>
        </div>
        
        <TabsContent value="visual">
          {/* Word-like formatting toolbar */}
          <div className="border-b">
            <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50">
              {/* Text style buttons */}
              <div className="flex items-center gap-1 pr-2 border-r">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Bold"
                  onClick={() => execCommand('bold')}
                >
                  <Bold size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Italic"
                  onClick={() => execCommand('italic')}
                >
                  <Italic size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Underline"
                  onClick={() => execCommand('underline')}
                >
                  <Underline size={16} />
                </Button>
              </div>
              
              {/* Alignment buttons */}
              <div className="flex items-center gap-1 px-2 border-r">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Align Left"
                  onClick={() => execCommand('justifyLeft')}
                >
                  <AlignLeft size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Align Center"
                  onClick={() => execCommand('justifyCenter')}
                >
                  <AlignCenter size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Align Right"
                  onClick={() => execCommand('justifyRight')}
                >
                  <AlignRight size={16} />
                </Button>
              </div>
              
              {/* Headings */}
              <div className="flex items-center gap-1 px-2 border-r">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 px-2" 
                  title="Heading 1"
                  onClick={() => addHeading(1)}
                >
                  <Heading1 size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 px-2" 
                  title="Heading 2"
                  onClick={() => addHeading(2)}
                >
                  <Heading2 size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 px-2" 
                  title="Heading 3"
                  onClick={() => addHeading(3)}
                >
                  <Heading3 size={16} />
                </Button>
              </div>
              
              {/* Lists */}
              <div className="flex items-center gap-1 px-2 border-r">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Bulleted List"
                  onClick={insertUnorderedList}
                >
                  <List size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Numbered List"
                  onClick={insertOrderedList}
                >
                  <ListOrdered size={16} />
                </Button>
              </div>
              
              {/* Special elements */}
              <div className="flex items-center gap-1 px-2 border-r">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Link"
                  onClick={createLink}
                >
                  <Link size={16} />
                </Button>
                <MediaUploader 
                  editorContext={{ section: 'forum' }}  // Force forum context for all uploads
                  onMediaGalleryInsert={(mediaItems, styles) => {
                    // If a parent onMediaGalleryInsert handler is provided, use that
                    if (onMediaGalleryInsert) {
                      onMediaGalleryInsert(mediaItems, styles);
                      return;
                    }
                    
                    // Otherwise use the default implementation
                    console.log(`[WysiwygEditor] Inserting gallery with ${mediaItems.length} items`);
                    
                    // Build the style string from the style object
                    const styleStr = styles ? Object.entries(styles)
                      .map(([key, value]) => {
                        // Skip align as it's handled separately (using class or float)
                        if (key === 'align') return null;
                        // Convert camelCase to kebab-case for CSS
                        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                        return `${cssKey}: ${value}`;
                      })
                      .filter(Boolean)
                      .join('; ') : '';
                    
                    // Build alignment styles
                    const alignClass = styles?.align ? `align-${styles.align}` : '';
                    const alignStyle = styles?.align === 'left' ? 'float: left; margin-right: 10px;' : 
                                       (styles?.align === 'right' ? 'float: right; margin-left: 10px;' : 
                                       'display: block; margin-left: auto; margin-right: auto;');
                    
                    // Start the gallery container
                    let galleryHtml = `<div class="media-gallery-container ${alignClass}" style="${styleStr ? styleStr + '; ' : ''}${alignStyle}">`;
                    
                    // Add gallery data as JSON in a hidden div for future parsing if needed
                    const galleryItems = mediaItems.map(item => {
                      let processedUrl = item.url;
                      
                      // Fix API storage proxy URLs if needed
                      if (item.url.startsWith('/uploads/api/storage-proxy/')) {
                        processedUrl = item.url.replace('/uploads/api/storage-proxy/', '/api/storage-proxy/');
                      }
                      
                      return {
                        ...item,
                        url: processedUrl
                      };
                    });
                    
                    galleryHtml += `<div class="media-gallery-data" style="display:none;" data-gallery='${JSON.stringify(galleryItems)}'></div>`;
                    
                    // Add individual media items (initially just showing the first one)
                    const firstItem = galleryItems[0];
                    const firstItemUrl = firstItem.url;
                    
                    // Create a container for media display with navigation controls
                    galleryHtml += `<div class="media-gallery-display" style="position: relative;">`;
                    
                    // Add media counter
                    galleryHtml += `<div class="media-gallery-counter" style="position: absolute; top: 10px; left: 10px; background-color: rgba(0,0,0,0.5); color: white; padding: 5px 10px; border-radius: 4px; z-index: 10;">1 / ${mediaItems.length}</div>`;
                    
                    // Navigation buttons
                    galleryHtml += `
                      <div class="media-gallery-nav" style="position: absolute; top: 50%; left: 0; right: 0; display: flex; justify-content: space-between; transform: translateY(-50%); padding: 0 10px;">
                        <button type="button" class="gallery-prev" style="background-color: rgba(0,0,0,0.3); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&#10094;</button>
                        <button type="button" class="gallery-next" style="background-color: rgba(0,0,0,0.3); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&#10095;</button>
                      </div>
                    `;
                    
                    // Content container for images/videos
                    galleryHtml += `<div class="media-gallery-content">`;
                    
                    // Place the first item
                    if (firstItem.mediaType === 'video') {
                      galleryHtml += `<video src="${firstItemUrl}" controls data-index="0" alt="${firstItem.altText || 'Video'}" style="max-width: 100%; display: block;"></video>`;
                    } else {
                      galleryHtml += `<img src="${firstItemUrl}" data-index="0" alt="${firstItem.altText || 'Image'}" style="max-width: 100%; display: block;">`;
                    }
                    
                    galleryHtml += `</div>`; // Close content
                    galleryHtml += `</div>`; // Close display
                    
                    // Add client-side script for navigation
                    galleryHtml += `
                    <script>
                      {
                        const container = document.currentScript.parentElement;
                        const galleryData = JSON.parse(container.querySelector('.media-gallery-data').dataset.gallery);
                        const contentEl = container.querySelector('.media-gallery-content');
                        const counterEl = container.querySelector('.media-gallery-counter');
                        let currentIndex = 0;
                        
                        // Set up navigation
                        container.querySelector('.gallery-prev').addEventListener('click', () => {
                          currentIndex = currentIndex > 0 ? currentIndex - 1 : galleryData.length - 1;
                          updateGallery();
                        });
                        
                        container.querySelector('.gallery-next').addEventListener('click', () => {
                          currentIndex = currentIndex < galleryData.length - 1 ? currentIndex + 1 : 0;
                          updateGallery();
                        });
                        
                        function updateGallery() {
                          // Update counter
                          counterEl.textContent = \`\${currentIndex + 1} / \${galleryData.length}\`;
                          
                          // Clear content
                          contentEl.innerHTML = '';
                          
                          // Add current item
                          const item = galleryData[currentIndex];
                          
                          if (item.mediaType === 'video') {
                            const video = document.createElement('video');
                            video.src = item.url;
                            video.controls = true;
                            video.dataset.index = currentIndex;
                            video.alt = item.altText || 'Video';
                            video.style.maxWidth = '100%';
                            video.style.display = 'block';
                            contentEl.appendChild(video);
                          } else {
                            const img = document.createElement('img');
                            img.src = item.url;
                            img.dataset.index = currentIndex;
                            img.alt = item.altText || 'Image';
                            img.style.maxWidth = '100%';
                            img.style.display = 'block';
                            contentEl.appendChild(img);
                          }
                        };
                      }
                    </script>
                    `;
                    
                    galleryHtml += `</div>`; // Close container
                    
                    // Check if user is editing in the contentEditable preview
                    const activeElement = document.activeElement;
                    if (activeTab === 'visual' && contentEditableRef.current) {
                      // Insert directly into the contentEditable div using execCommand
                      try {
                        document.execCommand('insertHTML', false, galleryHtml);
                        
                        // Update our state with the new HTML content
                        const newHtml = contentEditableRef.current.innerHTML;
                        setEditorContent(newHtml);
                        setRawHtml(newHtml);
                      } catch (error) {
                        console.error('Error inserting gallery using execCommand:', error);
                        
                        // Fallback approach: insert at cursor position
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                          const range = selection.getRangeAt(0);
                          const fragment = document.createRange().createContextualFragment(galleryHtml);
                          range.deleteContents();
                          range.insertNode(fragment);
                          range.collapse(false);
                          
                          // Update our state with the new HTML content
                          const newHtml = contentEditableRef.current.innerHTML;
                          setEditorContent(newHtml);
                          setRawHtml(newHtml);
                        }
                      }
                    } else if (activeTab === 'html' && editorRef.current) {
                      // Default to textarea handling
                      const textarea = editorRef.current;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      
                      // Insert the galleryHtml at cursor position
                      const newText = 
                        editorContent.substring(0, start) + 
                        galleryHtml + 
                        editorContent.substring(end);
                      
                      // Update textarea content
                      setEditorContent(newText);
                      setRawHtml(newText);
                      
                      // Place cursor after the inserted gallery
                      const newPosition = start + galleryHtml.length;
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(newPosition, newPosition);
                      }, 0);
                    }
                  }}
                  onMediaInsert={(url, altText, styles, mediaType = 'image') => {
                    // Get the currently focused element
                    const activeElement = document.activeElement;
                    
                    // Fix any malformed URLs before inserting them
                    let processedUrl = url;
                    
                    // If URL is in the format /uploads/api/storage-proxy/BUCKET/path - fix it
                    if (url && url.startsWith('/uploads/api/storage-proxy/')) {
                      processedUrl = url.replace('/uploads/api/storage-proxy/', '/api/storage-proxy/');
                      console.log(`[WysiwygEditor] Fixed malformed URL: ${url} → ${processedUrl}`);
                    }
                    
                    // Build the style string from the style object
                    const styleStr = styles ? Object.entries(styles)
                      .map(([key, value]) => {
                        // Skip align as it's handled separately (using class or float)
                        if (key === 'align') return null;
                        // Convert camelCase to kebab-case for CSS
                        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                        return `${cssKey}: ${value}`;
                      })
                      .filter(Boolean)
                      .join('; ') : '';
                    
                    // Build alignment styles
                    const alignClass = styles?.align ? `align-${styles.align}` : '';
                    const alignStyle = styles?.align === 'left' ? 'float: left; margin-right: 10px;' : 
                                      (styles?.align === 'right' ? 'float: right; margin-left: 10px;' : 
                                      'display: block; margin-left: auto; margin-right: auto;');
                    
                    // Create the HTML for insertion
                    let mediaHtml = '';
                    
                    if (mediaType === 'video') {
                      // Create video element with controls
                      mediaHtml = `<video src="${processedUrl}" controls style="${styleStr}; ${alignStyle}" class="${alignClass}"></video>`;
                    } else {
                      // Create image element
                      if (styles) {
                        mediaHtml = `<img src="${processedUrl}" alt="${altText || ''}" style="${styleStr}; ${alignStyle}" class="${alignClass}" />`;
                      } else {
                        // Simple image with alt text
                        mediaHtml = `<img src="${processedUrl}" alt="${altText || 'Image'}" />`;
                      }
                    }
                    
                    // Check if user is editing in the contentEditable preview
                    if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
                      // Insert directly into the contentEditable div using execCommand
                      try {
                        document.execCommand('insertHTML', false, mediaHtml);
                        
                        // Update our state with the new HTML content
                        const newHtml = (activeElement as HTMLElement).innerHTML;
                        setEditorContent(newHtml);
                        setRawHtml(newHtml);
                      } catch (error) {
                        console.error('Error inserting media using execCommand:', error);
                        
                        // Fallback approach: insert at cursor position
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                          const range = selection.getRangeAt(0);
                          const fragment = document.createRange().createContextualFragment(mediaHtml);
                          range.deleteContents();
                          range.insertNode(fragment);
                          range.collapse(false);
                          
                          // Update our state with the new HTML content
                          const newHtml = (activeElement as HTMLElement).innerHTML;
                          setEditorContent(newHtml);
                          setRawHtml(newHtml);
                        }
                      }
                    } else if (editorRef.current) {
                      // Default to textarea handling
                      const textarea = editorRef.current;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      
                      // Insert the mediaHtml at cursor position
                      const newText = 
                        editorContent.substring(0, start) + 
                        mediaHtml + 
                        editorContent.substring(end);
                      
                      // Update textarea content
                      setEditorContent(newText);
                      setRawHtml(newText);
                      
                      // Place cursor after the inserted media
                      const newPosition = start + mediaHtml.length;
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(newPosition, newPosition);
                      }, 0);
                    }
                  }}
                />
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Quote"
                  onClick={formatBlockQuote}
                >
                  <Quote size={16} />
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0" 
                  title="Horizontal Rule"
                  onClick={insertHorizontalRule}
                >
                  <Minus size={16} />
                </Button>
              </div>
              
              {/* Color picker */}
              <div className="flex items-center gap-1 px-2">
                <div className="relative">
                  {/* Color dropdown */}
                  <div className="group">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 relative" 
                      title="Text Color"
                    >
                      <Palette size={16} />
                      <div className="absolute w-5 h-1 rounded-sm bottom-1 left-1/2 transform -translate-x-1/2" style={{ backgroundColor: customColor }}></div>
                    </Button>
                    
                    {/* Color dropdown panel */}
                    <div className="hidden group-hover:block absolute z-50 mt-1 p-2 bg-white border rounded-md shadow-lg">
                      <div className="grid grid-cols-5 gap-1 mb-2">
                        {/* Preset colors */}
                        {['red', 'blue', 'green', 'orange', 'purple', 'black', 'gray', 'white', 'pink', 'cyan'].map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="w-6 h-6 rounded-md border hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => applyColor(color)}
                            title={color}
                          />
                        ))}
                      </div>
                      
                      {/* Recent colors */}
                      {recentColors.length > 0 && (
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 mb-1">Recent:</div>
                          <div className="flex gap-1">
                            {recentColors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className="w-6 h-6 rounded-md border hover:scale-110 transition-transform"
                                style={{ backgroundColor: color }}
                                onClick={() => applyColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Custom color picker */}
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="w-6 h-6"
                        />
                        <input
                          type="text"
                          value={customColor}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.startsWith('#') && val.length <= 7) {
                              setCustomColor(val);
                            }
                          }}
                          className="w-16 h-6 text-xs border rounded"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          onClick={() => isValidHexColor(customColor) && applyColor(customColor)}
                          disabled={!isValidHexColor(customColor)}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced editor interface with side-by-side editing and preview */}
          <div className="wysiwyg-container relative">
            <div className="border-b p-2 bg-gray-50 text-xs flex justify-between items-center">
              <span className="font-medium text-blue-600">WYSIWYG Editor</span>
              <span className="text-gray-500">HTML formatting is applied automatically</span>
            </div>
            
            <div className="w-full">
              {/* Full-width Live Preview */}
              <div>
                <div className="p-2 bg-gray-100 text-xs text-gray-600 font-medium border-b flex justify-between">
                  <span>Visual Editor</span>
                  <span className="text-blue-500 text-[10px]">✏️ What You See Is What You Get</span>
                </div>
                <div 
                  ref={contentEditableRef}
                  className="min-h-[400px] p-4 bg-white overflow-auto prose prose-sm max-w-none border-2 border-transparent hover:border-blue-100 focus:border-blue-200 rounded"
                  contentEditable={true}
                  suppressContentEditableWarning={true}
                  // We won't use dangerouslySetInnerHTML here to prevent React from controlling the content
                  // This lets the browser handle cursor position naturally
                  onInput={(e) => {
                    // When the user edits in the preview, we just need to get the new content
                    // and update our state, but NOT rerender this component
                    const newHtml = (e.target as HTMLDivElement).innerHTML;
                    
                    // Update the textarea content without triggering a rerender of the preview
                    if (editorRef.current) {
                      editorRef.current.value = newHtml;
                    }
                    
                    // Update state without causing a rerender of this contentEditable div
                    // This is key to preventing cursor jumping issues
                    setTimeout(() => {
                      setRawHtml(newHtml);
                      
                      // Don't call setEditorContent here as it would trigger a rerender
                      // and reset the cursor position
                    }, 0);
                  }}
                  onBlur={(e) => {
                    // On blur, we can safely update all state as the cursor position
                    // no longer matters when the element loses focus
                    const newHtml = (e.target as HTMLDivElement).innerHTML;
                    setEditorContent(newHtml);
                    setRawHtml(newHtml);
                  }}
                  onFocus={(e) => {
                    // When user focuses on the preview panel, add a visual indicator
                    const target = e.target as HTMLDivElement;
                    target.classList.add('border-blue-200');
                    
                    // Update the contentEditable div with the latest content if needed
                    if (contentEditableRef.current && 
                        contentEditableRef.current.innerHTML !== editorContent) {
                      contentEditableRef.current.innerHTML = editorContent;
                    }
                  }}
                />
              </div>
              
              {/* Hidden textarea to maintain compatibility with existing code */}
              <textarea 
                ref={editorRef as React.RefObject<HTMLTextAreaElement>}
                className="h-0 w-0 opacity-0 absolute top-0 left-0 overflow-hidden"
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setRawHtml(e.target.value);
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="html">
          <div className="p-4 space-y-4">
            <textarea
              className="w-full h-[300px] font-mono text-sm p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={rawHtml}
              onChange={handleRawHtmlChange}
              placeholder="Edit HTML here..."
            />
            <div className="flex justify-end">
              <Button 
                type="button" 
                onClick={applyRawHtmlChanges}
              >
                <ArrowLeftRight size={16} className="mr-2" /> Apply Changes
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="preview">
          <div className="p-4">
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: editorContent }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}