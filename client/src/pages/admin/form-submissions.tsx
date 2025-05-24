import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { User, FormSubmission, CustomForm } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useLocation, RouteComponentProps } from 'wouter';
import { ArrowLeft, FileDown, Download, Trash2 } from 'lucide-react';
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

interface FormSubmissionWithUser extends FormSubmission {
  user?: User;
  form?: CustomForm;
  formData: Record<string, any>;
  _deletedForm?: boolean; // Indicates if the form was deleted but submissions preserved
}

// Props for the FormSubmissionsAdmin component that work with wouter routes
type FormSubmissionsAdminProps = RouteComponentProps<Record<string, string>>;

const FormSubmissionsAdmin = (props: FormSubmissionsAdminProps) => {
  const { isAdmin } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [expandedSubmission, setExpandedSubmission] = useState<number | null>(null);
  const [groupedSubmissions, setGroupedSubmissions] = useState<{ [key: string]: FormSubmissionWithUser[] }>({});
  const [allForms, setAllForms] = useState<CustomForm[]>([]);
  const [formToDelete, setFormToDelete] = useState<CustomForm | null>(null);
  const queryClient = useQueryClient();

  // Delete form mutation
  const deleteMutation = useMutation({
    mutationFn: async (formId: number) => {
      const response = await fetch(`/api/forms/${formId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete form');
      }

      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Form deleted successfully',
        description: 'The form has been removed from pages',
        variant: 'default',
      });
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/form-submissions'] });
      
      // Close the delete dialog
      setFormToDelete(null);
      
      // Refresh the page after a short delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (error) => {
      toast({
        title: 'Error deleting form',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    },
  });

  // Handle delete form
  const handleDeleteForm = (form: CustomForm) => {
    setFormToDelete(form);
  };

  // Confirm delete form
  const confirmDeleteForm = () => {
    if (formToDelete) {
      deleteMutation.mutate(formToDelete.id);
    }
  };

  // Fetch all form submissions
  const { data: submissions = [], isLoading, error } = useQuery<FormSubmission[]>({
    queryKey: ['/api/admin/form-submissions'],
    enabled: isAdmin,
  });

  // Fetch all forms
  const { data: forms = [] } = useQuery<CustomForm[]>({
    queryKey: ['/api/forms'],
    enabled: isAdmin,
  });

  // Fetch all users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to view this page",
        variant: "destructive"
      });
      navigate('/');
    }
  }, [isAdmin, navigate, toast]);

  useEffect(() => {
    if (submissions && forms && users) {
      const userMap = users.reduce((acc: Record<number, User>, user: User) => {
        acc[user.id] = user;
        return acc;
      }, {} as Record<number, User>);

      const formMap = forms.reduce((acc: Record<number, CustomForm>, form: CustomForm) => {
        acc[form.id] = form;
        return acc;
      }, {} as Record<number, CustomForm>);

      setAllForms(forms);

      // Enhance submissions with user and form data
      const enhancedSubmissions = submissions.map((submission: FormSubmission) => {
        // Ensure formData is an object
        const formData = submission.formData && typeof submission.formData === 'object' 
          ? submission.formData as Record<string, any> 
          : {} as Record<string, any>;
        
        // Handle submissions from deleted forms
        // If the form was deleted, the formId would be negative
        // If the _deletedForm flag is set, it means the form was deleted
        const formId = Math.abs(submission.formId);
        const isFromDeletedForm = submission._deletedForm || submission.formId < 0;
        
        return {
          ...submission,
          user: submission.userId ? userMap[submission.userId] : undefined,
          form: formId ? formMap[formId] : undefined,
          formData,
          _deletedForm: isFromDeletedForm
        };
      });

      // Group submissions by form
      const grouped = enhancedSubmissions.reduce((acc: Record<string, FormSubmissionWithUser[]>, submission: FormSubmissionWithUser) => {
        const formTitle = submission.form?.title || `Form ID: ${submission.formId}`;
        if (!acc[formTitle]) {
          acc[formTitle] = [];
        }
        acc[formTitle].push(submission);
        return acc;
      }, {} as Record<string, FormSubmissionWithUser[]>);

      setGroupedSubmissions(grouped);
    }
  }, [submissions, forms, users]);

  // Function to export form data as CSV
  const exportFormData = (formTitle: string, submissions: FormSubmissionWithUser[]) => {
    if (!submissions.length) return;

    // Get all possible keys from form data
    const allKeys = new Set<string>();
    submissions.forEach(submission => {
      if (submission.formData && typeof submission.formData === 'object') {
        Object.keys(submission.formData).forEach(key => allKeys.add(key));
      }
    });

    // Convert to CSV
    const headerRow = ['Submission ID', 'User', 'Email', 'Submission Date', ...Array.from(allKeys)];
    
    const rows = submissions.map(submission => {
      const basicData = [
        submission.id,
        submission.user?.username || 'Unknown',
        submission.user?.email || 'No email',
        submission.createdAt ? format(new Date(submission.createdAt), 'yyyy-MM-dd HH:mm') : 'Unknown date'
      ];

      // Add form field data
      const formFieldsData = Array.from(allKeys).map(key => {
        if (submission.formData && typeof submission.formData === 'object') {
          return submission.formData[key] || '';
        }
        return '';
      });

      return [...basicData, ...formFieldsData];
    });

    // Create CSV content
    const csvContent = [
      headerRow.join(','), 
      ...rows.map(row => row.map(cell => typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell).join(','))
    ].join('\n');

    // Create a blob and trigger a download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${formTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_submissions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderFormDataDetails = (formData: Record<string, any>) => {
    if (!formData || typeof formData !== 'object') {
      return <p>No form data available</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
        {Object.entries(formData).map(([key, value]) => (
          <div key={key} className="flex flex-col">
            <span className="font-bold text-sm text-gray-700">{key}:</span>
            <span className="text-gray-900">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!isAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Form Submissions</CardTitle>
            <CardDescription>Loading submissions data...</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>Failed to load form submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Test function to directly delete form 11
  const testDeleteForm11 = async () => {
    try {
      const formId = 11; // ID of the BBRD form
      const response = await fetch(`/api/forms/${formId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        
        toast({
          title: 'Error deleting form',
          description: errorData.message || errorData.error || 'Failed to delete form',
          variant: 'destructive',
        });
        return;
      }
      
      const result = await response.json();
      console.log('Delete result:', result);
      
      toast({
        title: 'Form deleted successfully',
        description: 'The form has been removed from pages but submissions are preserved',
        variant: 'default',
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/forms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/form-submissions'] });
      
      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error deleting form:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Test button for direct deletion */}
      <Button 
        variant="destructive" 
        className="mb-4"
        onClick={testDeleteForm11}
      >
        Test Delete Form 11 (BBRD Form)
      </Button>
      
      {/* Alert Dialog for Delete Confirmation */}
      <AlertDialog open={!!formToDelete} onOpenChange={(open) => !open && setFormToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will remove the form from all pages but form submissions will still be accessible in the admin dashboard.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteForm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Form Submissions</CardTitle>
              <CardDescription>
                Review and analyze user form submissions
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="all" 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="mb-4 flex flex-wrap">
              <TabsTrigger value="all">All Forms</TabsTrigger>
              {allForms.map(form => (
                <TabsTrigger key={form.id} value={`form-${form.id}`}>
                  {form.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle>All Form Submissions</CardTitle>
                  <CardDescription>View submissions from all forms in one place</CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(groupedSubmissions).length === 0 ? (
                    <p>No form submissions found.</p>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(groupedSubmissions).map(([formTitle, formSubmissions]) => (
                        <Card key={formTitle} className="mb-4">
                          <CardHeader className="py-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center">
                                <CardTitle className="text-lg">{formTitle}</CardTitle>
                                {formSubmissions[0]?._deletedForm && (
                                  <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200">
                                    Deleted Form
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => exportFormData(formTitle, formSubmissions)}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Export CSV
                                </Button>
                                {formSubmissions[0]?.form && !formSubmissions[0]?._deletedForm && (
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => handleDeleteForm(formSubmissions[0].form!)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Form
                                  </Button>
                                )}
                              </div>
                            </div>
                            <CardDescription>
                              {formSubmissions.length} submission{formSubmissions.length !== 1 ? 's' : ''}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className="h-[400px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Submission ID</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Submission Date</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {formSubmissions.map((submission) => (
                                    <React.Fragment key={submission.id}>
                                      <TableRow>
                                        <TableCell>{submission.id}</TableCell>
                                        <TableCell>
                                          {submission.user?.username || 'Unknown user'}<br />
                                          <span className="text-xs text-gray-500">{submission.user?.email || 'No email'}</span>
                                        </TableCell>
                                        <TableCell>
                                          {submission.createdAt ? format(new Date(submission.createdAt), 'yyyy-MM-dd HH:mm') : 'Unknown date'}
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setExpandedSubmission(expandedSubmission === submission.id ? null : submission.id)}
                                          >
                                            {expandedSubmission === submission.id ? 'Hide Details' : 'View Details'}
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                      {expandedSubmission === submission.id && (
                                        <TableRow>
                                          <TableCell colSpan={4} className="bg-gray-50">
                                            <div className="p-2">
                                              <h4 className="font-semibold mb-2">Form Data:</h4>
                                              {renderFormDataDetails(submission.formData)}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {allForms.map(form => (
              <TabsContent key={form.id} value={`form-${form.id}`}>
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <CardTitle>{form.title}</CardTitle>
                        {groupedSubmissions[form.title]?.[0]?._deletedForm && (
                          <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200">
                            Deleted Form
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const formSubmissions = groupedSubmissions[form.title] || [];
                            exportFormData(form.title, formSubmissions);
                          }}
                        >
                          <FileDown className="mr-2 h-4 w-4" />
                          Export CSV
                        </Button>
                        {!groupedSubmissions[form.title]?.[0]?._deletedForm && (
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteForm(form)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Form
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {form.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!groupedSubmissions[form.title] || groupedSubmissions[form.title].length === 0 ? (
                      <p>No submissions for this form yet.</p>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Submission ID</TableHead>
                              <TableHead>User</TableHead>
                              <TableHead>Submission Date</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupedSubmissions[form.title]?.map((submission) => (
                              <React.Fragment key={submission.id}>
                                <TableRow>
                                  <TableCell>{submission.id}</TableCell>
                                  <TableCell>
                                    {submission.user?.username || 'Unknown user'}<br />
                                    <span className="text-xs text-gray-500">{submission.user?.email || 'No email'}</span>
                                  </TableCell>
                                  <TableCell>
                                    {submission.createdAt ? format(new Date(submission.createdAt), 'yyyy-MM-dd HH:mm') : 'Unknown date'}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setExpandedSubmission(expandedSubmission === submission.id ? null : submission.id)}
                                    >
                                      {expandedSubmission === submission.id ? 'Hide Details' : 'View Details'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {expandedSubmission === submission.id && (
                                  <TableRow>
                                    <TableCell colSpan={4} className="bg-gray-50">
                                      <div className="p-2">
                                        <h4 className="font-semibold mb-2">Form Data:</h4>
                                        {renderFormDataDetails(submission.formData)}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default FormSubmissionsAdmin;