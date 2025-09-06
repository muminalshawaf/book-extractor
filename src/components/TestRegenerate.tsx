import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const TestRegenerate = () => {
  const testEdgeFunction = async () => {
    console.log('🔥 TEST: Starting edge function test');
    
    try {
      const response = await supabase.functions.invoke('regenerate-page-summary', {
        body: { 
          book_id: 'chem12-1-3', 
          page_number: 125 
        }
      });

      console.log('🔥 TEST: Edge function response:', response);
      
      if (response.error) {
        console.error('🔥 TEST: Error:', response.error);
        toast.error('Edge function failed: ' + JSON.stringify(response.error));
      } else {
        console.log('🔥 TEST: Success:', response.data);
        toast.success('Edge function worked: ' + JSON.stringify(response.data));
      }
    } catch (error) {
      console.error('🔥 TEST: Exception:', error);
      toast.error('Exception: ' + error.message);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999]">
      <Button 
        onClick={testEdgeFunction}
        className="bg-red-500 hover:bg-red-600 text-white"
      >
        🔥 Test Regenerate Function
      </Button>
    </div>
  );
};