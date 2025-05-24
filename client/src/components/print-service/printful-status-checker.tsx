import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Package } from 'lucide-react';

type PrintfulStatus = {
  code: number;
  result: {
    connected: boolean;
    storeInfo: {
      id: string;
      name: string;
      website?: string;
      created: string;
    } | null;
    catalogCount: number;
    error?: string;
  };
};

export default function PrintfulStatusChecker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PrintfulStatus | null>(null);
  
  const checkStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use fetch directly for better error handling in this diagnostic component
      const response = await fetch('/api/printful/test');
      
      if (!response.ok) {
        throw new Error(`Failed to check Printful status: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setStatus(data);
      console.log('Printful status:', data);
    } catch (err) {
      console.error('Error checking Printful status:', err);
      setError(err instanceof Error ? err.message : 'Failed to check Printful status');
    } finally {
      setLoading(false);
    }
  };
  
  const StatusIndicator = ({ value, label }: { value: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      {value ? (
        <CheckCircle2 className="text-green-500" size={18} />
      ) : (
        <XCircle className="text-red-500" size={18} />
      )}
      <span>{label}</span>
    </div>
  );
  
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Package className="h-5 w-5 mr-2" />
          Printful Integration Status
        </CardTitle>
        <CardDescription>
          Check the status of the Printful print-on-demand service integration
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex justify-end">
          <Button 
            onClick={checkStatus}
            disabled={loading}
            variant="outline"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check Status
          </Button>
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {status && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Connection Status</h3>
                <StatusIndicator 
                  value={status.result.connected} 
                  label="API Connected" 
                />
                <StatusIndicator 
                  value={!!status.result.storeInfo} 
                  label="Store Information Available" 
                />
                <StatusIndicator 
                  value={status.result.catalogCount > 0} 
                  label="Product Catalog Available" 
                />
              </div>
              
              {status.result.storeInfo && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Store Information</h3>
                  <p><strong>Store ID:</strong> {status.result.storeInfo.id}</p>
                  <p><strong>Store Name:</strong> {status.result.storeInfo.name}</p>
                  <p><strong>Creation Date:</strong> {new Date(status.result.storeInfo.created).toLocaleDateString()}</p>
                  {status.result.storeInfo.website && (
                    <p><strong>Website:</strong> {status.result.storeInfo.website}</p>
                  )}
                </div>
              )}
            </div>
            
            {status.result.catalogCount > 0 && (
              <div className="pt-2 border-t">
                <h3 className="text-sm font-medium mb-2">Product Catalog</h3>
                <p>
                  <strong>Available Products:</strong> {status.result.catalogCount}
                </p>
              </div>
            )}
            
            {status.result.error && (
              <Alert variant="destructive">
                <AlertTitle>API Connection Error</AlertTitle>
                <AlertDescription className="break-all">
                  {status.result.error}
                </AlertDescription>
              </Alert>
            )}
            
            {!status.result.connected && (
              <Alert variant="destructive">
                <AlertTitle>Printful API Connection Problem</AlertTitle>
                <AlertDescription>
                  The server cannot connect to the Printful API. This is typically caused by:
                  <ul className="list-disc ml-6 mt-2">
                    <li>Invalid API key</li>
                    <li>Expired API key</li>
                    <li>Restricted API permissions</li>
                    <li>Printful service disruption</li>
                  </ul>
                  Please update your Printful API key in the settings below.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}