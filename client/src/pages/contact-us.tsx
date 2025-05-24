import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/layout/page-header";
import { CheckCircle2 } from "lucide-react";

export default function ContactUsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inquiryType, setInquiryType] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.fullName || "",
    email: user?.email || "",
    subject: "",
    message: ""
  });

  // The inquiry types available in the form
  const inquiryTypes = [
    { id: "bug-report", label: "Bug Report" },
    { id: "feature-request", label: "Feature Request" },
    { id: "feedback", label: "Other Feedback" }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inquiryType) {
      toast({
        title: "Error",
        description: "Please select an inquiry type",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/contact", {
        inquiryType,
        ...formData
      });
      
      if (!response.ok) {
        throw new Error("Failed to submit your inquiry");
      }
      
      setIsSubmitted(true);
      toast({
        title: "Submission Successful",
        description: "Your inquiry has been submitted successfully. We'll get back to you through our messaging system.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Success message after form submission
  if (isSubmitted) {
    return (
      <div className="container mx-auto px-4 py-8">
        <PageHeader title="Contact Us" />
        <Card className="max-w-2xl mx-auto mt-8">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Thank You for Your Submission!</h2>
            <p className="text-muted-foreground mb-3">
              We've received your inquiry and will get back to you soon.
            </p>
            <p className="text-muted-foreground mb-6">
              <strong>Check your messages!</strong> We've created a conversation in the messaging system where you'll receive our response.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setIsSubmitted(false)}>
                Submit Another Inquiry
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/messages'}>
                Go to Messages
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader title="Contact Us" />
      
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>How can we help you?</CardTitle>
          <CardDescription>
            Please select the type of inquiry and fill out the form below.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Inquiry Type Selection */}
            <div className="space-y-4">
              <Label>Inquiry Type</Label>
              <RadioGroup 
                value={inquiryType} 
                onValueChange={setInquiryType}
                className="flex flex-col space-y-2"
              >
                {inquiryTypes.map((type) => (
                  <div key={type.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={type.id} id={type.id} />
                    <Label htmlFor={type.id}>{type.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Only show the rest of the form if an inquiry type is selected */}
            {inquiryType && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input 
                      id="name" 
                      name="name" 
                      value={formData.name} 
                      onChange={handleInputChange} 
                      placeholder="Your name" 
                      required 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email" 
                      name="email" 
                      type="email" 
                      value={formData.email} 
                      onChange={handleInputChange} 
                      placeholder="Your email address" 
                      required 
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input 
                    id="subject" 
                    name="subject" 
                    value={formData.subject} 
                    onChange={handleInputChange} 
                    placeholder="Subject of your inquiry" 
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea 
                    id="message" 
                    name="message" 
                    value={formData.message} 
                    onChange={handleInputChange} 
                    placeholder="Please provide details about your inquiry" 
                    className="min-h-[200px]" 
                    required 
                  />
                </div>
                
                <Button type="submit" className="w-full">
                  Submit Inquiry
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}