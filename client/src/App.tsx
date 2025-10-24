import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import InstagramHome from "@/pages/InstagramHome";
import TikTokHome from "@/pages/TikTokHome";
import DetailInfo from "@/pages/DetailInfo";
import FamilyPolicy from "@/pages/FamilyPolicy";
import Admin from "@/pages/Admin";
import Services from "@/pages/Services";
import Reviews from "@/pages/Reviews";
import Pricing from "@/pages/Pricing";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/ig" component={InstagramHome}/>
      <Route path="/tt" component={TikTokHome}/>
      <Route path="/detail-info" component={DetailInfo}/>
      <Route path="/family-policy" component={FamilyPolicy}/>
      <Route path="/admin" component={Admin}/>
      <Route path="/services" component={Services}/>
      <Route path="/reviews" component={Reviews}/>
      <Route path="/pricing" component={Pricing}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
