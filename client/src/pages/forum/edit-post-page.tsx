import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import WysiwygEditorForum from "@/components/shared/wysiwyg-editor-forum";
import { MediaUploader } from "@/components/shared/media-uploader";

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

interface ForumPost {
  id: number;
  title: string;
  content: string;
  categoryId: number;
  authorId: number;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
  category: {
    id: number;
    name: string;
  };
}

const editPostSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  categoryId: z.string().transform(val => parseInt(val, 10)),
  mediaUrls: z.array(z.string()).optional().default([]),
});

type EditPostFormValues = z.infer<typeof editPostSchema>;

export default function EditPostPage() {
  const params = useParams<{ postId: string }>();
  const postId = parseInt(params.postId, 10);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [editorContent, setEditorContent] = useState("");
  
  // Fetch forum categories
  const { data: categories, isLoading: categoriesLoading } = useQuery<ForumCategory[]>({
    queryKey: ["/api/forum/categories"],
  });

  // Fetch post details
  const { 
    data: post, 
    isLoading: isLoadingPost 
  } = useQuery<ForumPost>({
    queryKey: [`/api/forum/posts/${postId}`],
    enabled: !isNaN(postId),
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<EditPostFormValues>({
    resolver: zodResolver(editPostSchema),
    defaultValues: {
      title: "",
      content: "",
      categoryId: "",
      mediaUrls: [],
    },
  });

  // Populate form with post data once it's loaded
  useEffect(() => {
    if (post) {
      reset({
        title: post.title,
        content: post.content,
        categoryId: post.categoryId.toString(),
        mediaUrls: post.mediaUrls || [],
      });
      setEditorContent(post.content);
      setLoading(false);
    }
  }, [post, reset]);
  
  // Update the hidden content field whenever editor content changes
  useEffect(() => {
    if (editorContent) {
      setValue("content", editorContent);
    }
  }, [editorContent, setValue]);

  // Update post mutation
  const updatePostMutation = useMutation({
    mutationFn: async (updatedPost: EditPostFormValues) => {
      console.log("Sending post update request:", {
        postId,
        title: updatedPost.title,
        category: updatedPost.categoryId,
        mediaCount: updatedPost.mediaUrls?.length || 0
      });
      
      try {
        // First, ensure we're authenticated - check explicitly
        const authCheckResponse = await fetch('/api/auth/check', {
          credentials: 'include',
          mode: 'cors',
          cache: 'no-cache'
        });
        
        const authStatus = await authCheckResponse.json();
        console.log("Authentication status before post update:", authStatus);
        
        if (!authStatus.isAuthenticated) {
          console.error("User is not authenticated when trying to update post");
          throw new Error("You are not logged in. Please log in and try again.");
        }
        
        // Now try to update the post
        const response = await apiRequest("PATCH", `/api/forum/posts/${postId}`, updatedPost);
        
        // Need to convert the response to JSON here, as apiRequest returns a Response object
        return response.json();
      } catch (err: any) {
        console.error("Error during post update process:", err);
        // Rethrow with more context for better error handling
        throw new Error(err.message || "Failed to update post. Please try again.");
      }
    },
    onSuccess: (data) => {
      console.log("Post updated successfully, response data:", data);
      toast({
        title: "Success!",
        description: "Your post has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/forum/posts/${postId}`] });
      navigate(`/forum/post/${postId}`);
    },
    onError: (error: any) => {
      console.error("Error updating post:", error);
      
      // Handle different error cases
      let errorMessage = "Failed to update post. Please try again.";
      
      // Check for specific error types and provide better messages
      if (error.message?.includes("not logged in") || error.status === 401) {
        errorMessage = "Your session has expired. Please log in again to save your changes.";
      } else if (error.status === 403) {
        errorMessage = "You don't have permission to edit this post.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditPostFormValues) => {
    console.log("Form submission event captured:", data);
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "You must be signed in to update a post.",
        variant: "destructive",
      });
      return;
    }
    
    // Post editing is controlled by role-based permissions
    
    // Use the rich editor content
    const formattedData = {
      ...data,
      content: editorContent, // Use the content from the WYSIWYG editor
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls : []
    };
    
    updatePostMutation.mutate(formattedData);
  };

  // Check if user has permission to edit this post
  useEffect(() => {
    if (post && user && post.author) {
      const isAuthor = post.author.id === user.id;
      
      if (!isAuthor && !isAdmin) {
        toast({
          title: "Permission Denied",
          description: "You don't have permission to edit this post.",
          variant: "destructive",
        });
        navigate(`/forum/post/${postId}`);
      }
    }
  }, [post, user, isAdmin, toast, navigate, postId]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto my-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold text-center mb-4">Sign In Required</h2>
        <p className="text-center mb-6">You must be signed in to edit forum posts.</p>
        <div className="flex justify-center">
          <Button onClick={() => navigate("/auth")}>Sign In</Button>
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
        <p className="text-center mb-6">You don't currently have access to edit forum posts. This could be due to account restrictions.</p>
        <div className="flex justify-center">
          <Button onClick={() => navigate("/forum")} variant="outline">
            Back to Forum
          </Button>
        </div>
      </div>
    );
  }

  if (isLoadingPost || categoriesLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-navy mb-2">Post Not Found</h2>
        <p className="text-navy/70 mb-6">The post you're trying to edit doesn't exist or has been removed.</p>
        <Button onClick={() => navigate("/forum")} variant="outline" className="border-navy/20">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Forums
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto my-8">
      <Button 
        variant="outline" 
        className="mb-6 border-navy/20 hover:bg-navy/5"
        onClick={() => navigate(`/forum/post/${postId}`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Post
      </Button>
      
      <Card className="border-navy/10">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-navy">Edit Post</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="categoryId" className="text-navy">Category</Label>
              <Select 
                onValueChange={(value) => setValue("categoryId", value)} 
                defaultValue={post.categoryId.toString()}
                value={watch("categoryId")}
              >
                <SelectTrigger id="categoryId" className="border-navy/20">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
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
                      slug: `forum-post-${postId}`
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
                      } else if (firstItem.mediaType === 'audio') {
                        galleryHtml += `<audio src="${firstItemUrl}" controls data-index="0" style="width: 100%; display: block;"></audio>`;
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
                            } else if (item.mediaType === 'audio') {
                              const audio = document.createElement('audio');
                              audio.src = item.url;
                              audio.controls = true;
                              audio.dataset.index = currentIndex;
                              audio.style.width = '100%';
                              audio.style.display = 'block';
                              contentEl.appendChild(audio);
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
                        slug: `forum-post-${postId}`
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
                disabled={updatePostMutation.isPending}
              >
                {updatePostMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
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