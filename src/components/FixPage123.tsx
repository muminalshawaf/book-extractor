import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const FixPage123 = () => {
  const fixPage123 = async () => {
    console.log('🔧 Fixing page 123 summary...');
    
    try {
      const response = await supabase.functions.invoke('regenerate-page-summary', {
        body: { 
          book_id: 'chem12-1-3', 
          page_number: 123 
        }
      });

      if (response.error) {
        console.error('🔧 Error fixing page 123:', response.error);
        toast.error('Failed to fix page 123: ' + JSON.stringify(response.error));
      } else {
        console.log('🔧 Page 123 fixed:', response.data);
        toast.success('Page 123 summary cleared! Refresh to see new summary.');
      }
    } catch (error) {
      console.error('🔧 Exception fixing page 123:', error);
      toast.error('Exception: ' + error.message);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <Button 
        onClick={fixPage123}
        className="bg-green-500 hover:bg-green-600 text-white"
      >
        🔧 Fix Page 123
      </Button>
    </div>
  );
};