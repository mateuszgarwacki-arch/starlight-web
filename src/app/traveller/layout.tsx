import Script from "next/script";

export default function TravellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
