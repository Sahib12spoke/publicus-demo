import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./theme-provider";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "Grant Radar — Canadian Grants Intelligence",
  description: "Competitive grants intelligence for Canadian B2G businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme') || 'dark';
                document.documentElement.setAttribute('data-theme', t);
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <div className="site-wrapper">
            <Nav />
            <main className="container">{children}</main>
            <footer className="site-footer">
              <span>grant_radar — Canadian government grants intelligence</span>
              <span>data: open.canada.ca</span>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
