import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Redirect } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useMemo } from "react"; 
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLocation } from "wouter";

type LoginData = Pick<InsertUser, "username" | "password">;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [location] = useLocation();
  
  // Check if there's a tab parameter in the URL
  const activeTab = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('tab') === 'register' ? 'register' : 'login';
  }, [location]);

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(insertUserSchema.pick({ username: true, password: true })),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const [showBadgeHolderQuestions, setShowBadgeHolderQuestions] = useState(false);

  const registerForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      password: "",
      isResident: false,
      avatarUrl: null,
      // Resident verification fields
      isLocalResident: false,
      ownsHomeInBB: false,
      rentsHomeInBB: false,
      isFullTimeResident: false,
      isSnowbird: false,
      hasMembershipBadge: false,
      membershipBadgeNumber: "",
      buysDayPasses: false,
      // Non-resident fields
      hasLivedInBB: false,
      hasVisitedBB: false,
      neverVisitedBB: false,
      hasFriendsInBB: false,
      consideringMovingToBB: false,
      wantToDiscoverBB: false,
      neverHeardOfBB: false
    }
  });

  // Auto-calculate resident status based on survey answers
  useEffect(() => {
    const watchLocalResident = registerForm.watch("isLocalResident");
    const watchOwnsHome = registerForm.watch("ownsHomeInBB");
    const watchFullTime = registerForm.watch("isFullTimeResident");
    const watchSnowbird = registerForm.watch("isSnowbird");
    const watchMembershipBadge = registerForm.watch("hasMembershipBadge");

    // If any of these criteria are true, consider them a Badge Holder
    // Note: These criteria determine badge holder status but aren't explicitly shown to users
    const isBadgeHolderByCriteria = watchLocalResident || watchOwnsHome || watchFullTime || watchSnowbird || watchMembershipBadge;

    if (isBadgeHolderByCriteria) {
      registerForm.setValue("isResident", true);
    } else {
      registerForm.setValue("isResident", false);
    }

    // Show survey questions after the first section is filled out
    const username = registerForm.watch("username");
    const password = registerForm.watch("password");
    const email = registerForm.watch("email");
    const fullName = registerForm.watch("fullName");

    if (username && password && email && fullName) {
      setShowBadgeHolderQuestions(true);
    }
  }, [
    // Badge holder criteria fields
    registerForm.watch("isLocalResident"),
    registerForm.watch("ownsHomeInBB"),
    registerForm.watch("isFullTimeResident"),
    registerForm.watch("isSnowbird"),
    registerForm.watch("hasMembershipBadge"),
    // Additional resident survey fields
    registerForm.watch("rentsHomeInBB"),
    registerForm.watch("buysDayPasses"),
    // Non-resident survey fields
    registerForm.watch("hasLivedInBB"),
    registerForm.watch("hasVisitedBB"),
    registerForm.watch("neverVisitedBB"),
    registerForm.watch("hasFriendsInBB"),
    registerForm.watch("consideringMovingToBB"),
    registerForm.watch("wantToDiscoverBB"),
    registerForm.watch("neverHeardOfBB"),
    // Registration fields for showing the survey
    registerForm.watch("username"),
    registerForm.watch("password"),
    registerForm.watch("email"),
    registerForm.watch("fullName")
  ]);

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex min-h-[80vh] px-4 py-6 md:py-8">
      <Card className="w-full max-w-4xl mx-auto shadow-md border-0">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl md:text-3xl">Welcome to Barefoot Bay</CardTitle>
          <CardDescription className="text-sm md:text-base">Join our community to access the Rocket Docket and Current Temp features!</CardDescription>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <Tabs defaultValue={activeTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" className="text-base">Login</TabsTrigger>
              <TabsTrigger value="register" className="text-base">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium mb-1">Username</FormLabel>
                        <FormControl>
                          <Input 
                            type="text"
                            placeholder="Enter your username"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium mb-1">Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder="Enter your password"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full py-6 mt-4 rounded-md text-base font-medium bg-coral hover:bg-coral/90 text-white border-0 shadow-none" 
                    disabled={loginMutation.isPending}
                    variant="coral"
                  >
                    {loginMutation.isPending ? "Logging in..." : "Login"}
                  </Button>
                  
                  <div className="text-sm text-center mt-4">
                    <a href="/forgot-password" className="text-primary hover:underline">
                      Forgot your password?
                    </a>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="register">
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={registerForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input 
                            type="text"
                            placeholder="Enter your full name"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="Enter your email"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input 
                            type="text"
                            placeholder="Choose a username"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder="Choose a password"
                            className="py-6 px-4 text-base rounded-md"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
{/* Badge Holder status is determined based on survey responses, but not displayed to users */}

                  {showBadgeHolderQuestions && (
                    <div className="mt-4 border rounded-md p-4 bg-slate-50">
                      <h3 className="text-lg font-medium mb-3">Welcome! Please help us get to know you by answering the following questions below</h3>
                      <p className="text-sm text-muted-foreground mb-4">BarefootBay.com Survey Questions (check those that apply):</p>
                      
                      <div className="mb-4">
                        <h4 className="font-medium mb-2">Resident of Barefoot Bay:</h4>
                        <div className="space-y-3 pl-2">
                          <FormField
                            control={registerForm.control}
                            name="ownsHomeInBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I own a home in Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="rentsHomeInBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I rent a home in Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="hasMembershipBadge"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I have a Barefoot Bay Membership Badge
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          {registerForm.watch("hasMembershipBadge") && (
                            <FormField
                              control={registerForm.control}
                              name="membershipBadgeNumber"
                              render={({ field }) => (
                                <FormItem className="ml-6">
                                  <FormLabel>Membership Badge Number</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="text"
                                      placeholder="Enter your badge number"
                                      className="py-6 px-4 text-base rounded-md"
                                      {...field}
                                      value={field.value || ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          <FormField
                            control={registerForm.control}
                            name="buysDayPasses"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I buy day/month passes for social events
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="isFullTimeResident"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I am a full-time resident
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="isSnowbird"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I am a part-time resident (snowbird)
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Not a Resident of Barefoot Bay:</h4>
                        <div className="space-y-3 pl-2">
                          <FormField
                            control={registerForm.control}
                            name="isLocalResident"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I live in the 32976 zipcode
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="hasLivedInBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I previously lived in Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="hasVisitedBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I've visited Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="neverVisitedBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I've never been to Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="hasFriendsInBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I have friends/relatives in Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="consideringMovingToBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I am considering moving to Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="wantToDiscoverBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I want to discover Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="neverHeardOfBB"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    I've never heard of Barefoot Bay
                                  </FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full py-6 mt-4 rounded-md text-base font-medium bg-coral hover:bg-coral/90 text-white border-0 shadow-none" 
                    disabled={registerMutation.isPending}
                    variant="coral"
                  >
                    {registerMutation.isPending ? "Creating account..." : "Register"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}