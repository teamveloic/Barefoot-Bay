import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader } from "lucide-react";

export default function PaymentCompletePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<"success" | "error" | "processing">("processing");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  
  // Parse the query parameters (Square will redirect back with parameters)
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const orderId = searchParams.get("orderId");
  const paymentLinkId = searchParams.get("checkoutId");
  const referenceId = searchParams.get("referenceId");
  const transactionId = searchParams.get("transactionId"); // Square sometimes returns this
  
  // Verify payment status mutation
  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      // Determine which ID to use
      const paymentIdentifier = paymentLinkId || orderId || referenceId || transactionId;
      
      if (!paymentIdentifier) {
        throw new Error("No payment identifier found in URL");
      }
      
      const response = await apiRequest("POST", "/api/payments/verify", {
        paymentIntentId: paymentIdentifier,
        transactionId: transactionId,
        orderId: orderId
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to verify payment status");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPaymentId(data.paymentId);
        setStatus(data.status === 'completed' ? 'success' : 'processing');
        
        if (data.status === 'completed') {
          toast({
            title: "Payment Successful",
            description: "Your payment has been completed successfully."
          });
        }
      } else {
        setStatus("error");
        toast({
          title: "Payment Verification Failed",
          description: data.message || "We couldn't verify your payment status.",
          variant: "destructive"
        });
      }
      setIsLoading(false);
    },
    onError: (error: Error) => {
      console.error("Payment verification error:", error);
      setStatus("error");
      toast({
        title: "Payment Verification Error",
        description: error.message || "We couldn't verify your payment status.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  });
  
  // Handle payment success
  const handlePaymentSuccess = useMutation({
    mutationFn: async () => {
      // Determine which ID to use
      const paymentIdentifier = paymentLinkId || orderId || referenceId;
      
      if (!paymentIdentifier) {
        throw new Error("No payment identifier found in URL");
      }
      
      const response = await apiRequest("POST", "/api/payments/success", {
        paymentIntentId: paymentIdentifier
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to process payment");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPaymentId(data.paymentId);
        setStatus("success");
        toast({
          title: "Payment Successful",
          description: "Your payment has been processed successfully."
        });
      } else {
        setStatus("error");
        toast({
          title: "Payment Processing Failed",
          description: data.message || "We couldn't process your payment.",
          variant: "destructive"
        });
      }
      setIsLoading(false);
    },
    onError: (error: Error) => {
      console.error("Payment processing error:", error);
      setStatus("error");
      toast({
        title: "Payment Processing Error",
        description: error.message || "We couldn't process your payment.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  });
  
  // Check if we were redirected from Square
  useEffect(() => {
    console.log("PaymentCompletePage mounted");
    console.log("Current location:", window.location.href);
    console.log("Query parameters:", { 
      orderId, 
      paymentLinkId, 
      referenceId, 
      transactionId,
      fullSearch: window.location.search 
    });
    
    // Check if we're on localhost but should be on Replit
    if (typeof window !== 'undefined' && 
        window.location.origin.includes('localhost') && 
        import.meta.env.REPLIT_DEPLOYMENT_ID) {
      // We're on localhost but running in a Replit deployment
      // Construct the correct Replit URL
      const replitUrl = `https://${import.meta.env.REPLIT_DEPLOYMENT_ID}-00-y43hx7t2mc3m.janeway.replit.dev`;
      const redirectUrl = `${replitUrl}${window.location.pathname}${window.location.search}`;
      
      console.log(`Redirecting from localhost to Replit URL: ${redirectUrl}`);
      window.location.href = redirectUrl;
      return;
    }

    if (!user) {
      // We need to be authenticated to verify payment
      navigate("/auth?redirect=" + encodeURIComponent(location));
      return;
    }
    
    // Start the payment verification
    if (orderId || paymentLinkId || referenceId || transactionId) {
      console.log("Attempting to verify payment with:", { orderId, paymentLinkId, referenceId, transactionId });
      verifyPaymentMutation.mutate();
    } else {
      // No payment identifiers found in the URL
      setStatus("error");
      setIsLoading(false);
      toast({
        title: "Payment Information Missing",
        description: "No payment information was found in the URL.",
        variant: "destructive"
      });
    }
  }, [user, location, navigate, orderId, paymentLinkId, referenceId, transactionId]);
  
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md my-12">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2">Payment Status</h1>
        <p className="text-muted-foreground">
          {isLoading
            ? "Checking your payment status..."
            : status === "success"
            ? "Your payment has been successfully processed."
            : status === "processing"
            ? "Your payment is still being processed."
            : "There was an issue with your payment."}
        </p>
      </div>
      
      <div className="flex justify-center my-8">
        {isLoading ? (
          <div className="bg-blue-50 p-6 rounded-full">
            <Loader className="h-16 w-16 text-blue-500 animate-spin" />
          </div>
        ) : status === "success" ? (
          <div className="bg-green-50 p-6 rounded-full">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
        ) : status === "processing" ? (
          <div className="bg-yellow-50 p-6 rounded-full">
            <Loader className="h-16 w-16 text-yellow-500 animate-spin" />
          </div>
        ) : (
          <div className="bg-red-50 p-6 rounded-full">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        {status === "success" && (
          <div className="bg-green-50 p-4 rounded-md border border-green-100">
            <p className="text-green-800 text-sm">
              Your payment has been successfully processed. You can now create your listing.
            </p>
            {/* Show discount code if one was used */}
            {referenceId && referenceId.includes("FREESHOP100") && (
              <p className="text-green-800 text-xs mt-2">
                <span className="font-semibold">Discount applied:</span> FREESHOP100 (100% off)
              </p>
            )}
            {referenceId && referenceId.includes("ALMOSTFREE99") && (
              <p className="text-green-800 text-xs mt-2">
                <span className="font-semibold">Discount applied:</span> ALMOSTFREE99 (99% off)
              </p>
            )}
            {referenceId && referenceId.includes("HALFSHOP50") && (
              <p className="text-green-800 text-xs mt-2">
                <span className="font-semibold">Discount applied:</span> HALFSHOP50 (50% off)
              </p>
            )}
          </div>
        )}
        
        {status === "processing" && (
          <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100">
            <p className="text-yellow-800 text-sm">
              Your payment is still being processed. This may take a few moments.
            </p>
            <div className="mt-3">
              <Button
                onClick={() => verifyPaymentMutation.mutate()}
                disabled={verifyPaymentMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {verifyPaymentMutation.isPending ? "Checking..." : "Check Payment Status"}
              </Button>
            </div>
          </div>
        )}
        
        {status === "error" && (
          <div className="bg-red-50 p-4 rounded-md border border-red-100">
            <p className="text-red-800 text-sm">
              There was an issue with your payment. Please try again or contact support.
            </p>
          </div>
        )}
        
        <div className="pt-4">
          <Button
            onClick={() => navigate("/for-sale")}
            className="w-full"
          >
            Return to For Sale Listings
          </Button>
        </div>
        
        {status === "success" && (
          <div className="pt-2">
            <Button
              onClick={() => navigate("/for-sale/create?paymentId=" + paymentId)}
              variant="outline"
              className="w-full"
            >
              Create Your Listing Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}