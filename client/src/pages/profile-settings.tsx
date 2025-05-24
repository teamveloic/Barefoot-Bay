import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Camera, CreditCard, Calendar, AlertCircle, Store } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import UserSubscriptionManager from "@/components/membership/user-subscription-manager";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { usePermissions } from "@/hooks/use-permissions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  avatarUrl: z.string().url().optional().nullable(),
  isResident: z.boolean().default(false),
  residentTags: z.array(z.string()).default([]),
  role: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ProfileSettings() {
  const { user, updateProfileMutation } = useAuth();
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [tagInputValue, setTagInputValue] = useState(''); // Add state for tag input

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      username: user?.username || "",
      email: user?.email || "",
      avatarUrl: user?.avatarUrl || null,
      isResident: user?.isResident || false,
      residentTags: user?.residentTags || [],
      role: user?.role,
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        isResident: user.isResident,
        residentTags: user.residentTags || [],
        role: user.role,
      });
    }
  }, [user, form]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) throw new Error("Failed to upload image");

      const data = await response.json();

      if (data.success) {
        form.setValue("avatarUrl", data.url);
        queryClient.setQueryData(["/api/user"], data.user);
        toast({
          title: "Success",
          description: data.message,
        });
      } else {
        throw new Error(data.message || "Failed to upload image");
      }
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload profile photo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Profile update is now handled directly in the Save Changes button click handler

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      const response = await fetch("/api/user/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update password");
      }

      passwordForm.reset();
      setShowPasswordReset(false);
      toast({
        title: "Success",
        description: "Password updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    }
  };

  // Add query for user subscription
  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ['/api/subscriptions/status'],
    enabled: Boolean(user),
  });

  // Mutation for creating a new subscription
  const createSubscriptionMutation = useMutation({
    mutationFn: async (planType: string) => {
      console.log('Creating subscription with plan type:', planType);
      // Plan type must match exactly what the server expects in MEMBERSHIP_PLANS
      // The server enum uses lowercase strings 'monthly' and 'annual'
      const validPlanType = planType.toLowerCase();
      console.log('Sending validated plan type:', validPlanType);
      
      return await apiRequest('POST', '/api/subscriptions/create', { 
        planType: validPlanType,
        redirectUrl: window.location.origin + '/profile' // Add default redirect URL
      });
    },
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        console.log('Redirecting to checkout URL:', data.checkoutUrl);
        // Redirect to Square checkout page
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          title: "Subscription Started",
          description: "Your subscription has been created successfully. Your status will be updated shortly.",
        });
        // Invalidate the query to refresh subscription data
        queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/status'] });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create subscription",
        variant: "destructive",
      });
    }
  });

  // Mutation for canceling a subscription
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/subscriptions/cancel', {});
    },
    onSuccess: () => {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled successfully. You will retain access until the end of your billing period.",
      });
      // Invalidate the query to refresh subscription data
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/status'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel subscription",
        variant: "destructive",
      });
    }
  });

  const handleSubscribe = (planType: string) => {
    createSubscriptionMutation.mutate(planType);
  };

  const handleCancelSubscription = () => {
    if (window.confirm("Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.")) {
      cancelSubscriptionMutation.mutate();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Profile Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>
            Update your profile information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form 
              className="space-y-6"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage 
                    src={form.watch("avatarUrl") || undefined} 
                    alt={user?.username} 
                    className="object-cover"
                  />
                  <AvatarFallback>
                    {user?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex items-center gap-2"
                    disabled={isUploading}
                    asChild
                  >
                    <label htmlFor="avatar-upload" className="cursor-pointer">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                      Change Photo
                    </label>
                  </Button>
                  <Input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAdmin && (
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UserRole.REGISTERED}>Registered User</SelectItem>
                          <SelectItem value={UserRole.PAID}>Paid User</SelectItem>
                          <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="isResident"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isAdmin}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        I am a verified Barefoot Bay resident
                        {!isAdmin && (
                          <p className="text-xs text-muted-foreground mt-1">
                            This is determined by your verification questions and can only be changed by administrators.
                          </p>
                        )}
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="residentTags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resident Tags</FormLabel>
                    <FormDescription>
                      Add tags related to your interests or areas within Barefoot Bay
                    </FormDescription>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
                        {Array.isArray(field.value) && field.value.length > 0 ? (
                          field.value.map((tag, index) => (
                            <Badge 
                              key={index} 
                              variant="secondary"
                              className="px-3 py-1 text-sm flex items-center gap-1 bg-primary text-white hover:bg-white hover:text-primary transition-colors"
                            >
                              {tag}
                              <button
                                type="button"
                                className="text-white hover:text-primary ml-1 rounded-full"
                                onClick={() => {
                                  const newTags = [...field.value];
                                  newTags.splice(index, 1);
                                  field.onChange(newTags);
                                }}
                                aria-label={`Remove tag ${tag}`}
                              >
                                <svg 
                                  xmlns="http://www.w3.org/2000/svg" 
                                  width="14" 
                                  height="14" 
                                  viewBox="0 0 24 24" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  strokeWidth="2" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                  className="h-3 w-3"
                                >
                                  <path d="M18 6 6 18"></path>
                                  <path d="m6 6 12 12"></path>
                                </svg>
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground italic">No tags added yet</div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            placeholder="Add a new tag (e.g., Golf, Tennis, Lakeside)"
                            value={tagInputValue}
                            onChange={(e) => setTagInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && tagInputValue.trim()) {
                                e.preventDefault();
                                const newTag = tagInputValue.trim();
                                if (!field.value.includes(newTag)) {
                                  const newTags = [...field.value, newTag];
                                  field.onChange(newTags);
                                }
                                setTagInputValue('');
                              }
                            }}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (tagInputValue.trim() && !field.value.includes(tagInputValue.trim())) {
                              const newTags = [...field.value, tagInputValue.trim()];
                              field.onChange(newTags);
                              setTagInputValue('');
                            }
                          }}
                          disabled={!tagInputValue.trim()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                className="w-full"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  
                  try {
                    const currentValues = form.getValues();
                    
                    const updateData = {
                      fullName: currentValues.fullName,
                      username: currentValues.username,
                      email: currentValues.email,
                      isResident: !!currentValues.isResident,
                      residentTags: currentValues.residentTags || [],
                      role: currentValues.role
                    };
                    
                    const response = await fetch("/api/user", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify(updateData)
                    });
                    
                    if (!response.ok) {
                      const errorText = await response.text();
                      throw new Error(`Server error (${response.status}): ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    if (result.success) {
                      // Update cached data
                      queryClient.setQueryData(["/api/user"], result.user);
                      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                      
                      toast({
                        title: "Success",
                        description: "Profile updated successfully",
                      });
                    } else {
                      throw new Error(result.message || "Failed to update profile");
                    }
                  } catch (error) {
                    console.error("Profile update error:", error);
                    toast({
                      title: "Error",
                      description: error instanceof Error ? error.message : "Failed to update profile",
                      variant: "destructive",
                    });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Password Reset Section */}
      <Card>
        <CardHeader>
          <CardTitle>Password Reset</CardTitle>
          <CardDescription>
            Change your account password
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showPasswordReset ? (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button type="submit">Update Password</Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowPasswordReset(false);
                      passwordForm.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <Button onClick={() => setShowPasswordReset(true)}>
              Change Password
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}