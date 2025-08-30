import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <DynamicSEOHead
        customTitle="الصفحة غير موجودة"
        customDescription="الصفحة المطلوبة غير موجودة. العودة إلى منصة إدرس للكتب الرقمية."
        noindex={true}
      />
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">عذراً! الصفحة غير موجودة</p>
        <a href="/" className="text-primary underline hover:opacity-80 transition-opacity">
          العودة إلى الرئيسية
        </a>
      </div>
    </div>
  );
};

export default NotFound;
