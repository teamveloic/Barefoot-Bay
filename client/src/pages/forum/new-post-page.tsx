import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowLeft, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import WysiwygEditorForum from "@/components/shared/wysiwyg-editor-forum";
import { MediaUploader } from "@/components/shared/media-uploader";
import { MediaGallery, MediaGalleryItem } from "@/components/shared/media-gallery";

interface ForumCategory {
  id: number;
  name: string;
  description: string;
  slug: string;
  icon?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

const newPostSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  categoryId: z.union([
    z.string().transform(val => parseInt(val, 10)),
    z.number()
  ]),
  mediaUrls: z.array(z.string()).optional().default([]),
});

type NewPostFormValues = z.infer<typeof newPostSchema>;

export default function NewPostPage() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isBlocked, canCreateTopic, isAdmin, hasPermission } = usePermissions();
  const [editorContent, setEditorContent] = useState("");
  
  // Get category ID from URL query if available
  const getUrlParams = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('category');
  };
  
  const categoryFromUrl = getUrlParams();
  
  // Fetch forum categories
  const { data: categories, isLoading: categoriesLoading } = useQuery<ForumCategory[]>({
    queryKey: ["/api/forum/categories"],
  });

  const { register, handleSubmit, formState: { errors }, control, setValue, watch } = useForm<NewPostFormValues>({
    resolver: zodResolver(newPostSchema),
    defaultValues: {
      title: "",
      content: "",
      categoryId: categoryFromUrl ? parseInt(categoryFromUrl, 10) || 0 : 0,
      mediaUrls: [],
    },
  });
  
  // Set category from URL when categories are loaded
  useEffect(() => {
    if (categoryFromUrl && categories) {
      setValue("categoryId", parseInt(categoryFromUrl, 10));
    }
  }, [categories, categoryFromUrl, setValue]);
  
  // Update the hidden content field whenever editor content changes
  useEffect(() => {
    if (editorContent) {
      setValue("content", editorContent);
    }
  }, [editorContent, setValue]);

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async (newPost: any) => { // Use 'any' to handle both form values and our formatted data
      const categoryId = newPost.categoryId;
      const response = await apiRequest("POST", `/api/forum/categories/${categoryId}/posts`, newPost);
      // Need to convert the response to JSON here, as apiRequest returns a Response object
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Post created successfully, response data:", data);
      toast({
        title: "Success!",
        description: "Your post has been created.",
      });
      
      // Invalidate all relevant queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/forum/categories"] });
      
      // For the specific post and category, we want to make sure they're invalidated
      if (data && data.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/forum/posts/${data.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/forum/categories/${data.categoryId}/posts`] });
        queryClient.invalidateQueries({ queryKey: [`/api/forum/posts/${data.id}/comments`] });
        
        console.log("Navigating to post with ID:", data.id);
        // Pre-populate the cache with our newly created post data to avoid loading state
        queryClient.setQueryData([`/api/forum/posts/${data.id}`], data);
        
        // Navigate to the post page
        navigate(`/forum/post/${data.id}`);
      } else {
        console.error("Missing post ID in response data:", data);
        // Fallback to main forum page if we don't have an ID
        navigate("/forum");
      }
    },
    onError: (error: any) => {
      console.error("Error creating post:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create post. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: NewPostFormValues) => {
    console.log("Form submission event captured:", data);
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "You must be signed in to create a post.",
        variant: "destructive",
      });
      return;
    }
    
    // Check for content length before submission
    if (editorContent.length < 10) {
      toast({
        title: "Content too short",
        description: "Content must be at least 10 characters long.",
        variant: "destructive",
      });
      return;
    }
    
    // Use the rich editor content
    const formattedData = {
      title: data.title,
      content: editorContent, // Use the content from the WYSIWYG editor
      categoryId: parseInt(data.categoryId.toString(), 10), // Ensure categoryId is a number
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : []
      // Note: The server will add authorId from the authenticated session, no need to send userId
    };
    
    console.log("Debug: Making POST request to /api/forum/categories/" + formattedData.categoryId + "/posts with data:", formattedData);
    createPostMutation.mutate(formattedData);
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto my-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center mb-4">Sign In Required</h2>
        <p className="text-center mb-6">You must be signed in to create a new forum post.</p>
        <div className="flex justify-center">
          <Button onClick={() => navigate("/auth")}>Sign In</Button>
        </div>
      </div>
    );
  }
  
  if (isBlocked) {
    return (
      <div className="max-w-3xl mx-auto my-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center mb-4 text-red-600">Account Blocked</h2>
        <p className="text-center mb-6">Your account has been blocked by an administrator. You cannot create forum posts.</p>
        {user?.blockReason && (
          <p className="text-center mb-6 text-gray-700 italic">
            Reason: {user.blockReason}
          </p>
        )}
        <div className="flex justify-center">
          <Button onClick={() => navigate("/forum")} variant="outline">
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }
  
  // After our system simplification, this check should no longer be needed
  // as we only check if a user is blocked, not their approval status
  // We'll keep this condition but update the wording in case it's reached somehow
  if (!hasPermission && !isAdmin) {
    return (
      <div className="max-w-3xl mx-auto my-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center mb-4">Feature Access Restricted</h2>
        <p className="text-center mb-6">You don't currently have access to create forum posts. This could be due to account restrictions.</p>
        <div className="flex justify-center">
          <Button onClick={() => navigate("/forum")} variant="outline">
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto my-8">
      <Button 
        variant="outline" 
        className="mb-6 border-navy/20 hover:bg-navy/5"
        onClick={() => {
          // If came from a category page, go back to that specific category
          if (categoryFromUrl) {
            navigate(`/forum/category/${categoryFromUrl}`);
          } else {
            navigate("/forum");
          }
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> 
        {categoryFromUrl ? "Back to Category" : "Back to Forum"}
      </Button>
      
      <Card className="border-navy/10">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-navy">Create New Topic</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="categoryId" className="text-navy">Category</Label>
              <Select 
                onValueChange={(value) => setValue("categoryId", parseInt(value, 10))} 
                defaultValue={categoryFromUrl || ""}
              >
                <SelectTrigger id="categoryId" className="border-navy/20">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesLoading ? (
                    <div className="flex justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-sm text-red-500">{errors.categoryId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="text-navy">Title</Label>
              <Input
                id="title"
                placeholder="Enter a title for your topic"
                className="border-navy/20"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-sm text-red-500">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="content" className="text-navy">Content</Label>
                <div className="flex gap-2">
                  <MediaUploader 
                    editorContext={{
                      section: 'forum',
                      slug: 'forum-new-post'
                    }}
                    onMediaInsert={(url, altText, styles, mediaType) => {
                      // Fix any malformed URLs before inserting them
                      let processedUrl = url;
                      
                      // If URL is in the format /uploads/api/storage-proxy/BUCKET/path - fix it
                      if (url && url.startsWith('/uploads/api/storage-proxy/')) {
                        processedUrl = url.replace('/uploads/api/storage-proxy/', '/api/storage-proxy/');
                        console.log(`[MediaInsert] Fixed malformed URL: ${url} → ${processedUrl}`);
                      }
                      
                      // Remove any timestamp query parameters (causes issues with audio files)
                      if (processedUrl && processedUrl.includes('?t=')) {
                        processedUrl = processedUrl.split('?')[0];
                        console.log(`[MediaInsert] Removed timestamp query: ${url} → ${processedUrl}`);
                      }
                      
                      // Create the HTML for the media
                      let mediaHtml = '';
                      const styleAttr = styles 
                        ? `style="width:${styles.width || '100%'};${styles.align ? `display:block;margin-left:${styles.align === 'center' || styles.align === 'right' ? 'auto' : '0'};margin-right:${styles.align === 'center' || styles.align === 'left' ? 'auto' : '0'};` : ''}"` 
                        : '';
                      
                      if (mediaType === 'video') {
                        mediaHtml = `<video src="${processedUrl}" controls ${styleAttr}></video>`;
                      } else if (mediaType === 'audio') {
                        mediaHtml = `<audio src="${processedUrl}" controls ${styleAttr}></audio>`;
                      } else {
                        mediaHtml = `<img src="${processedUrl}" alt="${altText || 'Image'}" ${styleAttr}>`;
                      }
                      
                      // Append the media HTML to the current editor content
                      setEditorContent(prevContent => prevContent + mediaHtml);
                    }}
                    onMediaGalleryInsert={(mediaItems, styles) => {
                      console.log(`[MediaGallery] Inserting gallery with ${mediaItems.length} items`);
                      
                      // Create a gallery container with proper styling
                      const galleryContainerStyles = styles 
                        ? `style="width:${styles.width || '100%'};${styles.align ? `display:block;margin-left:${styles.align === 'center' || styles.align === 'right' ? 'auto' : '0'};margin-right:${styles.align === 'center' || styles.align === 'left' ? 'auto' : '0'};` : ''}"` 
                        : '';
                      
                      // Start the gallery container
                      let galleryHtml = `<div class="media-gallery-container" ${galleryContainerStyles}>`;
                      
                      // Add gallery data as JSON in a hidden div for future parsing if needed
                      const galleryData = JSON.stringify(mediaItems.map(item => ({
                        ...item,
                        url: item.url.startsWith('/uploads/api/storage-proxy/') 
                          ? item.url.replace('/uploads/api/storage-proxy/', '/api/storage-proxy/') 
                          : item.url
                      })));
                      
                      galleryHtml += `<div class="media-gallery-data" style="display:none;" data-gallery='${galleryData}'></div>`;
                      
                      // Add individual media items (initially just showing the first one)
                      const firstItem = mediaItems[0];
                      const firstItemUrl = firstItem.url.startsWith('/uploads/api/storage-proxy/') 
                        ? firstItem.url.replace('/uploads/api/storage-proxy/', '/api/storage-proxy/') 
                        : firstItem.url;
                      
                      // Create a container for media display with navigation controls
                      galleryHtml += `<div class="media-gallery-display" style="position: relative;">`;
                      
                      // Add media counter
                      galleryHtml += `<div class="media-gallery-counter" style="position: absolute; top: 10px; left: 10px; background-color: rgba(0,0,0,0.5); color: white; padding: 5px 10px; border-radius: 4px; z-index: 10;">1 / ${mediaItems.length}</div>`;
                      
                      // Add media content
                      galleryHtml += `<div class="media-gallery-content" style="display: flex; justify-content: center; align-items: center;">`;
                      
                      // Add first media item
                      if (firstItem.mediaType === 'video') {
                        galleryHtml += `<video src="${firstItemUrl}" controls style="max-width: 100%; height: auto;" alt="${firstItem.altText || 'Video'}"></video>`;
                      } else {
                        galleryHtml += `<img src="${firstItemUrl}" style="max-width: 100%; height: auto;" alt="${firstItem.altText || 'Image'}">`;
                      }
                      
                      galleryHtml += `</div>`; // Close media-gallery-content
                      
                      // Add navigation buttons
                      galleryHtml += `
                        <div class="media-gallery-nav" style="position: absolute; top: 50%; left: 0; right: 0; display: flex; justify-content: space-between; transform: translateY(-50%); padding: 0 10px;">
                          <button class="media-gallery-prev" style="background-color: rgba(0,0,0,0.3); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="prevGalleryImage(this)">←</button>
                          <button class="media-gallery-next" style="background-color: rgba(0,0,0,0.3); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="nextGalleryImage(this)">→</button>
                        </div>
                      `;
                      
                      galleryHtml += `</div>`; // Close media-gallery-display
                      galleryHtml += `</div>`; // Close media-gallery-container
                      
                      // Add gallery navigation script
                      galleryHtml += `
                      <script>
                        // Add the gallery navigation functions to the global scope if they don't exist
                        if (typeof window.prevGalleryImage === 'undefined') {
                          window.prevGalleryImage = function(button) {
                            const galleryContainer = button.closest('.media-gallery-container');
                            const dataEl = galleryContainer.querySelector('.media-gallery-data');
                            const contentEl = galleryContainer.querySelector('.media-gallery-content');
                            const counterEl = galleryContainer.querySelector('.media-gallery-counter');
                            
                            if (!dataEl || !contentEl || !counterEl) return;
                            
                            // Get the gallery data
                            const galleryData = JSON.parse(dataEl.getAttribute('data-gallery'));
                            if (!galleryData || !galleryData.length) return;
                            
                            // Get the current index
                            const currentText = counterEl.textContent.split('/')[0].trim();
                            let currentIndex = parseInt(currentText, 10) - 1;
                            
                            // Calculate the previous index
                            currentIndex = currentIndex > 0 ? currentIndex - 1 : galleryData.length - 1;
                            
                            // Update the counter
                            counterEl.textContent = \`\${currentIndex + 1} / \${galleryData.length}\`;
                            
                            // Update the content
                            contentEl.innerHTML = '';
                            const item = galleryData[currentIndex];
                            
                            if (item.mediaType === 'video') {
                              const video = document.createElement('video');
                              video.src = item.url;
                              video.controls = true;
                              video.style.maxWidth = '100%';
                              video.style.height = 'auto';
                              video.alt = item.altText || 'Video';
                              contentEl.appendChild(video);
                            } else {
                              const img = document.createElement('img');
                              img.src = item.url;
                              img.style.maxWidth = '100%';
                              img.style.height = 'auto';
                              img.alt = item.altText || 'Image';
                              contentEl.appendChild(img);
                            }
                          };
                          
                          window.nextGalleryImage = function(button) {
                            const galleryContainer = button.closest('.media-gallery-container');
                            const dataEl = galleryContainer.querySelector('.media-gallery-data');
                            const contentEl = galleryContainer.querySelector('.media-gallery-content');
                            const counterEl = galleryContainer.querySelector('.media-gallery-counter');
                            
                            if (!dataEl || !contentEl || !counterEl) return;
                            
                            // Get the gallery data
                            const galleryData = JSON.parse(dataEl.getAttribute('data-gallery'));
                            if (!galleryData || !galleryData.length) return;
                            
                            // Get the current index
                            const currentText = counterEl.textContent.split('/')[0].trim();
                            let currentIndex = parseInt(currentText, 10) - 1;
                            
                            // Calculate the next index
                            currentIndex = currentIndex < galleryData.length - 1 ? currentIndex + 1 : 0;
                            
                            // Update the counter
                            counterEl.textContent = \`\${currentIndex + 1} / \${galleryData.length}\`;
                            
                            // Update the content
                            contentEl.innerHTML = '';
                            const item = galleryData[currentIndex];
                            
                            if (item.mediaType === 'video') {
                              const video = document.createElement('video');
                              video.src = item.url;
                              video.controls = true;
                              video.style.maxWidth = '100%';
                              video.style.height = 'auto';
                              video.alt = item.altText || 'Video';
                              contentEl.appendChild(video);
                            } else {
                              const img = document.createElement('img');
                              img.src = item.url;
                              img.style.maxWidth = '100%';
                              img.style.height = 'auto';
                              img.alt = item.altText || 'Image';
                              contentEl.appendChild(img);
                            }
                          };
                        }
                      </script>
                      `;
                      
                      // Append the gallery HTML to the current editor content
                      setEditorContent(prevContent => prevContent + galleryHtml);
                    }}
                  />
                </div>
              </div>
              
              {/* Hidden field for content validation */}
              <input 
                type="hidden" 
                {...register("content")} 
              />
              
              <div className="border border-navy/20 rounded-md overflow-hidden">
                <Tabs defaultValue="editor" className="w-full">
                  <TabsList className="w-full bg-gray-50 border-b border-navy/10">
                    <TabsTrigger value="editor" className="flex-1">Rich Editor</TabsTrigger>
                    <TabsTrigger value="basic" className="flex-1">Basic Editor</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="editor" className="mt-0">
                    <WysiwygEditorForum 
                      editorContent={editorContent} 
                      setEditorContent={setEditorContent} 
                      editorContext={{
                        section: 'forum',
                        slug: 'forum-new-post'
                      }}
                    />
                  </TabsContent>
                  
                  <TabsContent value="basic" className="mt-0 p-2">
                    <Textarea
                      id="content-textarea"
                      placeholder="Write your post content here..."
                      className="min-h-[400px] border-navy/20"
                      value={editorContent}
                      onChange={(e) => {
                        setEditorContent(e.target.value);
                        setValue("content", e.target.value);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
              
              {errors.content && (
                <p className="text-sm text-red-500">{errors.content.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                className="bg-coral hover:bg-coral/90 text-white"
                disabled={createPostMutation.isPending}
              >
                {createPostMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Topic
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}