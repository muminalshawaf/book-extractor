import React from "react";
import { cn } from "@/lib/utils";

interface WelcomeMessageProps {
  rtl?: boolean;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ rtl = false }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 md:w-20 md:h-20 mb-6 bg-muted rounded-full flex items-center justify-center">
        <svg 
          className="w-9 h-9 md:w-10 md:h-10 text-muted-foreground" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 className="text-xl md:text-2xl font-semibold mb-4 text-primary">
        {rtl ? "مرحباً!" : "Hello!"}
      </h2>
      <p className="text-base md:text-lg text-muted-foreground max-w-md">
        {rtl ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}
      </p>
    </div>
  );
};

export default WelcomeMessage;