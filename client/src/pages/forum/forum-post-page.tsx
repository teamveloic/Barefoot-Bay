import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  ArrowLeft,
  Clock,
  Send,
  User,
  Loader2,
  MessageSquare,
  Trash2,
  AlertTriangle,
  Edit
} from "lucide-react";
import { ForumContent } from "@/components/forum/forum-content";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePermissions } from "@/hooks/use-permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

interface ForumComment {
  id: number;
  content: string;
  postId: number;
  authorId: number;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
}

export default function ForumPostPage() {
  const params = useParams<{ postId: string }>();
  const postId = parseInt(params.postId, 10);
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, hasPermission } = usePermissions();
  const [comment, setComment] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);

  // Fetch post details
  const { 
    data: post, 
    isLoading: isLoadingPost 
  } = useQuery<ForumPost>({
    queryKey: [`/api/forum/posts/${postId}`],
    enabled: !isNaN(postId),
    onSuccess: (data) => {
      // Log the full post data to help with debugging
      console.log("DEBUG Post data received:", data);
    },
    // This is critical to prevent rendering before data is available
    select: (data) => {
      if (!data) return undefined;
      
      // Ensure dates are properly formatted
      return {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      };
    }
  });

  // Fetch comments for the post
  const { 
    data: comments, 
    isLoading: isLoadingComments 
  } = useQuery<ForumComment[]>({
    queryKey: [`/api/forum/posts/${postId}/comments`],
    enabled: !isNaN(postId),
  });

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/forum/posts/${postId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete post");
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate the query cache for the category's posts
      if (post) {
        queryClient.invalidateQueries({ queryKey: [`/api/forum/categories/${post.categoryId}/posts`] });
      }
      
      toast({
        title: "Post Deleted",
        description: "The post has been deleted successfully.",
      });
      
      // Navigate back to the category page
      if (post) {
        navigate(`/forum/category/${post.categoryId}`);
      } else {
        navigate("/forum");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      setCommentToDelete(commentId);
      const response = await fetch(`/api/forum/comments/${commentId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete comment");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/forum/posts/${postId}/comments`] });
      toast({
        title: "Comment Deleted",
        description: "The comment has been deleted successfully.",
      });
      setCommentToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setCommentToDelete(null);
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentData: { content: string }) => {
      const response = await fetch(`/api/forum/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commentData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add comment");
      }
      
      return response.json();
    },
    onSuccess: (newComment) => {
      // Clear the comment input field
      setComment("");
      
      // Add the new comment to the existing comments list in the cache
      // This immediately updates the UI without waiting for a refetch
      if (newComment && comments) {
        // Add user info to the new comment (assuming it's returned from the API)
        // If not in the response, we'll add the current user's info as a temporary solution
        const commentWithAuthor = {
          ...newComment,
          author: newComment.author || {
            id: user?.id || 0,
            username: user?.username || 'Unknown',
            avatarUrl: user?.avatarUrl || null
          }
        };
        
        // Update the cache with the new comment included
        queryClient.setQueryData(
          [`/api/forum/posts/${postId}/comments`], 
          [...comments, commentWithAuthor]
        );
      }
      
      // Also invalidate the query to ensure it's refreshed from the server
      queryClient.invalidateQueries({ queryKey: [`/api/forum/posts/${postId}/comments`] });
      
      toast({
        title: "Comment Added",
        description: "Your comment has been posted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to post a comment.",
        variant: "destructive",
      });
      return;
    }
    
    if (!hasPermission && !isAdmin) {
      toast({
        title: "Commenting Restricted",
        description: user.isBlocked
          ? `Your account has been blocked${user.blockReason ? `: ${user.blockReason}` : ''}.`
          : "This feature requires a specific membership level to access.",
        variant: "destructive",
      });
      return;
    }
    
    addCommentMutation.mutate({ content: comment });
  };

  if (isLoadingPost || isLoadingComments) {
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
        <p className="text-navy/70 mb-6">The post you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate("/forum")} variant="outline" className="border-navy/20">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Forums
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <Button 
          onClick={() => navigate(`/forum/category/${post.categoryId}`)} 
          variant="ghost" 
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to {post.category?.name || 'Category'}
        </Button>

        <div className="flex gap-2">
          {/* Edit button - visible to post author and admins */}
          {(user && (user.id === post.author?.id || isAdmin)) && (
            <Button 
              variant="outline" 
              size="sm"
              className="mb-4 border-navy/20 hover:bg-coral/10 hover:text-coral hover:border-coral"
              onClick={() => navigate(`/forum/edit-post/${post.id}`)}
            >
              <Edit className="mr-2 h-4 w-4" /> Edit Post
            </Button>
          )}

          {/* Delete button - visible to admins only */}
          {isAdmin && (
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="mb-4"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the post
                    and all associated comments.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deletePostMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={deletePostMutation.isPending}
                  >
                    {deletePostMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Main post */}
      <Card className="border border-navy/10 mb-8">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-2xl font-bold text-navy">{post.title}</CardTitle>
            <div className="flex items-center text-navy/70 text-sm">
              <Clock className="h-4 w-4 mr-1" />
              <span>
                {(() => {
                  try {
                    // Make sure post exists and createdAt is defined
                    if (!post || !post.createdAt) {
                      console.error("Post or post.createdAt is undefined:", post);
                      return "Invalid date";
                    }
                    
                    // Verify the date string is valid
                    const timestamp = Date.parse(post.createdAt);
                    if (isNaN(timestamp)) {
                      console.error("Invalid post.createdAt date:", post.createdAt);
                      return "Invalid date";
                    }
                    
                    const dateObj = new Date(timestamp);
                    if (isNaN(dateObj.getTime())) {
                      console.error("Invalid date object after parsing post.createdAt:", post.createdAt);
                      return "Invalid date";
                    }
                    
                    return format(dateObj, 'MMM d, yyyy h:mm a');
                  } catch (error) {
                    console.error("Date formatting error for post.createdAt:", error);
                    return "Invalid date";
                  }
                })()}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <ForumContent 
            content={post.content} 
            className="prose-navy prose-headings:text-navy prose-strong:text-navy/90" 
          />
        </CardContent>
        <CardFooter className="border-t border-navy/5 bg-navy/5 py-3 px-6">
          <div className="flex items-center text-navy/70">
            <Avatar className="h-6 w-6 mr-2">
              {post.author?.avatarUrl ? (
                <AvatarImage src={post.author.avatarUrl} alt={post.author?.username || 'User'} />
              ) : (
                <AvatarFallback className="bg-coral text-white">
                  {post.author?.username ? post.author.username.substring(0, 2).toUpperCase() : 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <span>{post.author?.username || 'Anonymous'}</span>
          </div>
        </CardFooter>
      </Card>

      {/* Comments section */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-navy mb-4 flex items-center">
          <MessageSquare className="mr-2 h-5 w-5" />
          Comments {comments && comments.length > 0 && `(${comments.length})`}
        </h2>
        
        {!comments || comments.length === 0 ? (
          <div className="text-center py-8 bg-navy/5 rounded-lg">
            <MessageSquare className="h-10 w-10 mx-auto text-navy/30 mb-3" />
            <p className="text-navy/70">No comments yet. Be the first to join the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <Card key={comment.id} className="border border-navy/10">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      {comment.author?.avatarUrl ? (
                        <AvatarImage src={comment.author.avatarUrl} alt={comment.author?.username || 'User'} />
                      ) : (
                        <AvatarFallback className="bg-coral text-white">
                          {comment.author?.username ? comment.author.username.substring(0, 2).toUpperCase() : 'U'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-navy">{comment.author?.username || 'Anonymous'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-navy/60">
                            {comment && comment.createdAt ? (
                              (() => {
                                try {
                                  // Make sure comment exists and createdAt is defined
                                  if (!comment || !comment.createdAt) {
                                    console.error("Comment or comment.createdAt is undefined:", comment);
                                    return "Invalid date";
                                  }
                                  
                                  // Verify date string is valid and parse it
                                  const timestamp = Date.parse(comment.createdAt);
                                  if (isNaN(timestamp)) {
                                    console.error("Invalid comment.createdAt date:", comment.createdAt);
                                    return "Invalid date";
                                  }
                                  
                                  // Check if the date is recent (within last 10 minutes)
                                  if (timestamp > Date.now() - 1000 * 60 * 10) {
                                    return 'Just now';
                                  }
                                  
                                  // Otherwise format normally
                                  const dateObj = new Date(timestamp);
                                  if (isNaN(dateObj.getTime())) {
                                    console.error("Invalid date object after parsing comment.createdAt:", comment.createdAt);
                                    return "Invalid date";
                                  }
                                  
                                  return format(dateObj, 'MMM d, yyyy h:mm a');
                                } catch (error) {
                                  console.error("Date formatting error for comment.createdAt:", error);
                                  return "Invalid date";
                                }
                              })()
                            ) : ''}
                          </span>
                          {/* Delete comment button - visible to admins only */}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-6 w-6 rounded-full hover:bg-red-100 hover:text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this comment? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    {deleteCommentMutation.isPending && commentToDelete === comment.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      "Delete"
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                      <div className="text-navy/80">
                        {/* If comment contains HTML, render it with ForumContent */}
                        {comment.content.includes('<') ? (
                          <ForumContent content={comment.content} className="prose-sm" />
                        ) : (
                          <p>{comment.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add comment form */}
      {!user ? (
        <div className="text-center py-6 bg-navy/5 rounded-lg">
          <p className="text-navy/70 mb-3">You need to be logged in to post comments.</p>
          <Button onClick={() => navigate("/auth")} className="bg-coral hover:bg-coral/90 text-white">
            Sign In to Comment
          </Button>
        </div>
      ) : !hasPermission && !isAdmin ? (
        <div className="text-center py-6 bg-navy/5 rounded-lg">
          <p className="text-navy/70 mb-3">
            {user.isBlocked 
              ? `Your account has been blocked${user.blockReason ? `: ${user.blockReason}` : ''}. You cannot post comments at this time.`
              : "This feature requires a specific membership level to access."}
          </p>
          <Button 
            variant="outline" 
            onClick={() => navigate("/forum")} 
            className="border-navy/20"
          >
            Back to Forum
          </Button>
        </div>
      ) : (
        <Card className="border border-navy/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-navy">Add Your Comment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitComment}>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts on this topic..."
                className="min-h-[100px] mb-3 border-navy/20 focus:border-coral"
              />
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  className="bg-coral hover:bg-coral/90 text-white"
                  disabled={addCommentMutation.isPending || !comment.trim()}
                >
                  {addCommentMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}