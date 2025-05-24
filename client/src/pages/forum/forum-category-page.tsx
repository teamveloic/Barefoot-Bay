import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  MessageSquare, 
  ArrowLeft,
  Clock,
  Plus,
  User,
  Loader2,
  Ban,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";

interface ForumCategory {
  id: number;
  name: string;
  description: string;
  slug: string;
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
  commentCount: number;
  author: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
}

export default function ForumCategoryPage() {
  const params = useParams<{ categoryId: string }>();
  const categoryId = parseInt(params.categoryId, 10);
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { canCreateTopic, isBlocked, hasPermission } = usePermissions();

  // Fetch category details
  const { 
    data: category, 
    isLoading: isLoadingCategory 
  } = useQuery<ForumCategory>({
    queryKey: [`/api/forum/categories/${categoryId}`],
    enabled: !isNaN(categoryId),
  });

  // Fetch posts in the category
  const { 
    data: posts, 
    isLoading: isLoadingPosts 
  } = useQuery<ForumPost[]>({
    queryKey: [`/api/forum/categories/${categoryId}/posts`],
    enabled: !isNaN(categoryId),
  });

  if (isLoadingCategory || isLoadingPosts) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-navy mb-2">Category Not Found</h2>
        <p className="text-navy/70 mb-6">The category you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate("/forum")} variant="outline" className="border-navy/20">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Forums
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <Button onClick={() => navigate("/forum")} variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Forums
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-navy">{category.name}</h1>
            <p className="text-navy/70 mt-1">{category.description}</p>
          </div>
          {user && canCreateTopic && (
            <Link href={`/forum/new-post?category=${category.id}`}>
              <Button variant="default" className="bg-coral hover:bg-coral/90 text-white">
                <Plus className="mr-2 h-4 w-4" /> Create New Topic
              </Button>
            </Link>
          )}
        </div>
        
        {user && isBlocked && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 flex items-center gap-2">
            <Ban className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Your account has been blocked.</p>
              <p className="text-sm">You cannot create new topics or post comments in the forum.</p>
              {user.blockReason && (
                <p className="text-sm mt-1 italic">Reason: {user.blockReason}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {(!posts || posts.length === 0) ? (
        <div className="text-center py-12 bg-navy/5 rounded-lg">
          <MessageSquare className="h-12 w-12 mx-auto text-navy/30 mb-4" />
          <h2 className="text-xl font-bold text-navy mb-2">NO TOPICS YET</h2>
          <p className="text-navy/70 mb-6">Be the first to start a discussion in this category!</p>
          {user && canCreateTopic && (
            <Link href={`/forum/new-post?category=${category.id}`}>
              <Button variant="default" className="bg-coral hover:bg-coral/90 text-white">
                <Plus className="mr-2 h-4 w-4" /> Create First Topic
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <Card key={post.id} className="border border-navy/10 transition-all hover:shadow-md">
              <CardHeader className="pb-2">
                <Link href={`/forum/post/${post.id}`}>
                  <CardTitle className="text-xl font-bold text-navy cursor-pointer hover:text-coral transition-colors">
                    {post.title}
                  </CardTitle>
                </Link>
              </CardHeader>
              <CardContent className="pb-2">
                <p className="text-navy/70 line-clamp-2">
                  {post.content.replace(/<[^>]*>/g, '')}
                </p>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-navy/5 bg-navy/5 py-3 px-6">
                <div className="flex items-center text-navy/70">
                  <User className="h-4 w-4 mr-2" />
                  <span className="mr-4">{post.author.username}</span>
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    {(() => {
                      try {
                        // Verify date string is valid
                        const timestamp = Date.parse(post.createdAt);
                        if (isNaN(timestamp)) {
                          console.error("Invalid post.createdAt date in category view:", post.createdAt);
                          return "Invalid date";
                        }
                        
                        const dateObj = new Date(timestamp);
                        if (isNaN(dateObj.getTime())) {
                          console.error("Invalid date object after parsing post.createdAt in category view:", post.createdAt);
                          return "Invalid date";
                        }
                        
                        return format(dateObj, 'MMM d, yyyy h:mm a');
                      } catch (error) {
                        console.error("Date formatting error for post.createdAt in category view:", error);
                        return "Invalid date";
                      }
                    })()}
                  </span>
                </div>
                <div className="flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2 text-navy/70" />
                  <span className="text-navy/70 mr-4">{post.commentCount || 0}</span>
                  <Link href={`/forum/post/${post.id}`}>
                    <Button variant="outline" size="sm" className="border-navy/20 hover:bg-coral/10 hover:text-coral hover:border-coral">
                      View
                    </Button>
                  </Link>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}