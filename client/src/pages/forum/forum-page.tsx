import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  Plus,
  Loader2,
  Settings,
  Edit,
  Save,
  X
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface ForumCategory {
  id: number;
  name: string;
  description: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  postCount: number;
}

interface ForumDescription {
  id: number;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function ForumPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = usePermissions();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  
  // Fetch forum categories
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useQuery<ForumCategory[]>({
    queryKey: ["/api/forum/categories"],
  });
  
  // Fetch forum description
  const { 
    data: description, 
    isLoading: descriptionLoading, 
    error: descriptionError 
  } = useQuery<ForumDescription>({
    queryKey: ["/api/forum/description"],
  });

  // Effect to set description text when the description data is loaded
  useEffect(() => {
    if (description) {
      setDescriptionText(description.content || "");
    }
  }, [description]);
  
  // Mutation for updating the forum description
  const updateDescriptionMutation = useMutation({
    mutationFn: (content: string) => {
      return apiRequest("POST", "/api/forum/description", { 
        content,
        updatedBy: user?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/description"] });
      setIsEditingDescription(false);
      toast({
        title: "Success",
        description: "Forum description updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update forum description",
        variant: "destructive",
      });
      console.error("Error updating forum description:", error);
    }
  });

  if (categoriesLoading || descriptionLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
      </div>
    );
  }

  if (categoriesError) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-navy mb-2">Something went wrong</h2>
        <p className="text-navy/70">We couldn't load the forum categories. Please try again later.</p>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-navy mb-2">No Categories Found</h2>
        <p className="text-navy/70 mb-6">There are no forum categories available at this time.</p>
        {/* Create First Category button removed */}
      </div>
    );
  }

  // Handle description save
  const handleSaveDescription = () => {
    updateDescriptionMutation.mutate(descriptionText);
  };
  
  // Handle description cancel
  const handleCancelEdit = () => {
    setDescriptionText(description?.content || "");
    setIsEditingDescription(false);
  };
  
  return (
    <div className="max-w-5xl mx-auto">
      {/* Desktop header */}
      <div className="hidden md:flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-navy">Community Forum</h1>
        <div className="flex gap-3">
          {isAdmin && (
            <Link href="/admin/manage-forum">
              <Button variant="outline" className="border-navy/20 hover:bg-coral/10 hover:text-coral hover:border-coral">
                <Settings className="mr-2 h-4 w-4" /> Manage Forum
              </Button>
            </Link>
          )}
          {/* Create New Topic button removed */}
        </div>
      </div>
      
      {/* Forum Description */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          {!isEditingDescription ? (
            <div className="relative">
              <div className="prose max-w-none">
                {description?.content ? (
                  <div dangerouslySetInnerHTML={{ __html: description.content }} />
                ) : (
                  <p className="text-navy/50 italic">
                    {isAdmin 
                      ? "No forum description available. Click edit to add one." 
                      : ""}
                  </p>
                )}
              </div>
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="absolute right-0 top-0 text-navy/50 hover:text-coral hover:bg-transparent"
                  onClick={() => setIsEditingDescription(true)}
                >
                  <Edit className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Enter a description for the forum..."
                className="min-h-[120px]"
              />
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCancelEdit}
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleSaveDescription}
                  disabled={updateDescriptionMutation.isPending}
                >
                  {updateDescriptionMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving</>
                  ) : (
                    <><Save className="h-4 w-4 mr-1" /> Save</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Mobile floating action button removed */}

      <div className="grid gap-6">
        {categories.map((category) => (
          <Card key={category.id} className="border border-navy/10 transition-all hover:shadow-md">
            <CardHeader>
              <Link href={`/forum/category/${category.id}`}>
                <CardTitle className="text-xl font-bold text-navy cursor-pointer hover:text-coral transition-colors">
                  {category.name}
                </CardTitle>
              </Link>
              <CardDescription className="text-navy/70">
                {category.description}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-between border-t border-navy/5 bg-navy/5 py-3 px-6">
              <div className="flex items-center text-navy/70">
                <MessageSquare className="h-4 w-4 mr-2" />
                <span>{category.postCount || 0} {category.postCount === 1 ? 'topic' : 'topics'}</span>
              </div>
              <Link href={`/forum/category/${category.id}`}>
                <Button variant="outline" size="sm" className="border-navy/20 hover:bg-coral/10 hover:text-coral hover:border-coral">
                  View
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}