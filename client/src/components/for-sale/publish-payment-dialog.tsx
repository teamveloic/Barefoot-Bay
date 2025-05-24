import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

// Add window type for Square SDK
declare global {
  interface Window {
    Square?: any;
  }
}

interface PublishPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: number;
  onPublishSuccess: (listing: any) => void;
}

// Square payment form component
function SquarePaymentForm({ listingId, onPublishSuccess, onClose }: { 
  listingId: number; 
  onPublishSuccess: (listing: any) => void;
  onClose: () => void;
}) {
  const paymentFormRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<string>('7_day');
  const [priceDisplay, setPriceDisplay] = useState<string>('$10.00');
  const [card, setCard] = useState<any>(null);
  const [isSquareLoaded, setIsSquareLoaded] = useState(false);
  const [isPaymentFormReady, setIsPaymentFormReady] = useState(false);

  // Update price display when duration changes
  useEffect(() => {
    switch(selectedDuration) {
      case '3_day':
        setPriceDisplay('$5.00');
        break;
      case '7_day':
        setPriceDisplay('$10.00');
        break;
      case '30_day':
        setPriceDisplay('$25.00');
        break;
      default:
        setPriceDisplay('$10.00');
    }
  }, [selectedDuration]);

  // Initialize the Square payment form
  useEffect(() => {
    // This loads the Square JS SDK
    const loadSquareSdk = async () => {
      try {
        // Create a script element - dynamically set based on environment
        const script = document.createElement('script');
        // We'll load the right SDK depending on what the server tells us (production or sandbox)
        script.src = 'https://web.squarecdn.com/v1/square.js';
        script.async = true;
        script.onload = () => {
          console.log('Square SDK loaded successfully');
          setIsSquareLoaded(true);
        };
        script.onerror = () => {
          console.error('Failed to load Square SDK');
          toast({
            title: 'Error',
            description: 'Failed to load payment system. Please try again later.',
            variant: 'destructive'
          });
        };
        document.body.appendChild(script);
      } catch (error) {
        console.error('Error loading Square SDK:', error);
      }
    };

    loadSquareSdk();

    // Cleanup function to remove the script
    return () => {
      const script = document.querySelector('script[src="https://web.squarecdn.com/v1/square.js"]');
      if (script) {
        document.body.removeChild(script);
      }
    };
  }, [toast]);

  // Initialize Square payment form when SDK is loaded
  useEffect(() => {
    const initializeSquarePayment = async () => {
      if (!isSquareLoaded || !window.Square || !paymentFormRef.current) {
        return;
      }

      try {
        // First, fetch Square application ID from the server
        const appIdResponse = await apiRequest('GET', '/api/square/app-info');
        const appIdData = await appIdResponse.json();

        if (!appIdData.applicationId || !appIdData.locationId) {
          toast({
            title: 'Configuration Error',
            description: 'Payment system is not properly configured.',
            variant: 'destructive'
          });
          return;
        }

        // Initialize Square with the application ID
        const payments = window.Square.payments(appIdData.applicationId, appIdData.locationId);
        
        // Create a card payment method
        const newCard = await payments.card();
        setCard(newCard);
        
        // Attach the card payment method to the form
        await newCard.attach('#card-container');
        setIsPaymentFormReady(true);
      } catch (error) {
        console.error('Error initializing Square payment:', error);
        toast({
          title: 'Payment Error',
          description: 'Could not initialize payment form. Please try again later.',
          variant: 'destructive'
        });
      }
    };

    initializeSquarePayment();
  }, [isSquareLoaded, toast]);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!card || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      // Create a payment request for the listing
      const paymentResponse = await apiRequest('POST', `/api/listings/${listingId}/create-publish-payment`, {
        listingDuration: selectedDuration
      });
      
      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        throw new Error(errorData.message || 'Failed to create payment request');
      }
      
      const paymentData = await paymentResponse.json();
      
      // Get a payment token from Square
      const result = await card.tokenize();
      
      if (result.status === 'OK') {
        // Process the payment with the source ID (payment token)
        const publishResponse = await apiRequest('POST', `/api/listings/${listingId}/publish-with-square`, {
          sourceId: result.token,
          listingDuration: selectedDuration,
          amount: paymentData.amount
        });
        
        if (!publishResponse.ok) {
          const errorData = await publishResponse.json();
          throw new Error(errorData.message || 'Payment processing failed');
        }
        
        const publishData = await publishResponse.json();
        
        if (publishData.success) {
          toast({
            title: 'Payment Successful',
            description: 'Your listing has been published successfully!',
          });
          onPublishSuccess(publishData.listing);
        } else {
          throw new Error(publishData.message || 'Failed to publish listing');
        }
      } else {
        throw new Error(result.errors[0].message || 'Card tokenization failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: 'Payment Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <RadioGroup 
        value={selectedDuration} 
        onValueChange={setSelectedDuration}
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <div>
          <RadioGroupItem 
            value="3_day" 
            id="option-3-day" 
            className="peer sr-only" 
            disabled={isProcessing}
          />
          <Label 
            htmlFor="option-3-day" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <span className="text-lg font-semibold">3 Days</span>
            <span className="text-2xl font-bold">$5.00</span>
          </Label>
        </div>
        
        <div>
          <RadioGroupItem 
            value="7_day" 
            id="option-7-day" 
            className="peer sr-only" 
            disabled={isProcessing}
          />
          <Label 
            htmlFor="option-7-day" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <span className="text-lg font-semibold">7 Days</span>
            <span className="text-2xl font-bold">$10.00</span>
          </Label>
        </div>
        
        <div>
          <RadioGroupItem 
            value="30_day" 
            id="option-30-day" 
            className="peer sr-only" 
            disabled={isProcessing}
          />
          <Label 
            htmlFor="option-30-day" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <span className="text-lg font-semibold">30 Days</span>
            <span className="text-2xl font-bold">$25.00</span>
          </Label>
        </div>
      </RadioGroup>

      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
          <CardDescription>
            Enter your card information to publish your listing for {selectedDuration.replace('_', ' ')}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div id="card-container" ref={paymentFormRef} className="min-h-[100px] p-4 border rounded-md"></div>
            {!isPaymentFormReady && isSquareLoaded && (
              <div className="flex items-center justify-center py-4">
                <Spinner size="md" /> <span className="ml-2">Loading payment form...</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose} 
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isProcessing || !isPaymentFormReady}
          >
            {isProcessing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Processing...
              </>
            ) : (
              `Pay ${priceDisplay} & Publish`
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export const PublishPaymentDialog: React.FC<PublishPaymentDialogProps> = ({ 
  isOpen, 
  onClose, 
  listingId, 
  onPublishSuccess 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish Your Listing</DialogTitle>
          <DialogDescription>
            Choose how long you want your listing to be published and complete payment to make it live.
          </DialogDescription>
        </DialogHeader>
        
        <SquarePaymentForm
          listingId={listingId}
          onPublishSuccess={onPublishSuccess}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
};

export default PublishPaymentDialog;