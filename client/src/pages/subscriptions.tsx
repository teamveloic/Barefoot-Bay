import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/components/providers/auth-provider';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

// Layout components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Completely rewritten without using ProtectedRoute to diagnose and fix the issue
export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const { user, isLoading: isUserLoading } = useAuth();
  const [location, navigate] = useLocation();

  // Fetch subscription status
  useEffect(() => {
    // If no user is logged in, redirect to login page
    if (!isUserLoading && !user) {
      navigate('/auth');
      return;
    }

    // Skip API calls if we're still loading the user
    if (isUserLoading) {
      return;
    }

    const fetchSubscription = async () => {
      try {
        setLoading(true);
        // Use the object-based syntax for apiRequest
        const response = await apiRequest({
          method: 'GET',
          url: '/api/subscriptions/status'
        });
        const data = await response.json();
        console.log('Subscription response:', data);
        console.log('Subscription status:', data?.subscription?.status);
        console.log('Subscription details:', JSON.stringify(data?.subscription, null, 2));
        setSubscription(data);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching subscription:', err);
        setError(err.message || 'Failed to load subscription');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [user, isUserLoading, navigate]);

  // Handle subscription creation
  const handleCreateSubscription = async () => {
    try {
      setLoading(true);
      const response = await apiRequest({
        method: 'POST',
        url: '/api/subscriptions/create-checkout',
        body: { planType: selectedPlan }
      });
      
      const data = await response.json();
      console.log('Checkout response:', data);
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      console.error('Error creating subscription:', err);
      setError(err.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  // Handle subscription cancellation
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelSubscription = async () => {
    // Check if subscription is already cancelled
    const isAlreadyCancelled = subscription?.subscription?.status === 'cancelled';
    
    // Show different confirmation message based on current status
    let confirmMessage = 'Are you sure you want to cancel your subscription? You will still have access until the end of your current billing period.';
    let endpoint = '/api/subscriptions/cancel';
    
    if (isAlreadyCancelled) {
      confirmMessage = 'Are you sure you want to completely cancel your subscription now? You will lose access immediately and need to subscribe again.';
      endpoint = '/api/subscriptions/expire-now';
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setCancelling(true);
      setCancelError(null);
      
      const response = await apiRequest({
        method: 'POST',
        url: endpoint
      });
      
      const data = await response.json();
      console.log('Cancel subscription response:', data);
      
      if (data.success) {
        // Update local subscription data
        if (subscription) {
          if (isAlreadyCancelled) {
            // If we're expiring an already-cancelled subscription, 
            // we'll reload the page to show the subscription options
            window.location.reload();
          } else {
            // Otherwise just update the status to cancelled
            setSubscription({
              ...subscription,
              subscription: {
                ...subscription.subscription,
                status: 'cancelled'
              }
            });
          }
        }
      } else {
        setCancelError(data.message || 'Failed to update subscription');
      }
    } catch (err: any) {
      console.error('Error updating subscription:', err);
      setCancelError(err.message || 'Failed to update subscription');
    } finally {
      setCancelling(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // If we're still loading the user, show a loading indicator
  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no user is logged in, the useEffect will handle redirection
  if (!user) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Premium Sponsorship | Barefoot Bay</title>
      </Helmet>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Premium Sponsorship</h1>
          <p className="text-muted-foreground">
            Manage your Barefoot Bay Premium Sponsorship
          </p>
        </div>
        <Separator />
        
        <div className="grid grid-cols-1 gap-6">
          {/* Simplified Subscription Manager */}
          <Card className="w-full">
            {loading ? (
              <CardContent className="py-6 flex justify-center items-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span>Loading subscription details...</span>
              </CardContent>
            ) : error ? (
              <CardContent className="py-6">
                <div className="flex items-center text-destructive mb-2">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  <p className="font-medium">Error loading subscription</p>
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
              </CardContent>
            ) : subscription?.success && subscription?.subscription?.subscriptionId && subscription?.subscription?.status !== 'expired' ? (
              <>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                      Premium Sponsor
                    </CardTitle>
                    <Badge variant="outline" className={
                      subscription.subscription.status === 'active' ? "bg-green-50 text-green-700 hover:bg-green-50" :
                      subscription.subscription.status === 'cancelled' ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-50" :
                      "bg-gray-50 text-gray-700 hover:bg-gray-50"
                    }>
                      {subscription.subscription.status === 'active' ? 'Active' : 
                       subscription.subscription.status === 'cancelled' ? 'Cancelling' : 
                       subscription.subscription.status || 'Unknown'}
                    </Badge>
                  </div>
                  <CardDescription>
                    Your Premium Sponsorship gives you access to exclusive features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p>Sponsorship Type: {subscription.subscription.type || 'Unknown'}</p>
                    <p>Next Billing Date: {formatDate(subscription.subscription.endDate)}</p>
                    
                    {/* Only show the cancel button if not already expired */}
                    <div className="mt-4 pt-2 border-t">
                      <Button 
                        variant="destructive" 
                        onClick={handleCancelSubscription}
                        disabled={cancelling}
                      >
                        {cancelling ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          subscription.subscription.status === 'cancelled' ? 
                          'End Sponsorship Now' : 
                          'Cancel Sponsorship'
                        )}
                      </Button>
                    </div>
                    
                    {/* Only show error message if there is one */}
                    {cancelError && (
                      <div className="mt-2 text-destructive text-sm flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {cancelError}
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  {/* Show message if already cancelled */}
                  {subscription.subscription.status === 'cancelled' && (
                    <p className="text-sm text-muted-foreground">
                      Your sponsorship has been cancelled but will remain active until {formatDate(subscription.subscription.endDate)}.
                    </p>
                  )}
                </CardFooter>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>Become a Premium Sponsor</CardTitle>
                  <CardDescription>
                    Support our community and get access to exclusive features with a Premium Sponsorship
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Premium Benefits:</h3>
                      <ul className="space-y-2 mt-2">
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Access to exclusive community content
                        </li>
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Check "Like", "I'm interested", "I'm going"
                        </li>
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Ability to Leave Comments
                        </li>
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Additional Posting Privileges
                        </li>
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Annual Recognition as a Premium Sponsor
                        </li>
                        <li className="flex items-center">
                          <div className="mr-2 h-4 w-4 text-green-500">✓</div>
                          Special Invitations to Sponsor-only events
                        </li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-medium">Select a plan:</h3>
                      <div className="flex space-x-4 mt-2">
                        <Button 
                          variant={selectedPlan === 'monthly' ? 'default' : 'outline'}
                          onClick={() => setSelectedPlan('monthly')}
                        >
                          Monthly ($5)
                        </Button>
                        <Button 
                          variant={selectedPlan === 'annual' ? 'default' : 'outline'}
                          onClick={() => setSelectedPlan('annual')}
                        >
                          Annual ($50)
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button onClick={handleCreateSubscription}>
                    Become a Sponsor
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Sponsorship FAQ</CardTitle>
              <CardDescription>
                Common questions about Barefoot Bay Premium Sponsorships
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold">What is a Premium Sponsorship?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Premium Sponsorship gives you access to exclusive content, ability to leave comments and reactions,
                  additional posting privileges, recognition as a Premium Sponsor, and special event invitations.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold">How does billing work?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Premium Sponsorships are available in monthly ($5/month) or annual ($50/year) options.
                  This is a one-time payment - after your sponsorship period ends, you will need to purchase another plan to continue enjoying premium benefits.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold">Can I cancel my sponsorship?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Yes, you can cancel your sponsorship at any time. Your premium benefits will
                  remain active until the end of your current sponsorship period. After that, you'll need to purchase a new sponsorship to regain premium benefits.
                </p>
              </div>
              

            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}