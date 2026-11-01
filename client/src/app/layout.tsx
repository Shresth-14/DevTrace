import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dev Trace — Understand the why behind every line of code",
  description:
    "The memory layer for software teams. Dev Trace connects GitHub issues, pull requests and discussions to preserve the technical decisions behind your codebase.",
  icons: { icon: "/assets/devtracelogo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} scroll-smooth`}
    >
      <body className="antialiased min-h-screen bg-[#F7F5ED] text-[#41463B] font-sans selection:bg-[#DCE6D3] selection:text-[#2E332A]">
        {children}
      </body>
    </html>
  );
}
