import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cellulaML",
  description:
    "Drop an .h5ad file. See your single-cell analysis instantly, with calibrated ML cell-type annotation. Everything runs in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
