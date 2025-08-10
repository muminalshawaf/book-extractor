import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  ThumbsUp, 
  ThumbsDown, 
  Copy, 
  Share, 
  MoreVertical,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageActionsProps {
  messageText: string;
  rtl?: boolean;
}

const MessageActions: React.FC<MessageActionsProps> = ({ messageText, rtl = false }) => {
  const [likeState, setLikeState] = useState<'like' | 'dislike' | null>(null);
  const [shareDropdownOpen, setShareDropdownOpen] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(messageText).then(() => {
      toast({
        description: rtl ? "تم نسخ النص!" : "Text copied!",
        duration: 2000,
      });
    });
  };

  const handleReaction = (type: 'like' | 'dislike') => {
    setLikeState(likeState === type ? null : type);
  };

  const shareMessage = (platform: string) => {
    const text = encodeURIComponent(messageText);
    const url = encodeURIComponent(window.location.href);
    let shareUrl = '';

    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${text}`;
        break;
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
        break;
      case 'x':
        shareUrl = `https://twitter.com/intent/tweet?text=${text}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
        break;
      case 'sms':
        shareUrl = `sms:?&body=${text}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
    setShareDropdownOpen(false);
  };

  return (
    <div className={cn("flex items-center gap-4 text-muted-foreground mt-4", rtl && "flex-row-reverse")}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleReaction('like')}
        className={cn(
          "hover:text-foreground transition-colors",
          likeState === 'like' && "text-primary bg-primary/10"
        )}
        title={rtl ? "أعجبني" : "Like"}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleReaction('dislike')}
        className={cn(
          "hover:text-foreground transition-colors",
          likeState === 'dislike' && "text-primary bg-primary/10"
        )}
        title={rtl ? "لم يعجبني" : "Dislike"}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={copyToClipboard}
        className="hover:text-foreground transition-colors"
        title={rtl ? "نسخ" : "Copy"}
      >
        <Copy className="h-4 w-4" />
      </Button>

      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShareDropdownOpen(!shareDropdownOpen)}
          className="hover:text-foreground transition-colors"
          title={rtl ? "مشاركة" : "Share"}
        >
          <Share className="h-4 w-4" />
        </Button>
        
        {shareDropdownOpen && (
          <div className={cn(
            "absolute bottom-full mb-2 bg-background border rounded-lg shadow-lg p-2 min-w-[150px] z-50",
            rtl ? "right-0" : "left-0"
          )}>
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shareMessage('whatsapp')}
                className={cn("justify-start gap-2", rtl && "flex-row-reverse")}
              >
                <MessageSquare className="h-4 w-4" />
                {rtl ? "واتساب" : "WhatsApp"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shareMessage('telegram')}
                className={cn("justify-start gap-2", rtl && "flex-row-reverse")}
              >
                <MessageSquare className="h-4 w-4" />
                {rtl ? "تليجرام" : "Telegram"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shareMessage('x')}
                className={cn("justify-start gap-2", rtl && "flex-row-reverse")}
              >
                <MessageSquare className="h-4 w-4" />
                {rtl ? "إكس" : "X"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shareMessage('facebook')}
                className={cn("justify-start gap-2", rtl && "flex-row-reverse")}
              >
                <MessageSquare className="h-4 w-4" />
                {rtl ? "فيسبوك" : "Facebook"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shareMessage('sms')}
                className={cn("justify-start gap-2", rtl && "flex-row-reverse")}
              >
                <MessageSquare className="h-4 w-4" />
                {rtl ? "رسالة نصية" : "SMS"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="hover:text-foreground transition-colors"
        title={rtl ? "المزيد" : "More"}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default MessageActions;